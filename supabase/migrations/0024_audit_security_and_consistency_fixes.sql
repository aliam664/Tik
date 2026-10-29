-- DOZ ONLINE — 0024: Audit security & cross-game consistency fixes.
-- 1. admin_crash_ops: redact active-round crash_point until phase = 'crashed' (prevent pre-crash provably-fair leak).
-- 2. crash_get_state: coalesce(cb.player_id = v_player, false) so anonymous spectators receive boolean false instead of null.
-- 3. cb_join_room: enforce platform maintenance_mode + IP join rate limiting consistent with join_room / wg_join_room / ln_join_room.
-- 4. create_room & ln_create_room: enforce cross-game 6-char room_code_exists_anywhere uniqueness for unambiguous /join dispatch.

create or replace function public.crash_get_state(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.crash_rounds;
  v_player uuid := null;
  v_balance bigint := null;
  v_wagered bigint := 0;
  v_paid bigint := 0;
  v_cap integer := public.cfg_int('stake_daily_loss_cap', 300);
begin
  v_row := public.crash_advance_locked();
  if nullif(btrim(coalesce(p_token, '')), '') is not null then
    select id into v_player
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_token)) and status = 'active';
    if not found then
      raise exception 'PLAYER_UNAUTHORIZED';
    end if;
    select balance into v_balance from public.wallets where player_id = v_player;
    select
      coalesce(-sum(amount) filter (where reason = 'crash_bet'), 0),
      coalesce(sum(amount) filter (where reason = 'crash_payout'), 0)
    into v_wagered, v_paid
    from public.wallet_ledger
    where player_id = v_player
      and reason in ('crash_bet', 'crash_payout')
      and created_at >= date_trunc('day', now());
  end if;

  return jsonb_build_object(
    'round', public.crash_public_round(v_row) || jsonb_build_object('server_now', clock_timestamp()),
    'history', coalesce((
      select jsonb_agg(h order by h.index desc)
      from (
        select round_index as index, crash_point, crashed_at, seed_hash, seed, salt
        from public.crash_rounds
        where phase = 'crashed' and id <> v_row.id
        order by round_index desc
        limit 18
      ) h
    ), '[]'::jsonb),
    'bets', coalesce((
      select jsonb_agg(b order by b.created_at asc)
      from (
        select
          cb.id,
          cb.slot,
          cb.amount,
          cb.auto_at,
          cb.cashed_at,
          cb.payout,
          pp.display_name as name,
          coalesce(cb.player_id = v_player, false) as is_me,
          cb.created_at
        from public.crash_bets cb
        join public.player_profiles pp on pp.id = cb.player_id
        where cb.round_id = v_row.id
        order by cb.created_at asc
        limit 100
      ) b
    ), '[]'::jsonb),
    'wallet', jsonb_build_object('balance', v_balance),
    'stats', jsonb_build_object(
      'wagered_today', v_wagered,
      'paid_today', v_paid,
      'pnl_today', v_paid - v_wagered,
      'loss_today', case when v_player is null then 0 else public.arcade_daily_loss(v_player) end,
      'daily_loss_cap', v_cap
    ),
    'limits', jsonb_build_object('min_bet', 10, 'max_bet', 500, 'max_slots', 2, 'house_edge_bps', 100)
  );
end;
$$;

create or replace function public.admin_crash_ops(p_admin_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_row public.crash_rounds;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'view');
  v_row := public.crash_advance_locked();
  return jsonb_build_object(
    'ok', true,
    'source', 'rpc',
    'server_now', clock_timestamp(),
    'round', public.crash_public_round(v_row),
    'kpis', jsonb_build_object(
      'rounds_total', (select count(*)::int from public.crash_rounds),
      'rounds_24h', (select count(*)::int from public.crash_rounds where created_at > now() - interval '24 hours'),
      'wagered', (select coalesce(sum(amount), 0)::bigint from public.crash_bets),
      'paid', (select coalesce(sum(payout), 0)::bigint from public.crash_bets),
      'bets', (select count(*)::int from public.crash_bets),
      'cashed', (select count(*)::int from public.crash_bets where cashed_at is not null)
    ),
    'recent', coalesce((
      select jsonb_agg(x order by x.index desc)
      from (
        select
          r.round_index as index,
          case when r.phase = 'crashed' then r.crash_point else null end as crash_point,
          r.seed_hash,
          r.salt,
          case when r.phase = 'crashed' then r.seed else null end as seed,
          r.phase,
          r.crashed_at,
          (select coalesce(sum(amount), 0) from public.crash_bets b where b.round_id = r.id) as volume,
          (select coalesce(sum(payout), 0) from public.crash_bets b where b.round_id = r.id) as paid
        from public.crash_rounds r
        order by r.round_index desc
        limit 40
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.cb_join_room(
  p_room_code text,
  p_display_name text,
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
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_name text;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_profile_id uuid := null;
  v_room public.cb_rooms;
  v_player_count int;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.maintenance_mode then
    raise exception 'MAINTENANCE';
  end if;
  if not public.rate_limit_check('cb_join', v_ip, coalesce(v_settings.max_joins_per_ip_per_hour, 60), interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_name := public.validate_display_name(p_display_name);

  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status in ('abandoned', 'expired') or v_room.expires_at <= clock_timestamp() then
    raise exception 'ROOM_EXPIRED';
  end if;

  select count(*) into v_player_count from public.cb_room_players where room_id = v_room.id;
  if v_player_count >= 2 then
    raise exception 'ROOM_FULL';
  end if;

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  insert into public.cb_room_players (room_id, seat, display_name, player_token_hash, profile_id, is_ready)
  values (v_room.id, 2, v_name, public.hash_token(v_token), v_profile_id, false);

  update public.cb_rooms
  set version = version + 1, updated_at = clock_timestamp()
  where id = v_room.id
  returning * into v_room;

  perform public.cb_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 2,
    'state', public.cb_project_state(v_room, 2)
  );
end;
$$;

create or replace function public.create_room(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_ip inet;
  v_ttl integer;
  v_max_rooms integer;
  v_code text;
  v_room_id uuid;
  v_token text;
  v_attempts integer := 0;
  v_created boolean := false;
begin
  select ps.room_ttl_hours, ps.max_rooms_per_ip_per_hour
  into v_ttl, v_max_rooms
  from public.platform_settings ps where ps.id = 1;

  if (select ps.maintenance_mode from public.platform_settings ps where id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('create_room', v_ip, v_max_rooms, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  if get_byte(extensions.gen_random_bytes(1), 0) < 26 then
    perform public.cleanup_expired_data();
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  while v_attempts < 20 and not v_created loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_room_code();
    if public.room_code_exists_anywhere(v_code) then
      continue;
    end if;
    begin
      insert into public.rooms (room_code, expires_at)
      values (v_code, now() + make_interval(hours => v_ttl))
      returning id into v_room_id;
      v_created := true;
    exception
      when unique_violation then
        v_created := false;
    end;
  end loop;

  if not v_created then
    raise exception 'CODE_GENERATION_FAILED';
  end if;

  insert into public.room_players (room_id, symbol, display_name, token_hash)
  values (v_room_id, 'X', v_name, public.hash_token(v_token));

  insert into public.game_events (room_id, event_type, payload)
  values (v_room_id, 'room_created', jsonb_build_object('by_symbol', 'X'));

  perform public.broadcast_room_state(v_room_id);

  return jsonb_build_object(
    'room_code', v_code,
    'room_id', v_room_id,
    'player_token', v_token,
    'symbol', 'X'
  );
end;
$$;

create or replace function public.ln_create_room(
  p_display_name text,
  p_max_players integer default 2,
  p_mode text default 'coop',
  p_stake integer default 0,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_ip inet;
  v_ttl integer;
  v_max_rooms integer;
  v_code text;
  v_room public.ln_rooms;
  v_token text;
  v_profile_id uuid := null;
  v_attempts integer := 0;
  v_created boolean := false;
  v_max_p integer := case when coalesce(p_max_players, 2) = 3 then 3 else 2 end;
  v_mode text := case when p_mode in ('coop', 'ranked', 'stakes') then p_mode else 'coop' end;
begin
  select ps.room_ttl_hours, ps.max_rooms_per_ip_per_hour
  into v_ttl, v_max_rooms
  from public.platform_settings ps where ps.id = 1;

  if (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('create_room', v_ip, v_max_rooms * 2, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  if coalesce(btrim(p_profile_token), '') <> '' then
    begin
      v_profile_id := public.assert_player_token(p_profile_token);
    exception when others then
      v_profile_id := null;
    end;
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  while v_attempts < 20 and not v_created loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_room_code();
    if public.room_code_exists_anywhere(v_code) then
      continue;
    end if;
    begin
      insert into public.ln_rooms (
        room_code, status, mode, stake, max_players, wave, map_id, phase,
        sheriff_coins, total_coins_earned, objectives, expires_at
      )
      values (
        v_code, 'waiting', v_mode, greatest(0, coalesce(p_stake, 0)), v_max_p,
        1, 'cursed_village', 'prep',
        180, 180, public.ln_default_objectives('cursed_village'),
        now() + make_interval(hours => v_ttl)
      )
      returning * into v_room;
      v_created := true;
    exception
      when unique_violation then
        v_created := false;
    end;
  end loop;

  if not v_created then
    raise exception 'CODE_GENERATION_FAILED';
  end if;

  insert into public.ln_room_players (
    room_id, seat, hero_class, display_name, token_hash, profile_id, pos_x, pos_y
  )
  values (
    v_room.id, 1, 'warden', v_name, public.hash_token(v_token), v_profile_id, 600, 460
  );

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'room_created', jsonb_build_object('seat', 1, 'name', v_name));

  select * into v_room from public.ln_rooms where id = v_room.id;
  perform public.ln_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 1,
    'state', public.ln_room_public_state(v_room)
  );
end;
$$;

revoke all on function public.crash_get_state(text) from public, anon, authenticated;
revoke all on function public.admin_crash_ops(text) from public, anon, authenticated;
grant execute on function public.crash_get_state(text) to anon, authenticated;
grant execute on function public.admin_crash_ops(text) to anon, authenticated;
grant execute on function public.cb_join_room(text, text, text) to anon, authenticated;
grant execute on function public.create_room(text) to anon, authenticated;
grant execute on function public.ln_create_room(text, integer, text, integer, text) to anon, authenticated;

notify pgrst, 'reload schema';
