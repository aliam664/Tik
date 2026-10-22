-- =============================================================================
-- Migration 0019: Security Grants, Simultaneous Rematch Idempotency,
--                 Cross-Game Room Code Uniqueness & Automated Cleanup
-- =============================================================================

-- 1. Global cross-game room code existence check across ALL 4 DOZ ONLINE titles
create or replace function public.room_code_exists_anywhere(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.rooms where room_code = p_code)
      or exists (select 1 from public.ln_rooms where room_code = p_code)
      or exists (select 1 from public.wg_rooms where room_code = p_code)
      or exists (select 1 from public.cb_rooms where room_code = p_code);
$$;

-- 2. Upgrade wg_create_room & cb_create_room to guarantee global 6-char room code uniqueness
create or replace function public.wg_create_room(
  p_display_name text,
  p_rules jsonb default '{}'::jsonb,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet := public.get_client_ip();
  v_settings public.platform_settings;
  v_name text;
  v_rules jsonb;
  v_code text;
  v_token text;
  v_profile_id uuid := null;
  v_room public.wg_rooms;
  v_tries integer := 0;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.maintenance_mode then
    raise exception 'MAINTENANCE';
  end if;
  if not public.rate_limit_check('wg_create', v_ip, v_settings.max_rooms_per_ip_per_hour, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_rules := public.wg_resolve_rules(p_rules);

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_room_code();
    exit when not public.room_code_exists_anywhere(v_code);
    if v_tries >= 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
  end loop;

  insert into public.wg_rooms (
    room_code, status, max_players, total_rounds, rules,
    expires_at
  )
  values (
    v_code, 'waiting', 2, (v_rules ->> 'totalRounds')::integer, v_rules,
    now() + make_interval(hours => coalesce(v_settings.room_ttl_hours, 3))
  )
  returning * into v_room;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.wg_room_players (
    room_id, seat, is_host, display_name, token_hash, profile_id, ready
  )
  values (
    v_room.id, 1, true, v_name, public.hash_token(v_token), v_profile_id, true
  );

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 1,
    'my_role', null,
    'state', public.wg_project_state(v_room, 1)
  );
end;
$$;

create or replace function public.cb_create_room(
  p_display_name text,
  p_max_attempts integer default null,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet := public.get_client_ip();
  v_settings public.platform_settings;
  v_name text := public.validate_display_name(p_display_name);
  v_code text := '';
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_profile_id uuid := null;
  v_room public.cb_rooms;
  v_try int := 0;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.maintenance_mode then
    raise exception 'MAINTENANCE';
  end if;
  if not public.rate_limit_check('cb_create', v_ip, coalesce(v_settings.max_rooms_per_ip_per_hour, 25), interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_max_attempts is not null and (p_max_attempts < 4 or p_max_attempts > 50) then
    raise exception 'INVALID_SETTING';
  end if;

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
    v_code := public.generate_room_code();
    exit when not public.room_code_exists_anywhere(v_code);
  end loop;

  insert into public.cb_rooms (room_code, status, current_round, max_attempts_per_player)
  values (v_code, 'waiting', 1, p_max_attempts)
  returning * into v_room;

  insert into public.cb_room_players (room_id, seat, display_name, player_token_hash, profile_id, is_ready)
  values (v_room.id, 1, v_name, public.hash_token(v_token), v_profile_id, false);

  insert into public.cb_rounds (room_id, round_number, secret_code, started_at)
  values (v_room.id, 1, null, null);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 1,
    'state', public.cb_project_state(v_room, 1)
  );
end;
$$;

-- 3. Make cb_rematch concurrent-click idempotent:
--    If Player 1 already transitioned finished -> waiting, Player 2 clicking Rematch
--    never throws REMATCH_NOT_ALLOWED — instead it cleanly confirms readiness in lobby!
create or replace function public.cb_rematch(
  p_room_code text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.cb_rooms;
  v_player public.cb_room_players;
  v_prev_round public.cb_rounds;
  v_winner_name text := null;
  v_total_guesses int := 0;
  v_duration_ms bigint := 0;
  v_archive_entry jsonb;
  v_next_round int;
begin
  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player
  from public.cb_room_players
  where room_id = v_room.id and player_token_hash = public.hash_token(btrim(coalesce(p_token, '')));
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  -- Concurrent click guard: if the other player JUST clicked Rematch milliseconds ago,
  -- delegate seamlessly to cb_project_state without throwing an error toast!
  if v_room.status = 'waiting' or v_room.status = 'active' then
    return jsonb_build_object(
      'room_code', v_room.room_code,
      'seat', v_player.seat,
      'state', public.cb_project_state(v_room, v_player.seat)
    );
  end if;

  if v_room.status <> 'finished' then
    raise exception 'REMATCH_NOT_ALLOWED';
  end if;

  select * into v_prev_round
  from public.cb_rounds
  where room_id = v_room.id and round_number = v_room.current_round;

  if v_prev_round.winner_seat is not null then
    select display_name into v_winner_name
    from public.cb_room_players
    where room_id = v_room.id and seat = v_prev_round.winner_seat;
  end if;

  select count(*)::int into v_total_guesses
  from public.cb_guesses
  where round_id = v_prev_round.id;

  if v_prev_round.started_at is not null and v_prev_round.ended_at is not null then
    v_duration_ms := greatest(
      0,
      floor(extract(epoch from (v_prev_round.ended_at - v_prev_round.started_at)) * 1000)::bigint
    );
  end if;

  v_archive_entry := jsonb_build_object(
    'round_number', v_prev_round.round_number,
    'secret_code', v_prev_round.secret_code,
    'winner_seat', v_prev_round.winner_seat,
    'winner_name', v_winner_name,
    'started_at', v_prev_round.started_at,
    'ended_at', v_prev_round.ended_at,
    'duration_ms', v_duration_ms,
    'total_guesses', v_total_guesses
  );

  v_next_round := v_room.current_round + 1;

  update public.cb_room_players
  set is_ready = false,
      last_seen_at = clock_timestamp()
  where room_id = v_room.id;

  insert into public.cb_rounds (room_id, round_number, secret_code, started_at)
  values (v_room.id, v_next_round, null, null);

  update public.cb_rooms
  set status = 'waiting',
      current_round = v_next_round,
      past_rounds = coalesce(past_rounds, '[]'::jsonb) || jsonb_build_array(v_archive_entry),
      version = version + 1,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '6 hours'
  where id = v_room.id
  returning * into v_room;

  perform public.cb_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'seat', v_player.seat,
    'state', public.cb_project_state(v_room, v_player.seat)
  );
end;
$$;

-- 4. Automated housekeeping across ALL 4 games (`rooms`, `ln_rooms`, `wg_rooms`, `cb_rooms`)
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow record;
begin
  for v_escrow in
    select e.* from public.stake_escrows e
    left join public.rooms r on r.id = e.room_id
    where e.status = 'locked'
      and (r.id is null or r.expires_at < now() or r.status in ('closed', 'finished'))
      and e.created_at < now() - interval '10 minutes'
    for update of e
  loop
    update public.stake_escrows set status = 'refunded', settled_at = now() where id = v_escrow.id;
    perform public.coins_grant(v_escrow.player_id, v_escrow.amount, 'stake_refund',
      v_escrow.room_id, 'بازگشت ورودی (اتاق بسته شد)');
  end loop;

  delete from public.rooms where expires_at < now() - interval '1 hour';
  delete from public.ln_rooms where expires_at < now() - interval '1 hour';
  delete from public.wg_rooms where expires_at < now() - interval '1 hour';
  delete from public.cb_rooms where expires_at < now() - interval '1 hour';
  delete from public.cb_request_log where created_at < now() - interval '1 day';
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.admin_sessions where expires_at < now();
  delete from public.matchmaking_tickets
  where (status = 'searching' and enqueued_at < now() - interval '30 minutes')
     or (closed_at is not null and closed_at < now() - interval '2 days');
end;
$$;

-- 5. Least-privilege lockdown: revoke ALL direct execution of internal helpers from PUBLIC/anon/authenticated
revoke all on function public.room_code_exists_anywhere(text) from public, anon, authenticated;
revoke all on function public.wg_clue_leaks_target(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.wg_check_round_timeout(uuid) from public, anon, authenticated;
revoke all on function public.cb_normalize_code4(text) from public, anon, authenticated;
revoke all on function public.cb_generate_secret_code4() from public, anon, authenticated;
revoke all on function public.cb_evaluate_guess(text, text) from public, anon, authenticated;
revoke all on function public.cb_check_rate(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.cb_broadcast_state(uuid) from public, anon, authenticated;
revoke all on function public.cb_project_state(public.cb_rooms, integer) from public, anon, authenticated;
revoke all on function public.cleanup_expired_data() from public, anon, authenticated;

-- Explicitly ensure ONLY the 11 wg_* and 7 cb_* public entrypoints are callable by browser clients
grant execute on function public.wg_create_room(text, jsonb, text) to anon, authenticated;
grant execute on function public.wg_join_room(text, text, text) to anon, authenticated;
grant execute on function public.wg_get_room_state(text, text, boolean) to anon, authenticated;
grant execute on function public.wg_set_ready(text, text, boolean) to anon, authenticated;
grant execute on function public.wg_select_target(text, text, text) to anon, authenticated;
grant execute on function public.wg_submit_clue(text, text, text, text, text) to anon, authenticated;
grant execute on function public.wg_request_hint(text, text, text) to anon, authenticated;
grant execute on function public.wg_submit_guess(text, text, text, text) to anon, authenticated;
grant execute on function public.wg_next_round(text, text, integer) to anon, authenticated;
grant execute on function public.wg_rematch(text, text) to anon, authenticated;
grant execute on function public.wg_leave_room(text, text) to anon, authenticated;

grant execute on function public.cb_create_room(text, integer, text) to anon, authenticated;
grant execute on function public.cb_join_room(text, text, text) to anon, authenticated;
grant execute on function public.cb_set_ready(text, text, boolean) to anon, authenticated;
grant execute on function public.cb_get_room_state(text, text, boolean) to anon, authenticated;
grant execute on function public.cb_submit_guess(text, text, text) to anon, authenticated;
grant execute on function public.cb_rematch(text, text) to anon, authenticated;
grant execute on function public.cb_leave_room(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
