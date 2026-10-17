-- DOZ ONLINE — 0004: admin RPCs
-- Independent admin account system (bcrypt passwords via pgcrypto, opaque
-- session tokens stored hashed, server-side checks in EVERY admin call).
-- No admin secret is ever exposed to the browser; all privileged reads/writes
-- happen here. Extensible to multiple admins via admin_users rows.

-- internal helper: validate an admin session token → admin_id
create or replace function public.assert_admin_session(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'ADMIN_UNAUTHORIZED';
  end if;
  select s.admin_id into v_admin_id
  from public.admin_sessions s
  join public.admin_users a on a.id = s.admin_id
  where s.token_hash = public.hash_token(p_token)
    and s.expires_at > now()
    and a.is_active;
  if not found then
    raise exception 'ADMIN_UNAUTHORIZED';
  end if;
  update public.admin_sessions
  set last_used_at = now()
  where token_hash = public.hash_token(p_token);
  return v_admin_id;
end;
$$;

-- internal helper: audit trail (no secrets recorded)
create or replace function public.write_audit(
  p_actor text,
  p_action text,
  p_target text,
  p_result text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor, action, target, result, details)
  values (p_actor, p_action, p_target, p_result, p_details);
$$;

-- ---------------------------------------------------------------------------
-- admin_login(p_username, p_password) → { token, expires_at }
-- ---------------------------------------------------------------------------
create or replace function public.admin_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin public.admin_users;
  v_token text;
  v_expires timestamptz;
  v_ok boolean;
begin
  if not public.rate_limit_check('admin_login', public.get_client_ip(), 15, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  select * into v_admin
  from public.admin_users
  where username = lower(btrim(coalesce(p_username, ''))) and is_active;

  v_ok := found
    and extensions.crypt(coalesce(p_password, ''), v_admin.password_hash) = v_admin.password_hash;

  if not v_ok then
    perform public.write_audit(
      lower(btrim(coalesce(p_username, ''))), 'admin_login', null, 'failure',
      jsonb_build_object('ip', public.get_client_ip())
    );
    raise exception 'INVALID_CREDENTIALS';
  end if;

  delete from public.admin_sessions where expires_at < now();
  delete from public.admin_sessions where admin_id = v_admin.id and created_at < now() - interval '9 hours';

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + interval '8 hours';

  insert into public.admin_sessions (admin_id, token_hash, expires_at, ip)
  values (v_admin.id, public.hash_token(v_token), v_expires, public.get_client_ip());

  perform public.write_audit(v_admin.username, 'admin_login', null, 'success',
    jsonb_build_object('ip', public.get_client_ip()));

  return jsonb_build_object('token', v_token, 'expires_at', to_jsonb(v_expires));
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_logout(p_admin_token) / admin_verify(p_admin_token)
-- ---------------------------------------------------------------------------
create or replace function public.admin_logout(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_username text;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  select username into v_username from public.admin_users where id = v_admin_id;
  delete from public.admin_sessions where token_hash = public.hash_token(p_admin_token);
  perform public.write_audit(v_username, 'admin_logout', null, 'success');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_verify(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  return jsonb_build_object(
    'ok', true,
    'username', (select username from public.admin_users where id = v_admin_id)
  );
end;
$$;

create or replace function public.admin_change_password(
  p_admin_token text,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_admin public.admin_users;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  select * into v_admin from public.admin_users where id = v_admin_id;

  if extensions.crypt(coalesce(p_current_password, ''), v_admin.password_hash) <> v_admin.password_hash then
    perform public.write_audit(v_admin.username, 'admin_change_password', null, 'failure');
    raise exception 'INVALID_CREDENTIALS';
  end if;

  if coalesce(p_new_password, '') is null or char_length(p_new_password) < 10 or char_length(p_new_password) > 128 then
    raise exception 'INVALID_PASSWORD';
  end if;

  update public.admin_users
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12))
  where id = v_admin_id;

  -- revoke every other session
  delete from public.admin_sessions
  where admin_id = v_admin_id and token_hash <> public.hash_token(p_admin_token);

  perform public.write_audit(v_admin.username, 'admin_change_password', null, 'success');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard overview — REAL aggregates only
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_overview(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);

  return jsonb_build_object(
    'rooms_waiting', (
      select count(*) from public.rooms r
      where r.status = 'waiting' and r.expires_at > now()
    ),
    'rooms_active', (
      select count(*) from public.rooms r
      where r.status = 'active' and r.expires_at > now()
    ),
    'games_finished', (
      select count(*) from public.rooms r where r.status = 'finished'
    ),
    'rooms_closed', (
      select count(*) from public.rooms r where r.status = 'closed'
    ),
    'rooms_expired', (
      select count(*) from public.rooms r
      where r.status <> 'closed' and r.expires_at <= now()
    ),
    'games_last_24h', (
      select count(*) from public.rooms r
      where r.finished_at > now() - interval '24 hours'
    ),
    'moves_last_24h', (
      select count(*) from public.game_moves m
      where m.created_at > now() - interval '24 hours'
    ),
    'players_online', (
      select count(*) from public.room_players rp
      join public.rooms r on r.id = rp.room_id
      where rp.last_seen_at > now() - interval '45 seconds'
        and r.status <> 'closed' and r.expires_at > now()
    ),
    'games_finished_total_moves', (
      select coalesce(sum(r.move_count), 0) from public.rooms r where r.status = 'finished'
    ),
    'maintenance_mode', (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1),
    'server_now', to_jsonb(now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Rooms list with search / status filter + pagination
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_rooms(
  p_admin_token text,
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_search text;
  v_status text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_result_json jsonb;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  v_search := upper(btrim(coalesce(p_search, '')));
  v_status := nullif(btrim(coalesce(p_status, '')), '');
  if v_status is not null and v_status not in ('waiting', 'active', 'finished', 'closed', 'expired') then
    raise exception 'INVALID_FILTER';
  end if;

  with computed as (
    select r.*,
      case when r.status <> 'closed' and r.expires_at < now() then 'expired' else r.status end as effective_status,
      (select jsonb_agg(jsonb_build_object('symbol', rp.symbol, 'name', rp.display_name,
        'connected', (rp.last_seen_at > now() - interval '45 seconds')) order by rp.symbol desc)
       from public.room_players rp where rp.room_id = r.id) as players
    from public.rooms r
  ),
  filtered as (
    select * from computed c
    where (v_search = '' or c.room_code like v_search || '%')
      and (v_status is null or c.effective_status = v_status)
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'room_code', f.room_code,
        'status', f.effective_status,
        'game_number', f.game_number,
        'move_count', f.move_count,
        'players', f.players,
        'created_at', to_jsonb(f.created_at),
        'last_activity_at', to_jsonb(f.last_activity_at),
        'expires_at', to_jsonb(f.expires_at),
        'expires_in_seconds', greatest(0, extract(epoch from (f.expires_at - now())))::integer
      ) order by f.last_activity_at desc)
      from (
        select * from filtered
        order by last_activity_at desc
        limit v_limit offset v_offset
      ) f
    ), '[]'::jsonb)
  into v_total, v_result_json;

  return jsonb_build_object('items', v_result_json, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
end;
$$;

-- ---------------------------------------------------------------------------
-- Room detail (players WITHOUT token material, moves, events)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_room(p_admin_token text, p_room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_code text;
  v_room public.rooms;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  v_code := upper(btrim(coalesce(p_room_code, '')));
  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.rooms where room_code = v_code;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'status', case when v_room.status <> 'closed' and v_room.expires_at < now()
              then 'expired' else v_room.status end,
    'board', v_room.board,
    'current_turn', v_room.current_turn,
    'winner', v_room.winner,
    'is_draw', v_room.is_draw,
    'move_count', v_room.move_count,
    'game_number', v_room.game_number,
    'version', v_room.version,
    'created_at', to_jsonb(v_room.created_at),
    'started_at', to_jsonb(v_room.started_at),
    'finished_at', to_jsonb(v_room.finished_at),
    'expires_at', to_jsonb(v_room.expires_at),
    'expires_in_seconds', greatest(0, extract(epoch from (v_room.expires_at - now())))::integer,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'symbol', rp.symbol,
        'name', rp.display_name,
        'joined_at', to_jsonb(rp.joined_at),
        'last_seen_at', to_jsonb(rp.last_seen_at),
        'connected', (rp.last_seen_at > now() - interval '45 seconds')
      ) order by rp.symbol desc), '[]'::jsonb)
      from public.room_players rp where rp.room_id = v_room.id
    ),
    'moves', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'move_number', m.move_number,
        'game_number', m.game_number,
        'symbol', m.symbol,
        'cell_index', m.cell_index,
        'created_at', to_jsonb(m.created_at)
      ) order by m.game_number, m.move_number), '[]'::jsonb)
      from public.game_moves m where m.room_id = v_room.id
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_type', e.event_type,
        'payload', e.payload,
        'created_at', to_jsonb(e.created_at)
      ) order by e.created_at desc), '[]'::jsonb)
      from (
        select * from public.game_events
        where room_id = v_room.id
        order by created_at desc
        limit 100
      ) e
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Close (force-expire) a room — sensitive op, always audited
-- ---------------------------------------------------------------------------
create or replace function public.admin_close_room(
  p_admin_token text,
  p_room_code text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_username text;
  v_code text;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  select username into v_username from public.admin_users where id = v_admin_id;

  v_code := upper(btrim(coalesce(p_room_code, '')));
  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  perform 1 from public.rooms where room_code = v_code for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  update public.rooms
  set status = 'closed', version = version + 1, last_activity_at = now()
  where room_code = v_code and status <> 'closed';

  insert into public.game_events (room_id, event_type, payload)
  select id, 'admin_closed', jsonb_build_object('reason', v_reason)
  from public.rooms where room_code = v_code;

  perform public.broadcast_room_state((select id from public.rooms where room_code = v_code));

  perform public.write_audit(v_username, 'admin_close_room', v_code, 'success',
    jsonb_build_object('reason', v_reason));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finished games list
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_games(
  p_admin_token text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);

  select count(*) into v_total
  from public.rooms r where r.status in ('finished', 'closed') and r.finished_at is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'room_code', g.room_code,
    'game_number', g.game_number,
    'winner', g.winner,
    'is_draw', g.is_draw,
    'move_count', g.move_count,
    'started_at', to_jsonb(g.started_at),
    'finished_at', to_jsonb(g.finished_at),
    'players', g.players
  ) order by g.finished_at desc), '[]'::jsonb)
  into v_items
  from (
    select r.room_code, r.game_number, r.winner, r.is_draw, r.move_count, r.started_at, r.finished_at,
      (select jsonb_agg(jsonb_build_object('symbol', rp.symbol, 'name', rp.display_name) order by rp.symbol desc)
       from public.room_players rp where rp.room_id = r.id) as players
    from public.rooms r
    where r.status in ('finished', 'closed') and r.finished_at is not null
    order by r.finished_at desc
    limit v_limit offset v_offset
  ) g;

  return jsonb_build_object('items', v_items, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (read / validated update)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_settings(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_settings jsonb;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  select to_jsonb(ps) into v_settings
  from public.platform_settings ps where ps.id = 1;
  return v_settings;
end;
$$;

create or replace function public.admin_update_settings(
  p_admin_token text,
  p_room_ttl_hours integer default null,
  p_max_rooms_per_ip_per_hour integer default null,
  p_max_joins_per_ip_per_hour integer default null,
  p_maintenance_mode boolean default null,
  p_maintenance_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_username text;
  v_settings jsonb;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);
  select username into v_username from public.admin_users where id = v_admin_id;

  update public.platform_settings
  set room_ttl_hours = coalesce(p_room_ttl_hours, room_ttl_hours),
      max_rooms_per_ip_per_hour = coalesce(p_max_rooms_per_ip_per_hour, max_rooms_per_ip_per_hour),
      max_joins_per_ip_per_hour = coalesce(p_max_joins_per_ip_per_hour, max_joins_per_ip_per_hour),
      maintenance_mode = coalesce(p_maintenance_mode, maintenance_mode),
      maintenance_message = coalesce(left(btrim(p_maintenance_message, ''), 200), maintenance_message),
      updated_at = now()
  where id = 1;

  perform public.write_audit(v_username, 'admin_update_settings', 'platform_settings', 'success',
    jsonb_build_object(
      'room_ttl_hours', p_room_ttl_hours,
      'max_rooms_per_ip_per_hour', p_max_rooms_per_ip_per_hour,
      'max_joins_per_ip_per_hour', p_max_joins_per_ip_per_hour,
      'maintenance_mode', p_maintenance_mode
    ));

  select to_jsonb(ps) into v_settings
  from public.platform_settings ps where ps.id = 1;
  return v_settings;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log (read)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_audit(
  p_admin_token text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  v_admin_id := public.assert_admin_session(p_admin_token);

  select count(*) into v_total from public.audit_log;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'actor', a.actor,
    'action', a.action,
    'target', a.target,
    'result', a.result,
    'details', a.details,
    'created_at', to_jsonb(a.created_at)
  ) order by a.created_at desc, a.id desc), '[]'::jsonb)
  into v_items
  from (
    select * from public.audit_log
    order by created_at desc, id desc
    limit v_limit offset v_offset
  ) a;

  return jsonb_build_object('items', v_items, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
end;
$$;
