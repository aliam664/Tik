-- DOZ ONLINE — 0015: Admin RBAC hardening and owner-scoped Arena profiles
-- The original admin RPCs predate granular permissions. This migration redefines
-- those entry points with explicit permissions and binds the AI Arena player to
-- its owning admin rather than trusting a caller-supplied player token.

-- Extend operational limits to match the validated admin UI ranges.
alter table public.platform_settings
  drop constraint if exists platform_settings_room_ttl_hours_check,
  drop constraint if exists platform_settings_max_rooms_per_ip_per_hour_check,
  drop constraint if exists platform_settings_max_joins_per_ip_per_hour_check;

alter table public.platform_settings
  add constraint platform_settings_room_ttl_hours_check
    check (room_ttl_hours between 1 and 72),
  add constraint platform_settings_max_rooms_per_ip_per_hour_check
    check (max_rooms_per_ip_per_hour between 1 and 500),
  add constraint platform_settings_max_joins_per_ip_per_hour_check
    check (max_joins_per_ip_per_hour between 1 and 1000);

create table if not exists public.admin_player_profiles (
  admin_id uuid primary key references public.admin_users (id) on delete cascade,
  profile_id uuid unique references public.player_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Existing admins are marked as legacy/unlinked so their old Arena profile can
-- only be attached with both its token and recovery code. This prevents a fresh
-- profile from silently replacing a banned or frozen legacy profile.
insert into public.admin_player_profiles (admin_id)
select id from public.admin_users
on conflict (admin_id) do nothing;

alter table public.admin_player_profiles enable row level security;
revoke all on public.admin_player_profiles from public, anon, authenticated;

-- A session check alone is insufficient for RPCs created before RBAC existed.

-- RBAC-protected replacement of admin_get_overview.
create or replace function public.admin_get_overview(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
begin
  v_admin_id := public.assert_admin_perm(p_admin_token, 'view');

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


-- RBAC-protected replacement of admin_list_rooms.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'view');
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


-- RBAC-protected replacement of admin_get_room.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'view');
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


-- RBAC-protected replacement of admin_close_room.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'moderate');
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


-- RBAC-protected replacement of admin_list_games.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'view');

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


-- RBAC-protected replacement of admin_get_settings.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'settings');
  select to_jsonb(ps) into v_settings
  from public.platform_settings ps where ps.id = 1;
  return v_settings;
end;
$$;


-- RBAC-protected replacement of admin_update_settings.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'settings');
  if p_room_ttl_hours is not null and p_room_ttl_hours not between 1 and 72 then
    raise exception 'INVALID_SETTING';
  end if;
  if p_max_rooms_per_ip_per_hour is not null and p_max_rooms_per_ip_per_hour not between 1 and 500 then
    raise exception 'INVALID_SETTING';
  end if;
  if p_max_joins_per_ip_per_hour is not null and p_max_joins_per_ip_per_hour not between 1 and 1000 then
    raise exception 'INVALID_SETTING';
  end if;
  select username into v_username from public.admin_users where id = v_admin_id;

  update public.platform_settings
  set room_ttl_hours = coalesce(p_room_ttl_hours, room_ttl_hours),
      max_rooms_per_ip_per_hour = coalesce(p_max_rooms_per_ip_per_hour, max_rooms_per_ip_per_hour),
      max_joins_per_ip_per_hour = coalesce(p_max_joins_per_ip_per_hour, max_joins_per_ip_per_hour),
      maintenance_mode = coalesce(p_maintenance_mode, maintenance_mode),
      maintenance_message = case when p_maintenance_message is null then maintenance_message else left(btrim(p_maintenance_message), 200) end,
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


-- RBAC-protected replacement of admin_get_audit.
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
  v_admin_id := public.assert_admin_perm(p_admin_token, 'rbac');

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

-- Bind exactly one admin-owned player profile to each admin session identity.
drop function if exists public.admin_ensure_profile(text, text, text);

create function public.admin_ensure_profile(
  p_admin_token text,
  p_display_name text default null,
  p_existing_token text default null,
  p_existing_recovery_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_name text;
  v_profile_id uuid;
  v_existing_hash text;
  v_recovery_hash text;
  v_recovery_input text;
  v_profile_status text;
  v_wallet_frozen boolean;
  v_token text;
  v_recovery text;
  v_token_matches boolean;
  v_balance bigint;
  v_mapping_exists boolean;
  v_changed integer;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'competitive');
  -- Serialize first-time creation/recovery for this admin and keep the fallback
  -- display name within validate_display_name's 24-character limit.
  select username into v_username from public.admin_users where id = v_admin for update;
  if not found then raise exception 'ADMIN_UNAUTHORIZED'; end if;
  v_name := public.validate_display_name(
    coalesce(nullif(btrim(coalesce(p_display_name, '')), ''), left('Admin_' || v_username, 24))
  );

  select profile_id into v_profile_id
  from public.admin_player_profiles
  where admin_id = v_admin
  for update;
  v_mapping_exists := found;

  if not v_mapping_exists then
    -- Admin accounts created after this migration get their own dedicated
    -- profile. Existing admins are seeded above with a NULL mapping and must
    -- prove ownership of their legacy profile before it can be linked.
    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    v_recovery := public.generate_recovery_code();

    insert into public.player_profiles (display_name, token_hash, recovery_hash, register_ip)
    values (v_name, public.hash_token(v_token), public.hash_token(v_recovery), public.get_client_ip())
    returning id into v_profile_id;

    insert into public.player_stats (player_id, games, wins)
    values (v_profile_id, 25, 20);
    insert into public.player_ratings (player_id, rating, peak_rating, placement_left)
    values (v_profile_id, 1500, 1500, 0);
    insert into public.wallets (player_id, balance) values (v_profile_id, 0);
    insert into public.admin_player_profiles (admin_id, profile_id)
    values (v_admin, v_profile_id);

    perform public.coins_grant(
      v_profile_id, 5000, 'admin_adjust', null, 'اعتبار اولیه میدان هوش مصنوعی ادمین'
    );
    perform public.write_audit(v_username, 'admin_ensure_profile', v_profile_id::text, 'success',
      jsonb_build_object('display_name', v_name, 'created', true));

  elsif v_profile_id is null then
    -- The migration intentionally does not infer ownership from a display name
    -- or blindly trust a caller-provided player token. Link a legacy profile only
    -- when both its token and recovery code prove control, and never bypass bans
    -- or wallet freezes during that one-time link.
    v_recovery_input := upper(btrim(coalesce(p_existing_recovery_code, '')));
    if coalesce(btrim(coalesce(p_existing_token, '')), '') = '' or v_recovery_input = '' then
      raise exception 'ADMIN_PROFILE_SETUP_REQUIRED';
    end if;
    if v_recovery_input !~ '^[A-Z2-9]{12}$' then
      raise exception 'INVALID_RECOVERY_CODE';
    end if;

    select id, token_hash, recovery_hash, status, wallet_frozen
    into v_profile_id, v_existing_hash, v_recovery_hash, v_profile_status, v_wallet_frozen
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_existing_token))
    for update;
    if not found then raise exception 'ADMIN_PROFILE_SETUP_REQUIRED'; end if;
    if public.hash_token(v_recovery_input) <> v_recovery_hash then
      raise exception 'INVALID_RECOVERY_CODE';
    end if;
    -- Only disclose a ban/freeze result after both credentials have proved
    -- profile ownership; the raw token alone must not become a status oracle.
    if v_profile_status = 'banned' then raise exception 'PLAYER_BANNED'; end if;
    if v_wallet_frozen then raise exception 'WALLET_FROZEN'; end if;
    if exists (
      select 1 from public.admin_player_profiles ap
      where ap.profile_id = v_profile_id and ap.admin_id <> v_admin
    ) then
      raise exception 'ADMIN_PROFILE_SETUP_REQUIRED';
    end if;

    update public.admin_player_profiles
    set profile_id = v_profile_id
    where admin_id = v_admin and profile_id is null;
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then raise exception 'ADMIN_PROFILE_SETUP_REQUIRED'; end if;
    v_token := btrim(p_existing_token);
    v_recovery := v_recovery_input;
    perform public.write_audit(v_username, 'admin_link_legacy_profile', v_profile_id::text, 'success',
      jsonb_build_object('legacy_link', true));

  else
    select token_hash, recovery_hash, status, wallet_frozen
    into v_existing_hash, v_recovery_hash, v_profile_status, v_wallet_frozen
    from public.player_profiles
    where id = v_profile_id
    for update;
    if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

    v_token_matches := coalesce(btrim(coalesce(p_existing_token, '')), '') <> ''
      and public.hash_token(btrim(p_existing_token)) = v_existing_hash;
    if v_token_matches then
      v_token := btrim(p_existing_token);
    else
      -- A mapped profile can rotate lost local credentials with its recovery
      -- code. Never rotate solely because a browser omitted a token; in
      -- particular this makes parallel startup calls safe for the first admin.
      v_recovery_input := upper(btrim(coalesce(p_existing_recovery_code, '')));
      if v_recovery_input = '' then raise exception 'ADMIN_PROFILE_SETUP_REQUIRED'; end if;
      if v_recovery_input !~ '^[A-Z2-9]{12}$'
         or public.hash_token(v_recovery_input) <> v_recovery_hash then
        raise exception 'INVALID_RECOVERY_CODE';
      end if;
    end if;

    if v_profile_status = 'banned' then raise exception 'PLAYER_BANNED'; end if;
    if v_wallet_frozen then raise exception 'WALLET_FROZEN'; end if;

    if not v_token_matches then
      v_token := encode(extensions.gen_random_bytes(16), 'hex');
      v_recovery := public.generate_recovery_code();
      update public.player_profiles
      set token_hash = public.hash_token(v_token),
          recovery_hash = public.hash_token(v_recovery)
      where id = v_profile_id;
      perform public.write_audit(v_username, 'admin_rotate_profile_token', v_profile_id::text, 'success', '{}'::jsonb);
    end if;
  end if;

  update public.player_profiles
  set display_name = v_name,
      last_seen_at = now()
  where id = v_profile_id;

  update public.player_stats
  set games = greatest(games, 25),
      wins = greatest(wins, 15)
  where player_id = v_profile_id;

  update public.player_ratings
  set rating = greatest(rating, 1450),
      peak_rating = greatest(peak_rating, 1450),
      placement_left = 0
  where player_id = v_profile_id;

  select balance into v_balance from public.wallets where player_id = v_profile_id;
  if v_balance is null then
    insert into public.wallets (player_id, balance) values (v_profile_id, 0)
    on conflict (player_id) do nothing;
  end if;

  return jsonb_build_object(
    'player_token', v_token,
    'recovery_code', v_recovery,
    'profile', public.profile_public(v_profile_id)
  );
end;
$$;

-- Arena queue operations are limited to the calling admin's linked profile and
-- reuse the normal queue eligibility checks (bans, stake limits, and balance).
create or replace function public.admin_queue_join(
  p_admin_token text,
  p_player_token text,
  p_mode text,
  p_stake integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_profile_id uuid;
  v_rating integer;
  v_stake integer := 0;
  v_ticket public.matchmaking_tickets;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'competitive');
  if coalesce(p_mode, '') not in ('ranked', 'stakes') then
    raise exception 'INVALID_MODE';
  end if;

  v_profile_id := public.assert_player_token(p_player_token);
  if not exists (
    select 1 from public.admin_player_profiles ap
    where ap.admin_id = v_admin and ap.profile_id = v_profile_id
  ) then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  -- Serialize queue creation for this dedicated profile. This makes repeated
  -- button presses idempotent and avoids racing the unique-open-ticket index.
  perform 1 from public.player_profiles pp where pp.id = v_profile_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if p_mode = 'stakes' then
    v_stake := coalesce(p_stake, 10);
  end if;

  select rating into v_rating from public.player_ratings where player_id = v_profile_id;
  select * into v_ticket from public.matchmaking_tickets
  where player_id = v_profile_id and mode = p_mode
    and status in ('searching', 'matched', 'accepted');
  if found then
    perform public.matchmaking_tick();
    select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
    return jsonb_build_object('ticket', public.ticket_public(v_ticket));
  end if;

  perform public.assert_can_queue(v_profile_id, p_mode, v_stake);

  insert into public.matchmaking_tickets (player_id, mode, stake, rating)
  values (v_profile_id, p_mode, v_stake, coalesce(v_rating, 1200))
  returning * into v_ticket;

  perform public.matchmaking_tick();
  select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
  return jsonb_build_object('ticket', public.ticket_public(v_ticket));
end;
$$;

-- The helper is redefined after lockdown migrations; keep maintenance callable
-- only through the separately permission-checked admin RPC or trusted jobs.
revoke execute on function public.cleanup_expired_data() from public, anon, authenticated;
revoke all on function public.admin_ensure_profile(text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_queue_join(text, text, text, integer) from public, anon, authenticated;

grant execute on function public.admin_ensure_profile(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_queue_join(text, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
