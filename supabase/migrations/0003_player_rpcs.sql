-- DOZ ONLINE — 0003: player RPCs (guest flow)
-- Every gameplay operation is a SECURITY DEFINER server function:
-- the client can NEVER write game state directly. Each move request verifies:
-- room exists → room active → token valid → player belongs to room → correct
-- symbol/turn → cell in range → cell empty → game not finished → atomic commit.

-- ---------------------------------------------------------------------------
-- create_room(p_display_name) → { room_code, room_id, player_token, symbol }
-- ---------------------------------------------------------------------------
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

  if (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('create_room', v_ip, v_max_rooms, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  -- opportunistic cleanup (~10% of calls)
  if get_byte(extensions.gen_random_bytes(1), 0) < 26 then
    perform public.cleanup_expired_data();
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex'); -- 128-bit bearer token

  while v_attempts < 5 and not v_created loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_room_code();
    begin
      insert into public.rooms (room_code, expires_at)
      values (v_code, now() + make_interval(hours => v_ttl))
      returning id into v_room_id;
      v_created := true;
    exception
      when unique_violation then
        v_created := false; -- collision → try a new code
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

-- ---------------------------------------------------------------------------
-- join_room(p_room_code, p_display_name) → { room_code, room_id, player_token, symbol }
-- The room code alone does NOT grant a seat; the server enforces capacity and
-- status atomically (unique(room_id, symbol) blocks double-join races).
-- ---------------------------------------------------------------------------
create or replace function public.join_room(p_room_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_ip inet;
  v_ttl integer;
  v_max_joins integer;
  v_code text;
  v_room public.rooms;
  v_room_id uuid;
  v_token text;
  v_o_exists boolean;
begin
  select ps.room_ttl_hours, ps.max_joins_per_ip_per_hour
  into v_ttl, v_max_joins
  from public.platform_settings ps where ps.id = 1;

  if (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('join_room', v_ip, v_max_joins, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_code := upper(btrim(coalesce(p_room_code, '')));
  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.rooms where room_code = v_code;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- serialize joins on the room row
  perform 1 from public.rooms where id = v_room.id for update;
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED';
  end if;
  if v_room.expires_at < now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'ROOM_IN_GAME';
  end if;

  select exists(
    select 1 from public.room_players
    where room_id = v_room.id and symbol = 'O'
  ) into v_o_exists;
  if v_o_exists then
    raise exception 'ROOM_FULL';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  begin
    insert into public.room_players (room_id, symbol, display_name, token_hash)
    values (v_room.id, 'O', v_name, public.hash_token(v_token));
  exception
    when unique_violation then
      raise exception 'ROOM_FULL';
  end;

  update public.rooms
  set status = 'active',
      started_at = now(),
      last_activity_at = now(),
      expires_at = now() + make_interval(hours => v_ttl),
      version = version + 1
  where id = v_room.id
  returning id into v_room_id;

  insert into public.game_events (room_id, event_type, payload)
  values (v_room.id, 'player_joined', jsonb_build_object('symbol', 'O'));

  perform public.broadcast_room_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'symbol', 'O'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_room_state(p_room_code, p_token, p_notify) → { role, state }
-- role: 'X' | 'O' for a valid member token, null otherwise.
-- Also acts as heartbeat (refreshes last_seen) when a valid token is passed.
-- p_notify=true re-broadcasts state (used after reconnects for presence sync).
-- ---------------------------------------------------------------------------
create or replace function public.get_room_state(
  p_room_code text,
  p_token text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_role text;
begin
  if p_room_code is null or upper(btrim(p_room_code)) !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.rooms where room_code = upper(btrim(p_room_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if coalesce(p_token, '') <> '' then
    select rp.symbol into v_role
    from public.room_players rp
    where rp.room_id = v_room.id and rp.token_hash = public.hash_token(p_token);

    if found then
      update public.room_players
      set last_seen_at = now()
      where room_id = v_room.id and symbol = v_role;
    end if;
  end if;

  select * into v_room from public.rooms where id = v_room.id;

  if v_role is not null and p_notify then
    perform public.broadcast_room_state(v_room.id);
  end if;

  return jsonb_build_object('role', v_role, 'state', public.room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- make_move(p_room_code, p_token, p_cell) → { role, state }
-- The critical secured operation — all validation happens inside ONE locked,
-- atomic transaction; concurrent duplicate moves serialize on the room row.
-- ---------------------------------------------------------------------------
create or replace function public.make_move(
  p_room_code text,
  p_token text,
  p_cell integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_player public.room_players;
  v_symbol text;
  v_board text;
  v_eval jsonb;
  v_winner text;
  v_cells integer[];
  v_draw boolean;
  v_move_count integer;
  v_ttl integer;
  v_game_ended boolean;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 8 or p_cell <> floor(p_cell) then
    raise exception 'INVALID_CELL';
  end if;

  select ps.room_ttl_hours into v_ttl from public.platform_settings ps where ps.id = 1;

  if upper(btrim(coalesce(p_room_code, ''))) !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  select * into v_room from public.rooms where room_code = upper(btrim(p_room_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- token must belong to a player OF THIS room
  select * into v_player
  from public.room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  v_symbol := v_player.symbol;

  -- lock the room row: serializes concurrent moves (race-condition guard)
  perform 1 from public.rooms where id = v_room.id for update;
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED';
  end if;
  if v_room.expires_at < now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status <> 'active' then
    raise exception 'GAME_NOT_ACTIVE';
  end if;
  if v_room.current_turn <> v_symbol then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if substr(v_room.board, p_cell + 1, 1) <> '.' then
    raise exception 'CELL_TAKEN';
  end if;

  -- apply the move on the authoritative board
  v_board := overlay(v_room.board placing v_symbol from p_cell + 1 for 1);

  -- server decides the outcome (never the browser)
  v_eval := public.evaluate_board(v_board);
  v_winner := v_eval ->> 'winner';
  select array_agg(x::integer) into v_cells
  from jsonb_array_elements_text(coalesce(v_eval -> 'winning_cells', '[]'::jsonb)) x;
  v_draw := (v_eval ->> 'is_draw')::boolean;
  v_game_ended := (v_winner is not null) or v_draw;

  v_move_count := v_room.move_count + 1;

  update public.rooms
  set board = v_board,
      current_turn = case when v_game_ended then current_turn else public.other_symbol(v_symbol) end,
      winner = v_winner,
      is_draw = v_draw,
      winning_cells = coalesce(v_cells, '{}'::integer[]),
      move_count = v_move_count,
      status = case when v_game_ended then 'finished' else 'active' end,
      finished_at = case when v_game_ended then now() else finished_at end,
      version = version + 1,
      last_activity_at = now(),
      expires_at = now() + make_interval(hours => v_ttl)
  where id = v_room.id
  returning * into v_room;

  insert into public.game_moves (room_id, game_number, move_number, symbol, cell_index, board_after)
  values (v_room.id, v_room.game_number, v_move_count, v_symbol, p_cell, v_board);

  insert into public.game_events (room_id, event_type, payload)
  values (
    v_room.id,
    case when v_game_ended then 'game_finished' else 'move_made' end,
    jsonb_build_object('symbol', v_symbol, 'cell', p_cell, 'move', v_move_count)
  );

  perform public.broadcast_room_state(v_room.id);

  return jsonb_build_object('role', v_symbol, 'state', public.room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- request_rematch(p_room_code, p_token) → { role, state }
-- Policy: a rematch starts when BOTH players request it (fair, explicit).
-- The starting symbol alternates every game (X opened game 1).
-- ---------------------------------------------------------------------------
create or replace function public.request_rematch(p_room_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_symbol text;
  v_ttl integer;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  select ps.room_ttl_hours into v_ttl from public.platform_settings ps where ps.id = 1;

  select * into v_room from public.rooms where room_code = upper(btrim(coalesce(p_room_code, '')));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select rp.symbol into v_symbol
  from public.room_players rp
  where rp.room_id = v_room.id and rp.token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  perform 1 from public.rooms where id = v_room.id for update;
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED';
  end if;
  if v_room.expires_at < now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status <> 'finished' then
    raise exception 'REMATCH_NOT_ALLOWED';
  end if;

  if v_room.rematch_requested_by is null then
    update public.rooms
    set rematch_requested_by = v_symbol, version = version + 1, last_activity_at = now()
    where id = v_room.id;

    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'rematch_requested', jsonb_build_object('symbol', v_symbol));

  elsif v_room.rematch_requested_by <> v_symbol then
    -- both players asked → start the next game
    update public.rooms
    set board = '.........',
        winner = null,
        is_draw = false,
        winning_cells = '{}'::integer[],
        move_count = 0,
        game_number = game_number + 1,
        status = 'active',
        started_at = now(),
        finished_at = null,
        current_turn = case when game_number % 2 = 1 then 'O' else 'X' end,
        rematch_requested_by = null,
        version = version + 1,
        last_activity_at = now(),
        expires_at = now() + make_interval(hours => v_ttl)
    where id = v_room.id;

    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'rematch_accepted', jsonb_build_object('game_number', v_room.game_number + 1));
  else
    -- same player again → idempotent no-op
    return jsonb_build_object('role', v_symbol, 'state', public.room_public_state(v_room));
  end if;

  select * into v_room from public.rooms where id = v_room.id;
  perform public.broadcast_room_state(v_room.id);

  return jsonb_build_object('role', v_symbol, 'state', public.room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_room(p_room_code, p_token) → { ok, action }
-- Policies:
--  • creator (X) leaves a waiting room → room is closed
--  • O leaves a waiting room → seat freed, room back to waiting
--  • leaving during/after a game → presence only (no forfeit; friendly rules)
-- ---------------------------------------------------------------------------
create or replace function public.leave_room(p_room_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_symbol text;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  select * into v_room from public.rooms where room_code = upper(btrim(coalesce(p_room_code, '')));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select rp.symbol into v_symbol
  from public.room_players rp
  where rp.room_id = v_room.id and rp.token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  perform 1 from public.rooms where id = v_room.id for update;

  if v_room.status = 'waiting' and v_symbol = 'X' then
    update public.rooms
    set status = 'closed', version = version + 1, last_activity_at = now()
    where id = v_room.id;
    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'room_closed', jsonb_build_object('by_symbol', v_symbol));
    perform public.broadcast_room_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'room_closed');
  end if;

  if v_room.status = 'waiting' and v_symbol = 'O' then
    delete from public.room_players where room_id = v_room.id and symbol = 'O';
    update public.rooms set version = version + 1, last_activity_at = now() where id = v_room.id;
    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'player_left', jsonb_build_object('symbol', v_symbol));
    perform public.broadcast_room_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'seat_freed');
  end if;

  insert into public.game_events (room_id, event_type, payload)
  values (v_room.id, 'player_left', jsonb_build_object('symbol', v_symbol));
  perform public.broadcast_room_state(v_room.id);
  return jsonb_build_object('ok', true, 'action', 'left');
end;
$$;

-- ---------------------------------------------------------------------------
-- get_public_status() → landing page service status (aggregates only)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_status()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'maintenance_mode', ps.maintenance_mode,
    'maintenance_message', ps.maintenance_message,
    'active_rooms', (
      select count(*) from public.rooms r
      where r.status in ('waiting', 'active') and r.expires_at > now()
    ),
    'games_played_total', (
      select count(*) from public.rooms r where r.status = 'finished'
    ),
    'server_now', to_jsonb(now())
  )
  from public.platform_settings ps where ps.id = 1;
$$;
