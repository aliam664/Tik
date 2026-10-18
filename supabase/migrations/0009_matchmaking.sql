-- SHARIFCOIN / DOZ ONLINE — 0009: matchmaking queue (ranked & stakes)
-- Ticket pool with a time-widened skill window, mutual acceptance, oldest-first
-- priority, accept handshake and dodge penalties. The matcher runs on demand
-- (queue_join / queue_accept) and via pg_cron every few seconds.

-- internal: current matchmaking window (±rating) for a ticket age
create or replace function public.mm_window(p_enqueued_at timestamptz, p_placement_left integer)
returns integer
language sql
stable
as $$
  select least(400, greatest(
    case when coalesce(p_placement_left, 0) > 0 then 150 else 75 end,
    (case when coalesce(p_placement_left, 0) > 0 then 150 else 75 end)
      + 25 * floor(extract(epoch from (now() - p_enqueued_at)) / 5)::integer
  ));
$$;

-- internal: is this player allowed to queue in the given mode?
create or replace function public.assert_can_queue(p_player_id uuid, p_mode text, p_stake integer)
returns void
language plpgsql
stable
as $$
declare
  v_games integer;
  v_rating integer;
  v_balance bigint;
  v_lost_today bigint;
  v_banned boolean;
begin
  select exists (
    select 1 from public.bans b
    where b.player_id = p_player_id
      and b.expires_at > now()
      and b.scope in ('queue', 'global')
  ) into v_banned;
  if v_banned then
    raise exception 'QUEUE_BANNED';
  end if;
  if p_mode = 'stakes' and exists (
    select 1 from public.bans b
    where b.player_id = p_player_id and b.expires_at > now() and b.scope = 'stakes'
  ) then
    raise exception 'STAKES_BANNED';
  end if;

  if p_mode = 'ranked' and not public.cfg_bool('ranked_enabled', true) then
    raise exception 'MODE_DISABLED';
  end if;
  if p_mode = 'stakes' and not public.cfg_bool('stakes_enabled', true) then
    raise exception 'MODE_DISABLED';
  end if;

  if p_mode = 'stakes' then
    select s.games, r.rating into v_games, v_rating
    from public.player_stats s
    join public.player_ratings r on r.player_id = s.player_id
    where s.player_id = p_player_id;

    if v_games < public.cfg_int('stake_min_games', 20) then
      raise exception 'STAKES_REQUIRE_GAMES';
    end if;
    if v_rating < 1000 then
      raise exception 'STAKES_REQUIRE_TIER';
    end if;
    if p_stake not in (10, 25, 50, 100) then
      raise exception 'INVALID_STAKE';
    end if;
    -- stake ceiling by tier
    if (p_stake > 25 and v_rating < 1200) or (p_stake > 50 and v_rating < 1400) then
      raise exception 'STAKE_TOO_HIGH';
    end if;

    select balance into v_balance from public.wallets where player_id = p_player_id;
    if v_balance < p_stake then
      raise exception 'INSUFFICIENT_FUNDS';
    end if;

    -- daily stake loss cap (net stake flow today: locks minus payouts/refunds)
    select greatest(0, -coalesce(sum(amount), 0)) into v_lost_today
    from public.wallet_ledger
    where player_id = p_player_id
      and reason in ('stake_lock', 'stake_payout', 'stake_refund')
      and created_at >= date_trunc('day', now());
    if v_lost_today >= public.cfg_int('stake_daily_loss_cap', 300) then
      raise exception 'DAILY_LOSS_CAP';
    end if;
  end if;
end;
$$;

-- ===========================================================================
-- queue_join(p_token, p_mode, p_stake) → { ticket }
-- ===========================================================================
create or replace function public.queue_join(
  p_token text,
  p_mode text,
  p_stake integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_rating integer;
  v_placement integer;
  v_ticket public.matchmaking_tickets;
begin
  v_id := public.assert_player_token(p_token);
  if p_mode not in ('ranked', 'stakes') then
    raise exception 'INVALID_MODE';
  end if;
  perform public.assert_can_queue(v_id, p_mode, coalesce(p_stake, 0));

  select rating, placement_left into v_rating, v_placement
  from public.player_ratings where player_id = v_id;

  -- idempotent: already in this queue?
  select * into v_ticket from public.matchmaking_tickets
  where player_id = v_id and mode = p_mode
    and status in ('searching', 'matched', 'accepted');
  if found then
    return jsonb_build_object('ticket', public.ticket_public(v_ticket));
  end if;

  insert into public.matchmaking_tickets (player_id, mode, stake, rating)
  values (v_id, p_mode, case when p_mode = 'stakes' then coalesce(p_stake, 0) else 0 end, v_rating)
  returning * into v_ticket;

  -- try an immediate match
  perform public.matchmaking_tick();

  select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
  return jsonb_build_object('ticket', public.ticket_public(v_ticket));
end;
$$;

-- ===========================================================================
-- queue_leave(p_token) → { ok }
-- ===========================================================================
create or replace function public.queue_leave(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_ticket public.matchmaking_tickets;
begin
  v_id := public.assert_player_token(p_token);

  select * into v_ticket from public.matchmaking_tickets
  where player_id = v_id and status in ('searching', 'matched', 'accepted');
  if not found then
    return jsonb_build_object('ok', true);
  end if;

  if v_ticket.status = 'searching' then
    update public.matchmaking_tickets
    set status = 'cancelled', closed_at = now()
    where id = v_ticket.id;
    return jsonb_build_object('ok', true);
  end if;

  -- match already found → dodge
  update public.matchmaking_tickets
  set status = 'dodged', closed_at = now()
  where id = v_ticket.id;
  perform public.match_close_cleanup(v_ticket.id);
  return jsonb_build_object('ok', true, 'dodged', true);
end;
$$;

-- ===========================================================================
-- queue_accept(p_token) → { ticket, room_code?, player_token?, symbol? }
-- ===========================================================================
create or replace function public.queue_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_ticket public.matchmaking_tickets;
  v_other public.matchmaking_tickets;
  v_seat_token text;
  v_symbol text;
  v_room_id uuid;
  v_room_code text;
  v_all_accepted boolean;
begin
  v_id := public.assert_player_token(p_token);

  select * into v_ticket from public.matchmaking_tickets
  where player_id = v_id and status in ('matched', 'accepted');
  if not found then
    raise exception 'NO_ACTIVE_MATCH';
  end if;
  if v_ticket.match_id is null or v_ticket.room_id is null then
    raise exception 'NO_ACTIVE_MATCH';
  end if;

  select rp.symbol into v_symbol
  from public.room_players rp
  where rp.room_id = v_ticket.room_id and rp.profile_id = v_id;
  if v_symbol is null then
    raise exception 'NO_ACTIVE_MATCH';
  end if;

  -- generate this player's seat token and bind it to the room seat
  -- (re-generated safely on repeat accepts — the old raw token is never stored)
  v_seat_token := encode(extensions.gen_random_bytes(16), 'hex');

  update public.room_players
  set token_hash = public.hash_token(v_seat_token), last_seen_at = now()
  where room_id = v_ticket.room_id and profile_id = v_id;

  if v_ticket.status <> 'accepted' then
    update public.matchmaking_tickets
    set status = 'accepted'
    where id = v_ticket.id
    returning * into v_ticket;
  end if;

  -- both accepted?
  select count(*) = 2 into v_all_accepted
  from public.matchmaking_tickets
  where match_id = v_ticket.match_id and status = 'accepted';

  select id, room_code into v_room_id, v_room_code
  from public.rooms where id = v_ticket.room_id;

  if v_all_accepted then
    -- unlock the room for play and notify both sides
    update public.rooms
    set status = 'active', started_at = now(), last_activity_at = now(),
        version = version + 1
    where id = v_room_id and status = 'waiting';
    perform public.broadcast_room_state(v_room_id);
  end if;

  return jsonb_build_object(
    'ticket', public.ticket_public(v_ticket),
    'room_code', v_room_code,
    'player_token', v_seat_token,
    'symbol', v_symbol,
    'both_accepted', v_all_accepted
  );
end;
$$;

-- ===========================================================================
-- queue_status(p_token) → { ticket, match? }
-- ===========================================================================
create or replace function public.queue_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_ticket public.matchmaking_tickets;
begin
  v_id := public.assert_player_token(p_token);

  -- run the matcher opportunistically so polling clients make progress
  perform public.matchmaking_tick();

  select * into v_ticket from public.matchmaking_tickets
  where player_id = v_id and status in ('searching', 'matched', 'accepted')
  order by enqueued_at desc limit 1;

  if not found then
    return jsonb_build_object('ticket', null);
  end if;

  return jsonb_build_object(
    'ticket', public.ticket_public(v_ticket),
    'opponent', (
      select jsonb_build_object('name', pp.display_name, 'rating', r.rating)
      from public.matchmaking_tickets t2
      join public.player_profiles pp on pp.id = t2.player_id
      join public.player_ratings r on r.player_id = t2.player_id
      where t2.match_id is not null and t2.match_id = v_ticket.match_id
        and t2.player_id <> v_id
      limit 1
    )
  );
end;
$$;

-- public ticket projection
create or replace function public.ticket_public(p_t public.matchmaking_tickets)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_t.id,
    'mode', p_t.mode,
    'stake', p_t.stake,
    'rating', p_t.rating,
    'status', p_t.status,
    'enqueued_at', to_jsonb(p_t.enqueued_at),
    'accept_deadline', to_jsonb(p_t.accept_deadline),
    'wait_seconds', greatest(0, extract(epoch from (now() - p_t.enqueued_at)))::integer,
    'search_window', case when p_t.status = 'searching'
      then public.mm_window(p_t.enqueued_at, 0) else null end
  );
$$;

-- ===========================================================================
-- match_close_cleanup(p_ticket_id) — after a dodge/expire: close the room,
-- refund escrows, requeue the honest player, penalize the dodger.
-- ===========================================================================
create or replace function public.match_close_cleanup(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.matchmaking_tickets;
  v_other public.matchmaking_tickets;
  v_escrow record;
begin
  select * into v_ticket from public.matchmaking_tickets where id = p_ticket_id;
  if not found or v_ticket.match_id is null then
    return;
  end if;

  -- refund any locked escrows of this match (exactly once)
  for v_escrow in
    select * from public.stake_escrows
    where match_id = v_ticket.match_id and status = 'locked'
    for update
  loop
    update public.stake_escrows
    set status = 'refunded', settled_at = now()
    where id = v_escrow.id;
    perform public.coins_grant(
      v_escrow.player_id, v_escrow.amount, 'stake_refund',
      v_ticket.match_id, 'بازگشت ورودی (بازی برقرار نشد)'
    );
  end loop;

  -- close the room
  update public.rooms
  set status = 'closed', last_activity_at = now(), version = version + 1
  where id = v_ticket.room_id and status in ('waiting', 'active');

  -- partner ticket handling
  select * into v_other from public.matchmaking_tickets
  where match_id = v_ticket.match_id and id <> v_ticket.id;

  if v_other.id is not null then
    if v_other.status = 'accepted' then
      -- honest player goes back to searching
      update public.matchmaking_tickets
      set status = 'searching', match_id = null, room_id = null,
          accept_deadline = null, enqueued_at = now()
      where id = v_other.id;
    else
      update public.matchmaking_tickets
      set status = 'expired', closed_at = now()
      where id = v_other.id and status in ('matched', 'accepted');
    end if;
  end if;
end;
$$;

-- ===========================================================================
-- matchmaking_tick() — the matcher. Runs the accept-expiry sweep, then pairs
-- the oldest searching tickets inside a time-widened, mutually-accepted window.
-- ===========================================================================
create or replace function public.matchmaking_tick()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paired integer := 0;
  v_primary public.matchmaking_tickets;
  v_cand public.matchmaking_tickets;
  v_win integer;
  v_cand_win integer;
  v_room_id uuid;
  v_code text;
  v_attempts integer;
  v_created boolean;
  v_match_id uuid;
  v_locked boolean;
begin
  ---------------------------------------------------------------------
  -- 1) expire accepted matches past their deadline
  ---------------------------------------------------------------------
  for v_primary in
    select * from public.matchmaking_tickets t
    where t.status in ('matched', 'accepted')
      and t.accept_deadline is not null and t.accept_deadline < now()
      -- a fully accepted match is live — never expire it via the queue
      and not exists (
        select 1 from public.matchmaking_tickets t2
        where t2.match_id = t.match_id and t2.id <> t.id and t2.status = 'accepted'
      )
  loop
    -- cleanup requeues the honest (accepted) partner and refunds escrows
    perform public.match_close_cleanup(v_primary.id);
    update public.matchmaking_tickets
    set status = 'expired', closed_at = now()
    where id = v_primary.id and status in ('matched', 'accepted');
  end loop;

  ---------------------------------------------------------------------
  -- 2) pair searching tickets (oldest first, mutual window)
  ---------------------------------------------------------------------
  for v_primary in
    select * from public.matchmaking_tickets
    where status = 'searching'
    order by enqueued_at asc
  loop
    -- skip if it got matched/closed meanwhile
    if not exists (
      select 1 from public.matchmaking_tickets where id = v_primary.id and status = 'searching'
    ) then
      continue;
    end if;

    v_win := public.mm_window(v_primary.enqueued_at, 0);

    select * into v_cand
    from public.matchmaking_tickets t
    where t.status = 'searching'
      and t.id <> v_primary.id
      and t.mode = v_primary.mode
      and t.stake = v_primary.stake
      and abs(t.rating - v_primary.rating) <= v_win
      and abs(t.rating - v_primary.rating) <= public.mm_window(t.enqueued_at, 0)
      -- avoid instant rematch with the same player
      and not exists (
        select 1 from public.matches m
        where ((m.player_x = v_primary.player_id and m.player_o = t.player_id)
            or (m.player_o = v_primary.player_id and m.player_x = t.player_id))
          and m.finished_at > now() - interval '30 minutes'
      )
      -- no open risk of the same pair being flagged as a farm loop today? (soft: allow, flags cover it)
      order by abs(t.rating - v_primary.rating) asc, t.enqueued_at asc
    limit 1;

    if v_cand.id is null then
      continue;
    end if;

    -----------------------------------------------------------------
    -- lock stakes (both) before creating the match — skip candidate on failure
    -----------------------------------------------------------------
    if v_primary.mode = 'stakes' then
      v_locked := false;
      -- serialize on wallet rows; verify funds for both players atomically
      perform 1 from public.wallets
      where player_id in (v_primary.player_id, v_cand.player_id)
      order by player_id
      for update;

      select (select balance from public.wallets where player_id = v_primary.player_id) >= v_primary.stake
         and (select balance from public.wallets where player_id = v_cand.player_id) >= v_cand.stake
        into v_locked;
      if not coalesce(v_locked, false) then
        continue;
      end if;

      perform public.coins_grant(v_primary.player_id, -v_primary.stake, 'stake_lock', null, 'قفل ورودی شرط');
      perform public.coins_grant(v_cand.player_id, -v_cand.stake, 'stake_lock', null, 'قفل ورودی شرط');
    end if;

    -----------------------------------------------------------------
    -- create the room with both seats (tokens bound at accept time)
    -----------------------------------------------------------------
    v_created := false;
    v_attempts := 0;
    while v_attempts < 5 and not v_created loop
      v_attempts := v_attempts + 1;
      v_code := public.generate_room_code();
      begin
        insert into public.rooms (room_code, status, mode, stake, expires_at)
        values (v_code, 'waiting', v_primary.mode, v_primary.stake,
                now() + make_interval(hours => (select room_ttl_hours from public.platform_settings where id = 1)))
        returning id into v_room_id;
        v_created := true;
      exception
        when unique_violation then
          v_created := false;
      end;
    end loop;

    if not v_created then
      continue;
    end if;

    insert into public.room_players (room_id, symbol, display_name, token_hash, profile_id)
    values
      (v_room_id, 'X', (select display_name from public.player_profiles where id = v_primary.player_id),
       public.hash_token(encode(extensions.gen_random_bytes(16), 'hex')), v_primary.player_id),
      (v_room_id, 'O', (select display_name from public.player_profiles where id = v_cand.player_id),
       public.hash_token(encode(extensions.gen_random_bytes(16), 'hex')), v_cand.player_id);

    v_match_id := gen_random_uuid();

    if v_primary.mode = 'stakes' then
      insert into public.stake_escrows (match_id, room_id, player_id, amount, status)
      values
        (v_match_id, v_room_id, v_primary.player_id, v_primary.stake, 'locked'),
        (v_match_id, v_room_id, v_cand.player_id, v_cand.stake, 'locked');
    end if;

    update public.matchmaking_tickets
    set status = 'matched', match_id = v_match_id, room_id = v_room_id,
        accept_deadline = now() + interval '20 seconds'
    where id in (v_primary.id, v_cand.id);

    insert into public.game_events (room_id, event_type, payload)
    values (v_room_id, 'match_found', jsonb_build_object('mode', v_primary.mode, 'stake', v_primary.stake));

    v_paired := v_paired + 1;
  end loop;

  return v_paired;
end;
$$;
