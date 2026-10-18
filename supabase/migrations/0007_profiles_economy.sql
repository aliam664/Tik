-- SHARIFCOIN / DOZ ONLINE — 0007: persistent profiles, economy & competitive schema
-- Player identity (guest profile + recovery code), wallet + append-only ledger,
-- stats, Elo ratings, matches history, matchmaking queue, stake escrow, seasons,
-- shop, achievements, risk flags, bans, versioned economy config.

-- ---------------------------------------------------------------------------
-- Player profiles — persistent identity (Phase 0).
-- Raw tokens & recovery codes are NEVER stored; only SHA-256 hashes.
-- ---------------------------------------------------------------------------
create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 24),
  token_hash text not null unique,
  recovery_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'banned')),
  wallet_frozen boolean not null default false,
  register_ip inet,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_profiles_created on public.player_profiles (created_at desc);
create index idx_profiles_register_ip on public.player_profiles (register_ip);

-- ---------------------------------------------------------------------------
-- Player stats (one row per profile).
-- ---------------------------------------------------------------------------
create table public.player_stats (
  player_id uuid primary key references public.player_profiles (id) on delete cascade,
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  forfeits_for integer not null default 0 check (forfeits_for >= 0),
  forfeits_against integer not null default 0 check (forfeits_against >= 0),
  win_streak integer not null default 0 check (win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= 0),
  stakes_played integer not null default 0 check (stakes_played >= 0),
  stakes_won integer not null default 0 check (stakes_won >= 0),
  first_win_claimed_on date,
  last_played_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Elo ratings (one row per profile).
-- ---------------------------------------------------------------------------
create table public.player_ratings (
  player_id uuid primary key references public.player_profiles (id) on delete cascade,
  rating integer not null default 1200 check (rating between 100 and 3000),
  peak_rating integer not null default 1200 check (peak_rating between 100 and 3000),
  placement_left integer not null default 10 check (placement_left between 0 and 10),
  season_id uuid
);

-- ---------------------------------------------------------------------------
-- Wallets + append-only ledger (audit backbone of the whole economy).
-- ---------------------------------------------------------------------------
create table public.wallets (
  player_id uuid primary key references public.player_profiles (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0)
);

create table public.wallet_ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (reason in (
    'welcome', 'win_reward', 'draw_reward', 'loss_reward', 'daily_bonus',
    'first_win', 'streak_bonus', 'achievement', 'season_reward', 'rescue_grant',
    'event_reward', 'stake_lock', 'stake_payout', 'stake_refund', 'stake_loss',
    'shop_purchase', 'name_change', 'admin_adjust', 'admin_clawback'
  )),
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index idx_ledger_player_time on public.wallet_ledger (player_id, created_at desc);
create index idx_ledger_reason_time on public.wallet_ledger (reason, created_at desc);

-- ---------------------------------------------------------------------------
-- Matches — permanent result records (survive room cleanup; NOT cascading).
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid,
  room_code text,
  game_number integer not null default 1,
  mode text not null check (mode in ('friendly', 'ranked', 'stakes')),
  stake integer not null default 0 check (stake >= 0),
  player_x uuid references public.player_profiles (id) on delete set null,
  player_o uuid references public.player_profiles (id) on delete set null,
  winner_symbol text check (winner_symbol in ('X', 'O')),
  is_draw boolean not null default false,
  forfeit boolean not null default false,
  move_count integer not null default 0 check (move_count between 0 and 9),
  rating_x_before integer,
  rating_x_after integer,
  rating_o_before integer,
  rating_o_after integer,
  coins_x bigint,
  coins_o bigint,
  rake integer not null default 0 check (rake >= 0),
  started_at timestamptz,
  finished_at timestamptz not null default now()
);

create index idx_matches_finished on public.matches (finished_at desc);
create index idx_matches_player_x on public.matches (player_x, finished_at desc);
create index idx_matches_player_o on public.matches (player_o, finished_at desc);
create index idx_matches_pair on public.matches (player_x, player_o, finished_at desc);

-- ---------------------------------------------------------------------------
-- Matchmaking queue tickets.
-- ---------------------------------------------------------------------------
create table public.matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  mode text not null check (mode in ('ranked', 'stakes')),
  stake integer not null default 0 check (stake >= 0),
  rating integer not null default 1200,
  status text not null default 'searching'
    check (status in ('searching', 'matched', 'accepted', 'closed', 'cancelled', 'dodged', 'expired')),
  match_id uuid,
  room_id uuid,
  accept_deadline timestamptz,
  enqueued_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index idx_tickets_one_open_per_mode
  on public.matchmaking_tickets (player_id, mode)
  where status in ('searching', 'matched', 'accepted');

create index idx_tickets_searching on public.matchmaking_tickets (mode, stake, rating)
  where status = 'searching';
create index idx_tickets_open on public.matchmaking_tickets (enqueued_at)
  where status in ('searching', 'matched', 'accepted');

-- one active stake escrow per player
create table public.stake_escrows (
  id uuid primary key default gen_random_uuid(),
  match_id uuid,
  room_id uuid,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'locked'
    check (status in ('locked', 'released', 'refunded', 'forfeited', 'raked')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create unique index idx_escrows_one_locked
  on public.stake_escrows (player_id)
  where status = 'locked';

create index idx_escrows_status on public.stake_escrows (status, created_at);

-- ---------------------------------------------------------------------------
-- Seasons & standings.
-- ---------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'finished')),
  reset_factor numeric(3,2) not null default 0.70 check (reset_factor between 0 and 1)
);

create table public.season_standings (
  season_id uuid not null references public.seasons (id) on delete cascade,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  rating_final integer not null default 1200,
  tier text,
  games integer not null default 0,
  rewards_coins integer not null default 0,
  rewards_claimed boolean not null default false,
  primary key (season_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Cosmetics shop + inventory (purely cosmetic — never power).
-- ---------------------------------------------------------------------------
create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  kind text not null check (kind in ('board_theme', 'mark', 'frame', 'title', 'sound')),
  price integer not null check (price >= 0),
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.player_inventory (
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  item_id uuid not null references public.shop_items (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (player_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Achievements (one-time coin faucets).
-- ---------------------------------------------------------------------------
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  reward_coins integer not null default 0 check (reward_coins >= 0)
);

create table public.player_achievements (
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  achieved_at timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

insert into public.achievements (code, title, description, reward_coins) values
  ('first_win',      'اولین برد',       'اولین برد رسمی خود را به دست بیاور.',       50),
  ('wins_10',        'ده‌تا برنده',      '۱۰ بازی رسمی را ببر.',                      100),
  ('wins_100',       'استاد برد',        '۱۰۰ بازی رسمی را ببر.',                     500),
  ('streak_5',       'ردیف پیروزی',      '۵ برد پیاپی به دست بیاور.',                150),
  ('games_50',       'بازیکن فعال',      '۵۰ بازی رسمی انجام بده.',                   150),
  ('stake_first',    'اولین شرط',        'اولین بازی شرطی خود را تجربه کن.',          50),
  ('gold_tier',      'طلایی',            'به تیر طلا برس.',                            300),
  ('master_tier',    'استاد',            'به تیر استاد برس.',                          1000)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Risk flags & bans (integrity center).
-- ---------------------------------------------------------------------------
create table public.risk_flags (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'frequent_pair', 'alternating_wins', 'shared_ip', 'suspicious_perfect_play',
    'stake_loss_cap_hit', 'multi_account_cluster'
  )),
  subject_id uuid references public.player_profiles (id) on delete cascade,
  related_id uuid references public.player_profiles (id) on delete cascade,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution text,
  resolved_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_risk_open on public.risk_flags (status, created_at desc);
create index idx_risk_subject on public.risk_flags (subject_id, created_at desc);

create table public.bans (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  scope text not null default 'queue' check (scope in ('queue', 'stakes', 'global')),
  reason text not null default '',
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index idx_bans_player on public.bans (player_id, expires_at);

-- ---------------------------------------------------------------------------
-- Versioned economy config (live tunables — no client release needed).
-- ---------------------------------------------------------------------------
create table public.economy_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);

create table public.economy_config_history (
  id bigint generated always as identity primary key,
  key text not null,
  old_value text,
  new_value text,
  changed_by text not null,
  reason text,
  created_at timestamptz not null default now()
);

insert into public.economy_config (key, value) values
  ('win_reward',            '25'),
  ('draw_reward',           '10'),
  ('loss_reward',           '5'),
  ('daily_bonus',           '10'),
  ('first_win_bonus',       '25'),
  ('streak_bonus',          '5'),
  ('streak_bonus_cap',      '15'),
  ('daily_earning_cap',     '300'),
  ('starting_balance',      '100'),
  ('rescue_grant',          '25'),
  ('rescue_weekly_limit',   '2'),
  ('rake_percent',          '10'),
  ('rake_cap',              '20'),
  ('draw_rake_percent',     '5'),
  ('stake_daily_loss_cap',  '300'),
  ('stake_min_games',       '20'),
  ('stake_same_pair_week',  '5'),
  ('elo_start',             '1200'),
  ('elo_k_new',             '32'),
  ('elo_k_mid',             '24'),
  ('elo_k_pro',             '16'),
  ('elo_k_placement',       '40'),
  ('placement_games',       '10'),
  ('elo_x_advantage',       '40'),
  ('stakes_enabled',        '1'),
  ('ranked_enabled',        '1')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Daily economy snapshots (for the admin economy center).
-- ---------------------------------------------------------------------------
create table public.economy_snapshots (
  day date primary key,
  total_supply bigint not null default 0,
  issued_24h bigint not null default 0,
  burned_24h bigint not null default 0,
  active_players integer not null default 0,
  matches_24h integer not null default 0,
  median_balance bigint not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Announcements & scheduled events (live ops).
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  level text not null default 'info' check (level in ('info', 'warn', 'event')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('double_coins', 'discount_shop')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  params jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Rooms: competitive modes + settlement payload (safe for public state).
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column mode text not null default 'friendly'
    check (mode in ('friendly', 'ranked', 'stakes')),
  add column stake integer not null default 0 check (stake >= 0),
  add column settlement jsonb not null default '{}'::jsonb,
  add column forfeit boolean not null default false;

alter table public.room_players
  add column profile_id uuid references public.player_profiles (id) on delete set null;

create index idx_room_players_profile on public.room_players (profile_id);

-- ---------------------------------------------------------------------------
-- Admin roles (RBAC backbone; 0011 enforces it).
-- ---------------------------------------------------------------------------
alter table public.admin_users
  add column role text not null default 'owner'
    check (role in ('owner', 'admin', 'moderator', 'economy', 'support'));
