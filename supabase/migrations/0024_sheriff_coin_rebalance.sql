-- DOZ ONLINE — 0024: Sheriff Coin economy rebalance.
--
-- Goals:
--   * one atomic, server-side cap for every repeatable gameplay faucet;
--   * precise per-game reward budgets and a slower achievement/season faucet;
--   * ledger source/flow telemetry that excludes wager principal from issuance;
--   * payout-friendly wager limits (100..300 SH) aligned with the daily loss cap;
--   * persistent cosmetic ownership/equip state and longer-term prestige sinks;
--   * a hardened minimum campaign effort for Last Night.
--
-- Sheriff Coin remains virtual, non-redeemable and cosmetic-only.

-- ---------------------------------------------------------------------------
-- Tuned economy model (version 2026-10-23).
-- ---------------------------------------------------------------------------

insert into public.economy_config_history (key, old_value, new_value, changed_by, reason)
select v.key, ec.value, v.value, 'migration_0024', 'Sheriff Coin professional economy rebalance'
from (values
  ('starting_balance', '150'),
  ('elo_start', '1000'),
  ('win_reward', '12'),
  ('draw_reward', '6'),
  ('loss_reward', '3'),
  ('first_win_bonus', '8'),
  ('streak_bonus', '2'),
  ('streak_bonus_cap', '6'),
  ('daily_earning_cap', '150'),
  ('rake_percent', '7'),
  ('draw_rake_percent', '0'),
  ('word_cipher_win_reward', '24'),
  ('word_cipher_play_reward', '10'),
  ('code_breaker_win_reward', '12'),
  ('code_breaker_play_reward', '4'),
  ('last_night_campaign_reward', '75'),
  ('wager_min_bet', '100'),
  ('wager_max_bet', '300'),
  ('economy_model_version', '2026-10-23')
) as v(key, value)
left join public.economy_config ec on ec.key = v.key
where ec.value is distinct from v.value;

insert into public.economy_config (key, value, updated_at, updated_by)
values
  ('starting_balance', '150', now(), 'migration_0024'),
  ('elo_start', '1000', now(), 'migration_0024'),
  ('win_reward', '12', now(), 'migration_0024'),
  ('draw_reward', '6', now(), 'migration_0024'),
  ('loss_reward', '3', now(), 'migration_0024'),
  ('first_win_bonus', '8', now(), 'migration_0024'),
  ('streak_bonus', '2', now(), 'migration_0024'),
  ('streak_bonus_cap', '6', now(), 'migration_0024'),
  ('daily_earning_cap', '150', now(), 'migration_0024'),
  ('rake_percent', '7', now(), 'migration_0024'),
  ('draw_rake_percent', '0', now(), 'migration_0024'),
  ('word_cipher_win_reward', '24', now(), 'migration_0024'),
  ('word_cipher_play_reward', '10', now(), 'migration_0024'),
  ('code_breaker_win_reward', '12', now(), 'migration_0024'),
  ('code_breaker_play_reward', '4', now(), 'migration_0024'),
  ('last_night_campaign_reward', '75', now(), 'migration_0024'),
  ('wager_min_bet', '100', now(), 'migration_0024'),
  ('wager_max_bet', '300', now(), 'migration_0024'),
  ('economy_model_version', '2026-10-23', now(), 'migration_0024')
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

-- A new account starts in Silver rather than immediately qualifying for Gold.
-- Registration relies on table defaults, while season reset reads elo_start.
alter table public.player_ratings alter column rating set default 1000;
alter table public.player_ratings alter column peak_rating set default 1000;

-- Preserve played accounts, but reset untouched legacy 1200 accounts safely.
update public.player_ratings r
set rating = 1000,
    peak_rating = 1000
from public.player_stats s
where s.player_id = r.player_id
  and s.games = 0
  and r.rating = 1200
  and r.peak_rating = 1200;

-- Played legacy accounts at/above Gold are grandfathered into the badge without
-- minting the formerly accidental reward on their next settlement.
insert into public.player_achievements (player_id, achievement_id)
select r.player_id, a.id
from public.player_ratings r
join public.player_stats s on s.player_id = r.player_id and s.games > 0
cross join public.achievements a
where a.code = 'gold_tier' and r.rating >= 1200
on conflict do nothing;

update public.achievements
set reward_coins = case code
  when 'first_win' then 20
  when 'wins_10' then 40
  when 'wins_100' then 150
  when 'streak_5' then 30
  when 'games_50' then 50
  when 'stake_first' then 15
  when 'gold_tier' then 100
  else reward_coins
end
where code in ('first_win', 'wins_10', 'wins_100', 'streak_5', 'games_50', 'stake_first', 'gold_tier');

-- ---------------------------------------------------------------------------
-- Source-aware ledger. Wager debits/payouts are transfers, never faucets.
-- ---------------------------------------------------------------------------

alter table public.wallet_ledger add column if not exists source text;
alter table public.wallet_ledger add column if not exists flow_kind text;

create or replace function public.economy_flow_kind(p_reason text, p_amount bigint)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_reason in ('stake_lock', 'stake_payout', 'stake_refund', 'stake_loss',
                      'crash_bet', 'crash_payout', 'dice_bet', 'dice_payout') then 'transfer'
    when p_amount > 0 then 'faucet'
    when p_amount < 0 then 'sink'
    else 'neutral'
  end;
$$;

create or replace function public.economy_source_for(
  p_reason text,
  p_ref_id uuid default null,
  p_note text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_reason in ('crash_bet', 'crash_payout') then return 'sheriff_blast'; end if;
  if p_reason in ('dice_bet', 'dice_payout') then return 'sheriff_dice'; end if;
  if p_reason in ('stake_lock', 'stake_payout', 'stake_refund', 'stake_loss') then return 'classic_stakes'; end if;
  if p_reason = 'welcome' then return 'onboarding'; end if;
  if p_reason = 'achievement' then return 'achievement'; end if;
  if p_reason = 'season_reward' then return 'season'; end if;
  if p_reason in ('shop_purchase', 'name_change') then return 'shop'; end if;
  if p_reason in ('admin_adjust', 'admin_clawback') then return 'admin'; end if;
  if p_reason = 'event_reward' then return 'live_ops'; end if;
  if p_reason in ('daily_bonus', 'rescue_grant') then return 'retention'; end if;

  if p_ref_id is not null then
    if exists (select 1 from public.ln_rooms where id = p_ref_id) then return 'last_night'; end if;
    if exists (select 1 from public.wg_rooms where id = p_ref_id) then return 'word_cipher'; end if;
    if exists (select 1 from public.cb_rounds where id = p_ref_id) then return 'code_breaker'; end if;
    if exists (select 1 from public.rooms where id = p_ref_id) then return 'classic_ranked'; end if;
  end if;

  return 'platform';
end;
$$;

create or replace function public.classify_wallet_ledger_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.source := coalesce(nullif(new.source, ''), public.economy_source_for(new.reason, new.ref_id, new.note));
  new.flow_kind := coalesce(nullif(new.flow_kind, ''), public.economy_flow_kind(new.reason, new.amount));
  return new;
end;
$$;

drop trigger if exists trg_wallet_ledger_classify on public.wallet_ledger;
create trigger trg_wallet_ledger_classify
before insert on public.wallet_ledger
for each row execute function public.classify_wallet_ledger_row();

update public.wallet_ledger
set source = public.economy_source_for(reason, ref_id, note),
    flow_kind = public.economy_flow_kind(reason, amount)
where source is null or flow_kind is null;

alter table public.wallet_ledger alter column source set not null;
alter table public.wallet_ledger alter column flow_kind set not null;
alter table public.wallet_ledger
  add constraint wallet_ledger_flow_kind_check
  check (flow_kind in ('faucet', 'sink', 'transfer', 'neutral'));

create index if not exists idx_wallet_ledger_source_time
  on public.wallet_ledger (source, created_at desc);
create index if not exists idx_wallet_ledger_flow_time
  on public.wallet_ledger (flow_kind, created_at desc);

-- ---------------------------------------------------------------------------
-- One atomic daily budget shared by all repeatable gameplay rewards.
-- ---------------------------------------------------------------------------

create table public.daily_gameplay_rewards (
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  reward_day date not null,
  earned bigint not null default 0 check (earned >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, reward_day)
);

create table public.gameplay_reward_claims (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  source text not null,
  reason text not null,
  ref_id uuid,
  requested_amount bigint not null check (requested_amount >= 0),
  granted_amount bigint not null check (granted_amount >= 0),
  daily_total_after bigint not null check (daily_total_after >= 0),
  created_at timestamptz not null default now()
);

create index idx_gameplay_reward_claims_player_time
  on public.gameplay_reward_claims (player_id, created_at desc);
create index idx_gameplay_reward_claims_source_time
  on public.gameplay_reward_claims (source, created_at desc);

alter table public.daily_gameplay_rewards enable row level security;
alter table public.gameplay_reward_claims enable row level security;
revoke all on public.daily_gameplay_rewards, public.gameplay_reward_claims from public, anon, authenticated;
revoke all on sequence public.gameplay_reward_claims_id_seq from public, anon, authenticated;

-- Seed today's atomic counters from legacy ledger history before replacing the helper.
insert into public.daily_gameplay_rewards (player_id, reward_day, earned)
select player_id, current_date, coalesce(sum(amount), 0)
from public.wallet_ledger
where amount > 0
  and reason in ('win_reward', 'draw_reward', 'loss_reward', 'daily_bonus',
                 'first_win', 'streak_bonus', 'event_reward', 'rescue_grant')
  and created_at >= date_trunc('day', now())
group by player_id
on conflict (player_id, reward_day) do update
set earned = excluded.earned,
    updated_at = now();

create or replace function public.coins_grant(
  p_player_id uuid,
  p_amount bigint,
  p_reason text,
  p_ref_id uuid default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
  v_frozen boolean;
  v_amount bigint := p_amount;
  v_requested bigint := 0;
  v_source text;
  v_cap bigint;
  v_earned bigint;
  v_repeatable boolean;
begin
  select w.balance, pp.wallet_frozen
  into v_balance, v_frozen
  from public.wallets w
  join public.player_profiles pp on pp.id = w.player_id
  where w.player_id = p_player_id
  for update of w;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  v_source := public.economy_source_for(p_reason, p_ref_id, p_note);

  -- Normalize legacy callers to the centrally configured per-game schedule.
  if p_amount > 0 and v_source = 'word_cipher' then
    v_amount := case when p_amount >= 20
      then public.cfg_int('word_cipher_win_reward', 24)
      else public.cfg_int('word_cipher_play_reward', 10) end;
  elsif p_amount > 0 and v_source = 'code_breaker' then
    v_amount := case when coalesce(p_note, '') like '%پیروزی%'
      then public.cfg_int('code_breaker_win_reward', 12)
      else public.cfg_int('code_breaker_play_reward', 4) end;
  elsif p_amount > 0 and v_source = 'last_night' then
    v_amount := public.cfg_int('last_night_campaign_reward', 75);
  elsif p_amount > 0 and p_reason = 'season_reward' then
    v_amount := case p_amount
      when 4000 then 600
      when 2000 then 400
      when 1000 then 275
      when 500 then 180
      when 250 then 100
      else 50
    end;
  end if;

  v_requested := greatest(0, v_amount);

  if v_amount = 0 then return v_balance; end if;

  if v_frozen and v_amount < 0 and p_reason not in ('admin_clawback') then
    raise exception 'WALLET_FROZEN';
  end if;

  v_repeatable := v_amount > 0 and p_reason in (
    'win_reward', 'draw_reward', 'loss_reward', 'daily_bonus',
    'first_win', 'streak_bonus', 'event_reward', 'rescue_grant'
  );

  if v_repeatable then
    v_cap := public.cfg_int('daily_earning_cap', 150);
    insert into public.daily_gameplay_rewards (player_id, reward_day, earned)
    values (p_player_id, current_date, 0)
    on conflict (player_id, reward_day) do nothing;

    select earned into v_earned
    from public.daily_gameplay_rewards
    where player_id = p_player_id and reward_day = current_date
    for update;

    v_amount := least(v_amount, greatest(0, v_cap - v_earned));
    v_earned := v_earned + v_amount;

    update public.daily_gameplay_rewards
    set earned = v_earned, updated_at = now()
    where player_id = p_player_id and reward_day = current_date;

    insert into public.gameplay_reward_claims (
      player_id, source, reason, ref_id, requested_amount, granted_amount, daily_total_after
    ) values (
      p_player_id, v_source, p_reason, p_ref_id, v_requested, v_amount, v_earned
    );

    if v_amount = 0 then return v_balance; end if;
  end if;

  v_balance := v_balance + v_amount;
  if v_balance < 0 then raise exception 'INSUFFICIENT_FUNDS'; end if;

  update public.wallets set balance = v_balance where player_id = p_player_id;

  insert into public.wallet_ledger (
    player_id, amount, balance_after, reason, ref_id, note, source, flow_kind
  ) values (
    p_player_id, v_amount, v_balance, p_reason, p_ref_id, p_note,
    v_source, public.economy_flow_kind(p_reason, v_amount)
  );

  return v_balance;
end;
$$;

create or replace function public.coins_earned_today(p_player_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select earned from public.daily_gameplay_rewards
    where player_id = p_player_id and reward_day = current_date
  ), 0)::bigint;
$$;

revoke all on function public.economy_flow_kind(text, bigint) from public, anon, authenticated;
revoke all on function public.economy_source_for(text, uuid, text) from public, anon, authenticated;
revoke all on function public.classify_wallet_ledger_row() from public, anon, authenticated;
revoke all on function public.coins_grant(uuid, bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function public.coins_earned_today(uuid) from public, anon, authenticated;

-- Word Cipher rooms always carry the live configured reward schedule.
create or replace function public.balance_word_cipher_rewards()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.rules := jsonb_set(
    jsonb_set(coalesce(new.rules, '{}'::jsonb), '{sheriffCoinWinReward}', to_jsonb(public.cfg_int('word_cipher_win_reward', 24)), true),
    '{sheriffCoinPlayReward}', to_jsonb(public.cfg_int('word_cipher_play_reward', 10)), true
  );
  return new;
end;
$$;

drop trigger if exists trg_wg_rooms_balance_rewards on public.wg_rooms;
create trigger trg_wg_rooms_balance_rewards
before insert or update of rules on public.wg_rooms
for each row execute function public.balance_word_cipher_rewards();

update public.wg_rooms set rules = rules;

-- Keep Last Night's public settlement aligned with the amount actually granted.
create or replace function public.balance_last_night_settlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'victory' and coalesce(new.settlement, '{}'::jsonb) ? 'platform_bonus_sh' then
    new.settlement := jsonb_set(
      new.settlement,
      '{platform_bonus_sh}',
      to_jsonb(public.cfg_int('last_night_campaign_reward', 75)),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ln_rooms_balance_settlement on public.ln_rooms;
create trigger trg_ln_rooms_balance_settlement
before insert or update of settlement, status on public.ln_rooms
for each row execute function public.balance_last_night_settlement();

-- Season standings and the central grant use the same bounded schedule.
create or replace function public.balance_season_reward()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.rewards_coins := case
    when new.rating_final >= 1800 then 600
    when new.rating_final >= 1600 then 400
    when new.rating_final >= 1400 then 275
    when new.rating_final >= 1200 then 180
    when new.rating_final >= 1000 then 100
    else 50
  end;
  return new;
end;
$$;

drop trigger if exists trg_season_standings_balance_reward on public.season_standings;
create trigger trg_season_standings_balance_reward
before insert or update of rating_final, rewards_coins on public.season_standings
for each row execute function public.balance_season_reward();

revoke all on function public.balance_word_cipher_rewards() from public, anon, authenticated;
revoke all on function public.balance_last_night_settlement() from public, anon, authenticated;
revoke all on function public.balance_season_reward() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wager precision and responsible limits.
-- A 100 SH minimum makes every hundredth-multiplier payout exact; 300 SH max
-- cannot exceed the shared daily loss budget in a single bet.
-- ---------------------------------------------------------------------------

alter table public.dice_bets drop constraint if exists dice_bets_amount_check;
alter table public.dice_bets
  add constraint dice_bets_amount_check check (amount between 100 and 300);

alter function public.crash_get_state(text) rename to crash_get_state_before_0024;
alter function public.crash_place_bet(text, integer, integer, smallint) rename to crash_place_bet_before_0024;
alter function public.dice_get_state(text) rename to dice_get_state_before_0024;
alter function public.dice_place_bet(text, integer, text, integer) rename to dice_place_bet_before_0024;

create function public.crash_get_state(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb;
begin
  v_state := public.crash_get_state_before_0024(p_token);
  return jsonb_set(
    jsonb_set(v_state, '{limits,min_bet}', to_jsonb(public.cfg_int('wager_min_bet', 100)), true),
    '{limits,max_bet}', to_jsonb(public.cfg_int('wager_max_bet', 300)), true
  );
end;
$$;

create function public.crash_place_bet(
  p_token text,
  p_amount integer,
  p_auto_at integer default null,
  p_slot smallint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_amount is null
     or p_amount < public.cfg_int('wager_min_bet', 100)
     or p_amount > public.cfg_int('wager_max_bet', 300) then
    raise exception 'INVALID_STAKE';
  end if;
  return public.crash_place_bet_before_0024(p_token, p_amount, p_auto_at, p_slot);
end;
$$;

create function public.dice_get_state(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb;
begin
  v_state := public.dice_get_state_before_0024(p_token);
  return jsonb_set(
    jsonb_set(v_state, '{limits,min_bet}', to_jsonb(public.cfg_int('wager_min_bet', 100)), true),
    '{limits,max_bet}', to_jsonb(public.cfg_int('wager_max_bet', 300)), true
  );
end;
$$;

create function public.dice_place_bet(
  p_token text,
  p_amount integer,
  p_side text,
  p_target integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_amount is null
     or p_amount < public.cfg_int('wager_min_bet', 100)
     or p_amount > public.cfg_int('wager_max_bet', 300) then
    raise exception 'INVALID_STAKE';
  end if;
  return public.dice_place_bet_before_0024(p_token, p_amount, p_side, p_target);
end;
$$;

revoke all on function public.crash_get_state_before_0024(text) from public, anon, authenticated;
revoke all on function public.crash_place_bet_before_0024(text, integer, integer, smallint) from public, anon, authenticated;
revoke all on function public.dice_get_state_before_0024(text) from public, anon, authenticated;
revoke all on function public.dice_place_bet_before_0024(text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.crash_get_state(text) from public, anon, authenticated;
revoke all on function public.crash_place_bet(text, integer, integer, smallint) from public, anon, authenticated;
revoke all on function public.dice_get_state(text) from public, anon, authenticated;
revoke all on function public.dice_place_bet(text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.crash_get_state(text) to anon, authenticated;
grant execute on function public.crash_place_bet(text, integer, integer, smallint) to anon, authenticated;
grant execute on function public.dice_get_state(text) to anon, authenticated;
grant execute on function public.dice_place_bet(text, integer, text, integer) to anon, authenticated;

-- Make the temporary/persistent currency boundary explicit in every room state.
alter function public.ln_room_public_state(public.ln_rooms) rename to ln_room_public_state_before_0024;

create function public.ln_room_public_state(p_room public.ln_rooms)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_set(
    public.ln_room_public_state_before_0024(p_room),
    '{currency_name}',
    to_jsonb('Run Coin'::text),
    true
  );
$$;

revoke all on function public.ln_room_public_state_before_0024(public.ln_rooms) from public, anon, authenticated;
revoke all on function public.ln_room_public_state(public.ln_rooms) from public, anon, authenticated;

-- Last Night used to accept a client-reported completion after only ~6 minutes.
-- The wrapper requires the full deterministic roster to have been reported and
-- sets an 18-minute minimum campaign floor (45s base / 18s per wave number).
alter function public.ln_sync_action(text, text, text, jsonb) rename to ln_sync_action_before_0024;

create function public.ln_sync_action(
  p_room_code text,
  p_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_kills integer;
  v_required_kills integer;
  v_min_seconds numeric;
begin
  if p_action = 'wave_cleared' then
    select * into v_room
    from public.ln_rooms
    where room_code = upper(btrim(coalesce(p_room_code, '')));

    if found and v_room.status = 'active' and v_room.phase in ('combat', 'boss') then
      if not exists (
        select 1 from public.ln_room_players
        where room_id = v_room.id and token_hash = public.hash_token(p_token)
      ) then
        raise exception 'PLAYER_UNAUTHORIZED';
      end if;

      v_required_kills := 7 + (v_room.wave * 2);
      select coalesce(sum(combat_kills_wave), 0)::integer into v_kills
      from public.ln_room_players where room_id = v_room.id;

      v_min_seconds := greatest(
        45::numeric,
        v_room.wave * 18::numeric,
        case when v_room.wave in (4, 7, 10) then 120::numeric else 0::numeric end
      );

      if v_room.wave_started_at is null
         or extract(epoch from (now() - v_room.wave_started_at)) < v_min_seconds
         or v_kills < v_required_kills then
        raise exception 'WAVE_NOT_COMPLETE';
      end if;
    end if;
  end if;

  return public.ln_sync_action_before_0024(p_room_code, p_token, p_action, p_payload);
end;
$$;

revoke all on function public.ln_sync_action_before_0024(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ln_sync_action(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ln_sync_action(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Persistent cosmetic inventory + equip/apply flow.
-- ---------------------------------------------------------------------------

create table public.player_equipped_cosmetics (
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  kind text not null check (kind in ('board_theme', 'mark', 'frame', 'title', 'sound')),
  item_id uuid not null references public.shop_items(id) on delete cascade,
  equipped_at timestamptz not null default now(),
  primary key (player_id, kind),
  unique (player_id, item_id)
);

alter table public.player_equipped_cosmetics enable row level security;
revoke all on public.player_equipped_cosmetics from public, anon, authenticated;

create or replace function public.equip_shop_item(p_token text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid;
  v_item public.shop_items;
begin
  v_player := public.assert_player_token(p_token);

  select si.* into v_item
  from public.shop_items si
  join public.player_inventory pi
    on pi.item_id = si.id and pi.player_id = v_player
  where si.id = p_item_id and si.active;

  if not found then raise exception 'ITEM_NOT_OWNED'; end if;

  insert into public.player_equipped_cosmetics (player_id, kind, item_id, equipped_at)
  values (v_player, v_item.kind, v_item.id, now())
  on conflict (player_id, kind) do update
  set item_id = excluded.item_id,
      equipped_at = excluded.equipped_at;

  return jsonb_build_object(
    'ok', true,
    'item', jsonb_build_object(
      'id', v_item.id, 'sku', v_item.sku, 'name', v_item.name,
      'kind', v_item.kind, 'rarity', v_item.rarity
    )
  );
end;
$$;

revoke all on function public.equip_shop_item(text, uuid) from public, anon, authenticated;
grant execute on function public.equip_shop_item(text, uuid) to anon, authenticated;

-- Extend profile output without duplicating the battle-tested legacy projection.
alter function public.get_my_profile(text) rename to get_my_profile_before_0024;

create function public.get_my_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid;
  v_base jsonb;
  v_earned bigint;
  v_cap bigint;
begin
  v_player := public.assert_player_token(p_token);
  v_base := public.get_my_profile_before_0024(p_token);
  v_earned := public.coins_earned_today(v_player);
  v_cap := public.cfg_int('daily_earning_cap', 150);

  return v_base || jsonb_build_object(
    'daily_gameplay', jsonb_build_object(
      'earned', v_earned,
      'cap', v_cap,
      'remaining', greatest(0, v_cap - v_earned),
      'resets_at', to_jsonb(date_trunc('day', now()) + interval '1 day')
    ),
    'inventory', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', si.id,
        'sku', si.sku,
        'name', si.name,
        'kind', si.kind,
        'price', si.price,
        'rarity', si.rarity,
        'acquired_at', to_jsonb(pi.acquired_at),
        'equipped', (pec.item_id is not null)
      ) order by pi.acquired_at desc), '[]'::jsonb)
      from public.player_inventory pi
      join public.shop_items si on si.id = pi.item_id
      left join public.player_equipped_cosmetics pec
        on pec.player_id = pi.player_id and pec.item_id = pi.item_id
      where pi.player_id = v_player
    ),
    'equipped', (
      select coalesce(jsonb_object_agg(pec.kind, jsonb_build_object(
        'id', si.id,
        'sku', si.sku,
        'name', si.name,
        'kind', si.kind,
        'rarity', si.rarity
      )), '{}'::jsonb)
      from public.player_equipped_cosmetics pec
      join public.shop_items si on si.id = pec.item_id
      where pec.player_id = v_player
    )
  );
end;
$$;

revoke all on function public.get_my_profile_before_0024(text) from public, anon, authenticated;
revoke all on function public.get_my_profile(text) from public, anon, authenticated;
grant execute on function public.get_my_profile(text) to anon, authenticated;

-- First purchase is immediately reachable from the 150 SH onboarding balance;
-- prestige items extend the complete catalogue to roughly 96 capped earn-days.
insert into public.shop_items (sku, name, kind, price, rarity) values
  ('title_salon_legend', 'عنوان: افسانه سالن', 'title', 1800, 'epic'),
  ('frame_sheriff_elite', 'قاب کلانتر ممتاز', 'frame', 3000, 'legendary'),
  ('theme_midnight_empire', 'تم امپراتوری نیمه‌شب', 'board_theme', 5000, 'legendary')
on conflict (sku) do update
set name = excluded.name,
    kind = excluded.kind,
    price = excluded.price,
    rarity = excluded.rarity,
    active = true;

-- ---------------------------------------------------------------------------
-- Admin analytics: true faucets/sinks, source concentration and cap pressure.
-- Transfer net is exposed separately because it includes open wager holds.
-- ---------------------------------------------------------------------------

alter function public.admin_get_economy(text) rename to admin_get_economy_before_0024;

create function public.admin_get_economy(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base jsonb;
  v_faucet_24 bigint;
  v_sink_24 bigint;
  v_transfer_24 bigint;
  v_faucet_7 bigint;
  v_sink_7 bigint;
begin
  perform public.assert_admin_perm(p_admin_token, 'economy');
  v_base := public.admin_get_economy_before_0024(p_admin_token);

  select
    coalesce(sum(amount) filter (where flow_kind = 'faucet'), 0),
    coalesce(-sum(amount) filter (where flow_kind = 'sink'), 0),
    coalesce(sum(amount) filter (where flow_kind = 'transfer'), 0)
  into v_faucet_24, v_sink_24, v_transfer_24
  from public.wallet_ledger
  where created_at > now() - interval '24 hours';

  select
    coalesce(sum(amount) filter (where flow_kind = 'faucet'), 0),
    coalesce(-sum(amount) filter (where flow_kind = 'sink'), 0)
  into v_faucet_7, v_sink_7
  from public.wallet_ledger
  where created_at > now() - interval '7 days';

  return v_base || jsonb_build_object(
    'economy_model_version', coalesce((select value from public.economy_config where key = 'economy_model_version'), '2026-10-23'),
    'issued_24h', v_faucet_24,
    'burned_24h', v_sink_24,
    'transfer_net_24h', v_transfer_24,
    'issued_7d', v_faucet_7,
    'burned_7d', v_sink_7,
    'sink_coverage_7d', case when v_faucet_7 > 0
      then round(v_sink_7::numeric / v_faucet_7::numeric, 3)
      else 0 end,
    'faucets_7d', (
      select coalesce(jsonb_agg(f order by f.total desc), '[]'::jsonb)
      from (
        select source, sum(amount) as total, count(*) as cnt
        from public.wallet_ledger
        where flow_kind = 'faucet' and created_at > now() - interval '7 days'
        group by source
      ) f
    ),
    'sinks_7d', (
      select coalesce(jsonb_agg(s order by s.total desc), '[]'::jsonb)
      from (
        select source, -sum(amount) as total, count(*) as cnt
        from public.wallet_ledger
        where flow_kind = 'sink' and created_at > now() - interval '7 days'
        group by source
      ) s
    ),
    'by_source', (
      select coalesce(jsonb_agg(x order by abs(x.net) desc), '[]'::jsonb)
      from (
        select source,
          coalesce(sum(amount) filter (where flow_kind = 'faucet'), 0) as faucet,
          coalesce(-sum(amount) filter (where flow_kind = 'sink'), 0) as sink,
          coalesce(sum(amount) filter (where flow_kind = 'transfer'), 0) as transfer_net,
          sum(amount) as net,
          count(*) as tx_count
        from public.wallet_ledger
        where created_at > now() - interval '7 days'
        group by source
      ) x
    ),
    'reward_cap_7d', (
      select jsonb_build_object(
        'claims', count(*),
        'requested', coalesce(sum(requested_amount), 0),
        'granted', coalesce(sum(granted_amount), 0),
        'blocked', coalesce(sum(requested_amount - granted_amount), 0),
        'players_capped', count(distinct player_id) filter (where granted_amount < requested_amount)
      )
      from public.gameplay_reward_claims
      where created_at > now() - interval '7 days'
    ),
    'snapshots', (
      select coalesce(jsonb_agg(sn order by sn.day desc), '[]'::jsonb)
      from (
        select d.day::date::text as day,
          coalesce(sum(wl.amount) filter (where wl.flow_kind = 'faucet'), 0) as issued_today,
          coalesce(-sum(wl.amount) filter (where wl.flow_kind = 'sink'), 0) as burned_today
        from generate_series(
          date_trunc('day', now()) - interval '6 days',
          date_trunc('day', now()),
          interval '1 day'
        ) as d(day)
        left join public.wallet_ledger wl
          on wl.created_at >= d.day and wl.created_at < d.day + interval '1 day'
        group by d.day
      ) sn
    )
  );
end;
$$;

revoke all on function public.admin_get_economy_before_0024(text) from public, anon, authenticated;
revoke all on function public.admin_get_economy(text) from public, anon, authenticated;
grant execute on function public.admin_get_economy(text) to anon, authenticated;

-- Private tables remain inaccessible; only explicit SECURITY DEFINER RPCs are public.
revoke all on function public.ln_sync_action_before_0024(text, text, text, jsonb) from public;
revoke all on function public.ln_room_public_state_before_0024(public.ln_rooms) from public;
revoke all on function public.crash_get_state_before_0024(text) from public;
revoke all on function public.crash_place_bet_before_0024(text, integer, integer, smallint) from public;
revoke all on function public.dice_get_state_before_0024(text) from public;
revoke all on function public.dice_place_bet_before_0024(text, integer, text, integer) from public;
revoke all on function public.get_my_profile_before_0024(text) from public;
revoke all on function public.admin_get_economy_before_0024(text) from public;

notify pgrst, 'reload schema';
