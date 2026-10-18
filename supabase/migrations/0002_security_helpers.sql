-- DOZ ONLINE — 0002: security helpers & shared internals
-- Room code generation, token hashing, client IP extraction, rate limiting,
-- board evaluation (server-side rules), public state builder and broadcast.

-- ---------------------------------------------------------------------------
-- Room code: 6 chars from an unambiguous 31-char alphabet (~887M combos),
-- generated with cryptographically secure random bytes.
-- ---------------------------------------------------------------------------
create or replace function public.generate_room_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(extensions.gen_random_bytes(1), 0) % 31) + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- ---------------------------------------------------------------------------
-- SHA-256 of a bearer token. Raw tokens never touch storage.
-- ---------------------------------------------------------------------------
create or replace function public.hash_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.other_symbol(p_symbol text)
returns text
language sql
immutable
as $$
  select case p_symbol when 'X' then 'O' when 'O' then 'X' end;
$$;

-- ---------------------------------------------------------------------------
-- Client IP from PostgREST request headers (x-forwarded-for first hop).
-- Falls back to 0.0.0.0 (shared bucket) when headers are unavailable.
-- ---------------------------------------------------------------------------
create or replace function public.get_client_ip()
returns inet
language plpgsql
stable
as $$
declare
  v_headers jsonb;
  v_fwd text;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  if v_headers is null then
    return '0.0.0.0'::inet;
  end if;
  v_fwd := coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip');
  if v_fwd is null or btrim(v_fwd) = '' then
    return '0.0.0.0'::inet;
  end if;
  return btrim(split_part(v_fwd, ',', 1))::inet;
exception
  when others then
    return '0.0.0.0'::inet;
end;
$$;

-- ---------------------------------------------------------------------------
-- Display name validation (shared by create/join).
-- ---------------------------------------------------------------------------
create or replace function public.validate_display_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(p_name, ''));
begin
  if v is null or char_length(v) < 2 or char_length(v) > 24 then
    raise exception 'INVALID_NAME';
  end if;
  -- reject control chars, and markup/quote characters that never belong in a name
  if v ~ '[<>"/\\''`{}|%$\x00-\x1f\x7f]' then
    raise exception 'INVALID_NAME';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sliding-window rate limiting.
-- Returns true when the action is allowed; records the hit otherwise-side.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_check(
  p_action text,
  p_ip inet,
  p_max integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_max is null or p_max < 1 then
    return true;
  end if;
  select count(*) into v_count
  from public.rate_limit_hits
  where client_ip = p_ip and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    return false;
  end if;
  insert into public.rate_limit_hits (client_ip, action) values (p_ip, p_action);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-side rules engine (mirror of src/game/engine.ts — authoritative).
-- Returns winner / winning cells / draw flag for a 9-char board string.
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_board(p_board text)
returns jsonb
language plpgsql
immutable
as $$
declare
  lines constant integer[][] := array[
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  v_line integer[];
  a text;
  b text;
  c text;
  v_filled integer := 0;
begin
  if p_board is null or char_length(p_board) <> 9 or p_board !~ '^[XO.]{9}$' then
    raise exception 'INVALID_BOARD';
  end if;

  foreach v_line slice 1 in array lines loop
    a := substr(p_board, v_line[1] + 1, 1);
    b := substr(p_board, v_line[2] + 1, 1);
    c := substr(p_board, v_line[3] + 1, 1);
    if a = b and b = c and a in ('X', 'O') then
      return jsonb_build_object(
        'winner', a,
        'winning_cells', to_jsonb(v_line),
        'is_draw', false
      );
    end if;
  end loop;

  select count(*) into v_filled
  from regexp_split_to_table(p_board, '') ch
  where ch <> '.';

  return jsonb_build_object(
    'winner', null,
    'winning_cells', '[]'::jsonb,
    'is_draw', (v_filled = 9)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public (safe) JSON projection of a room row. This is the ONLY shape that
-- ever reaches clients or realtime channels — it contains no token material.
-- Connection is computed live from heartbeat freshness (45s window).
-- ---------------------------------------------------------------------------
create or replace function public.room_public_state(p_room public.rooms)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'room_code', p_room.room_code,
    'status', case
      when p_room.status <> 'closed' and p_room.expires_at < now() then 'expired'
      else p_room.status
    end,
    'board', p_room.board,
    'current_turn', p_room.current_turn,
    'winner', p_room.winner,
    'is_draw', p_room.is_draw,
    'winning_cells', to_jsonb(p_room.winning_cells),
    'move_count', p_room.move_count,
    'game_number', p_room.game_number,
    'rematch_requested_by', p_room.rematch_requested_by,
    'version', p_room.version,
    'players', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'symbol', rp.symbol,
            'name', rp.display_name,
            'connected', (rp.last_seen_at > now() - interval '45 seconds')
          ) order by rp.symbol desc
        ),
        '[]'::jsonb
      )
      from public.room_players rp
      where rp.room_id = p_room.id
    ),
    'created_at', to_jsonb(p_room.created_at),
    'started_at', to_jsonb(p_room.started_at),
    'finished_at', to_jsonb(p_room.finished_at),
    'expires_in_seconds', greatest(0, extract(epoch from (p_room.expires_at - now())))::integer,
    'server_now', to_jsonb(now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Broadcast the safe room state to the room's realtime channel.
-- Broadcast failures must never break a committed game action.
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_room_state(
  p_room_id uuid,
  p_event text default 'state'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return;
  end if;
  begin
    perform realtime.send(
      public.room_public_state(v_room),
      p_event,
      'room:' || v_room.room_code,
      false
    );
  exception
    when others then
      null; -- realtime outage must not fail gameplay
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Controlled cleanup of expired rooms and stale rate/session rows.
-- Called lazily from RPCs and (optionally) via pg_cron.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- cascade removes players, moves and events of expired rooms
  delete from public.rooms where expires_at < now() - interval '1 hour';
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.admin_sessions where expires_at < now();
end;
$$;
