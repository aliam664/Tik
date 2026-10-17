-- DOZ ONLINE — 0001: initial schema
-- Tables, constraints and indexes for rooms / players / moves / events / admin / audit / rate limits.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Platform settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id integer primary key default 1 check (id = 1),
  room_ttl_hours integer not null default 3 check (room_ttl_hours between 1 and 48),
  max_rooms_per_ip_per_hour integer not null default 8 check (max_rooms_per_ip_per_hour between 1 and 200),
  max_joins_per_ip_per_hour integer not null default 40 check (max_joins_per_ip_per_hour between 1 and 600),
  maintenance_mode boolean not null default false,
  maintenance_message text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Rooms — the authoritative game state.
-- NOTE: no secrets live here (player tokens are stored only as hashes in
-- room_players which is never exposed through the API).
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique
    check (room_code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'closed')),
  board text not null default '.........'
    check (char_length(board) = 9 and board ~ '^[XO.]{9}$'),
  current_turn text not null default 'X' check (current_turn in ('X', 'O')),
  winner text check (winner in ('X', 'O')),
  is_draw boolean not null default false,
  winning_cells integer[] not null default '{}',
  move_count integer not null default 0 check (move_count between 0 and 9),
  game_number integer not null default 1 check (game_number between 1 and 1000),
  rematch_requested_by text check (rematch_requested_by in ('X', 'O')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index idx_rooms_status_expires on public.rooms (status, expires_at);
create index idx_rooms_expires on public.rooms (expires_at);
create index idx_rooms_last_activity on public.rooms (last_activity_at desc);

-- ---------------------------------------------------------------------------
-- Room players — one row per seat (max 2 per room). Raw tokens are NEVER
-- stored; only a SHA-256 hash used for server-side verification.
-- ---------------------------------------------------------------------------
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  symbol text not null check (symbol in ('X', 'O')),
  display_name text not null check (char_length(display_name) between 2 and 24),
  token_hash text not null unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, symbol)
);

create index idx_players_room on public.room_players (room_id);
create index idx_players_last_seen on public.room_players (last_seen_at);

-- ---------------------------------------------------------------------------
-- Game moves — immutable move history (for admin inspection / debugging).
-- ---------------------------------------------------------------------------
create table public.game_moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_number integer not null,
  move_number integer not null,
  symbol text not null check (symbol in ('X', 'O')),
  cell_index integer not null check (cell_index between 0 and 8),
  board_after text not null check (char_length(board_after) = 9),
  created_at timestamptz not null default now(),
  unique (room_id, game_number, move_number)
);

create index idx_moves_room on public.game_moves (room_id, game_number, move_number);

-- ---------------------------------------------------------------------------
-- Game events — lifecycle log (public payload only, no secrets).
-- ---------------------------------------------------------------------------
create table public.game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_events_room on public.game_events (room_id, created_at);
create index idx_events_type on public.game_events (event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Admin accounts & sessions (independent from player guest flow).
-- Password hashes use pgcrypto bcrypt. Raw passwords are never stored.
-- ---------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique
    check (username ~ '^[a-z0-9_.-]{3,32}$'),
  password_hash text not null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  ip inet
);

create index idx_admin_sessions_expiry on public.admin_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Audit log — administrative actions (no secrets, ever).
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target text,
  result text not null check (result in ('success', 'failure')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_created on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting hits (append-only, cleaned up regularly).
-- ---------------------------------------------------------------------------
create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  client_ip inet not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index idx_rate_ip_action_time on public.rate_limit_hits (client_ip, action, created_at desc);
