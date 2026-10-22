-- DOZ ONLINE — 0023: Sheriff Dice.
-- A server-authoritative shared live dice salon using virtual Sheriff Coin.
-- One committed global result per round; every player may place one UNDER/OVER
-- bet with a 2.00%–98.00% chance. The theoretical RTP is 99%.

create table public.dice_rounds (
  id uuid primary key default gen_random_uuid(),
  round_index bigint generated always as identity,
  seed text not null,
  seed_hash text not null,
  salt text not null,
  roll integer not null check (roll between 0 and 9999),
  phase text not null check (phase in ('betting', 'revealed')),
  betting_started_at timestamptz not null default now(),
  betting_ends_at timestamptz not null,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.dice_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.dice_rounds (id) on delete cascade,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  amount bigint not null check (amount between 10 and 500),
  side text not null check (side in ('under', 'over')),
  target integer not null check (target between 200 and 9800),
  chance_bps integer not null check (chance_bps between 200 and 9800),
  multiplier integer not null check (multiplier >= 101),
  won boolean,
  payout bigint not null default 0 check (payout >= 0),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table public.dice_table (
  id integer primary key default 1 check (id = 1),
  current_round_id uuid references public.dice_rounds (id)
);
insert into public.dice_table (id) values (1) on conflict do nothing;

create index idx_dice_rounds_recent on public.dice_rounds (round_index desc);
create index idx_dice_bets_round on public.dice_bets (round_id, created_at);
create index idx_dice_bets_player_time on public.dice_bets (player_id, created_at desc);

alter table public.dice_rounds enable row level security;
alter table public.dice_bets enable row level security;
alter table public.dice_table enable row level security;
revoke all on public.dice_rounds, public.dice_bets, public.dice_table from public, anon, authenticated;

-- 52 high HMAC bits scaled into [0, 10000). Scaling avoids the visible modulo
-- construction used by many demos and mirrors the integer client verifier.
create or replace function public.dice_roll_from_seed(p_seed text, p_salt text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_hmac text;
  v_r numeric;
  v_two numeric := 4503599627370496; -- 2^52
begin
  if p_seed is null or p_seed !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_SEED';
  end if;
  v_hmac := encode(
    extensions.hmac(convert_to(p_salt, 'UTF8'), decode(p_seed, 'hex'), 'sha256'),
    'hex'
  );
  v_r := (('x' || lpad(substr(v_hmac, 1, 13), 16, '0'))::bit(64)::bigint)::numeric;
  return least(9999, floor((v_r * 10000) / v_two))::integer;
end;
$$;

create or replace function public.dice_multiplier(p_target integer, p_side text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_chance integer;
begin
  if p_target < 200 or p_target > 9800 then raise exception 'INVALID_DICE_TARGET'; end if;
  if p_side not in ('under', 'over') then raise exception 'INVALID_DICE_SIDE'; end if;
  v_chance := case when p_side = 'under' then p_target else 10000 - p_target end;
  return floor(990000::numeric / v_chance)::integer;
end;
$$;

create or replace function public.dice_broadcast(p_event text default 'state')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.dice_rounds;
begin
  select r.* into v_round
  from public.dice_table t
  join public.dice_rounds r on r.id = t.current_round_id
  where t.id = 1;
  if not found then return; end if;
  begin
    perform realtime.send(
      jsonb_build_object('index', v_round.round_index, 'phase', v_round.phase, 'at', clock_timestamp()),
      p_event,
      'dice:salon',
      false
    );
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.dice_public_round(p_row public.dice_rounds)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'index', p_row.round_index,
    'phase', p_row.phase,
    'seed_hash', p_row.seed_hash,
    'seed', case when p_row.phase = 'revealed' then p_row.seed else null end,
    'salt', p_row.salt,
    'roll', case when p_row.phase = 'revealed' then p_row.roll else null end,
    'betting_ends_at', p_row.betting_ends_at,
    'revealed_at', p_row.revealed_at,
    'next_at', case
      when p_row.revealed_at is null then null
      else p_row.revealed_at + interval '3.5 seconds'
    end
  );
$$;

create or replace function public.dice_open_round()
returns public.dice_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seed text := encode(extensions.gen_random_bytes(32), 'hex');
  v_salt text;
  v_next bigint;
  v_row public.dice_rounds;
begin
  select coalesce(max(round_index), 0) + 1 into v_next from public.dice_rounds;
  v_salt := 'sheriff-dice:' || v_next::text;

  insert into public.dice_rounds (
    seed, seed_hash, salt, roll, phase, betting_started_at, betting_ends_at
  ) values (
    v_seed,
    encode(extensions.digest(decode(v_seed, 'hex'), 'sha256'), 'hex'),
    v_salt,
    public.dice_roll_from_seed(v_seed, v_salt),
    'betting',
    clock_timestamp(),
    clock_timestamp() + interval '8 seconds'
  ) returning * into v_row;

  update public.dice_table set current_round_id = v_row.id where id = 1;
  perform public.dice_broadcast('state');
  return v_row;
end;
$$;

create or replace function public.dice_advance_locked()
returns public.dice_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_row public.dice_rounds;
  v_bet public.dice_bets;
  v_won boolean;
  v_payout bigint;
  v_now timestamptz := clock_timestamp();
begin
  select current_round_id into v_id
  from public.dice_table
  where id = 1
  for update;

  if v_id is null then return public.dice_open_round(); end if;
  select * into v_row from public.dice_rounds where id = v_id for update;
  if not found then return public.dice_open_round(); end if;

  if v_row.phase = 'betting' and v_now >= v_row.betting_ends_at then
    v_row.phase := 'revealed';
    v_row.revealed_at := v_row.betting_ends_at;
    update public.dice_rounds
    set phase = 'revealed', revealed_at = v_row.revealed_at
    where id = v_row.id;

    for v_bet in
      select * from public.dice_bets
      where round_id = v_row.id
      order by player_id, id
      for update
    loop
      v_won := case
        when v_bet.side = 'under' then v_row.roll < v_bet.target
        else v_row.roll >= v_bet.target
      end;
      v_payout := case
        when v_won then floor((v_bet.amount::numeric * v_bet.multiplier::numeric) / 100)::bigint
        else 0
      end;
      update public.dice_bets set won = v_won, payout = v_payout where id = v_bet.id;
      if v_payout > 0 then
        perform public.coins_grant(
          v_bet.player_id,
          v_payout,
          'dice_payout',
          v_row.id,
          'برد تاس شریف'
        );
      end if;
    end loop;
    perform public.dice_broadcast('state');
  end if;

  if v_row.phase = 'revealed' and v_row.revealed_at is not null
     and v_now >= v_row.revealed_at + interval '3.5 seconds' then
    return public.dice_open_round();
  end if;
  return v_row;
end;
$$;

create or replace function public.dice_get_state(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.dice_rounds;
  v_player uuid := null;
  v_balance bigint := null;
  v_wagered bigint := 0;
  v_paid bigint := 0;
  v_cap integer := public.cfg_int('stake_daily_loss_cap', 300);
begin
  v_row := public.dice_advance_locked();
  if nullif(btrim(coalesce(p_token, '')), '') is not null then
    select id into v_player
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_token)) and status = 'active';
    if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;
    select balance into v_balance from public.wallets where player_id = v_player;
    select
      coalesce(-sum(amount) filter (where reason = 'dice_bet'), 0),
      coalesce(sum(amount) filter (where reason = 'dice_payout'), 0)
    into v_wagered, v_paid
    from public.wallet_ledger
    where player_id = v_player
      and reason in ('dice_bet', 'dice_payout')
      and created_at >= date_trunc('day', now());
  end if;

  return jsonb_build_object(
    'round', public.dice_public_round(v_row) || jsonb_build_object('server_now', clock_timestamp()),
    'history', coalesce((
      select jsonb_agg(h order by h.index desc)
      from (
        select round_index as index, roll, seed_hash, seed, salt, revealed_at
        from public.dice_rounds
        where phase = 'revealed' and id <> v_row.id
        order by round_index desc
        limit 20
      ) h
    ), '[]'::jsonb),
    'bets', coalesce((
      select jsonb_agg(b order by b.created_at asc)
      from (
        select db.id, db.amount, db.side, db.target, db.chance_bps, db.multiplier,
               db.won, db.payout, pp.display_name as name,
               coalesce(db.player_id = v_player, false) as is_me, db.created_at
        from public.dice_bets db
        join public.player_profiles pp on pp.id = db.player_id
        where db.round_id = v_row.id
        order by db.created_at asc
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
    'limits', jsonb_build_object('min_bet', 10, 'max_bet', 500, 'house_edge_bps', 100)
  );
end;
$$;

create or replace function public.dice_place_bet(
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
declare
  v_player uuid;
  v_row public.dice_rounds;
  v_chance integer;
  v_multiplier integer;
  v_cap integer := public.cfg_int('stake_daily_loss_cap', 300);
begin
  if (select maintenance_mode from public.platform_settings where id = 1) then
    raise exception 'MAINTENANCE';
  end if;
  v_player := public.assert_player_token(p_token);
  if exists (
    select 1 from public.bans
    where player_id = v_player and expires_at > now() and scope in ('stakes', 'global')
  ) then
    raise exception 'STAKES_BANNED';
  end if;
  if not public.rate_limit_check('dice_bet', public.get_client_ip(), 60, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_row := public.dice_advance_locked();
  if v_row.phase <> 'betting' or clock_timestamp() >= v_row.betting_ends_at then
    raise exception 'ROUND_CLOSED';
  end if;
  if p_amount is null or p_amount < 10 or p_amount > 500 then raise exception 'INVALID_STAKE'; end if;
  if p_target is null or p_target < 200 or p_target > 9800 then raise exception 'INVALID_DICE_TARGET'; end if;
  if p_side is null or p_side not in ('under', 'over') then raise exception 'INVALID_DICE_SIDE'; end if;
  -- Serialize the shared daily-loss budget across Dice, Blast and stakes.
  perform 1 from public.wallets where player_id = v_player for update;
  if public.arcade_daily_loss(v_player) + p_amount > v_cap then raise exception 'DAILY_LOSS_CAP'; end if;

  v_chance := case when p_side = 'under' then p_target else 10000 - p_target end;
  v_multiplier := public.dice_multiplier(p_target, p_side);
  begin
    insert into public.dice_bets (
      round_id, player_id, amount, side, target, chance_bps, multiplier
    ) values (
      v_row.id, v_player, p_amount, p_side, p_target, v_chance, v_multiplier
    );
  exception when unique_violation then
    raise exception 'BET_ALREADY_PLACED';
  end;

  perform public.coins_grant(v_player, -p_amount, 'dice_bet', v_row.id, 'ثبت شرط تاس شریف');
  perform public.dice_broadcast('state');
  return public.dice_get_state(p_token);
end;
$$;

revoke all on function public.dice_multiplier(integer, text) from public, anon, authenticated;
revoke all on function public.dice_broadcast(text) from public, anon, authenticated;
revoke all on function public.dice_public_round(public.dice_rounds) from public, anon, authenticated;
revoke all on function public.dice_open_round() from public, anon, authenticated;
revoke all on function public.dice_advance_locked() from public, anon, authenticated;

revoke all on function public.dice_roll_from_seed(text, text) from public, anon, authenticated;
revoke all on function public.dice_get_state(text) from public, anon, authenticated;
revoke all on function public.dice_place_bet(text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.dice_roll_from_seed(text, text) to anon, authenticated;
grant execute on function public.dice_get_state(text) to anon, authenticated;
grant execute on function public.dice_place_bet(text, integer, text, integer) to anon, authenticated;

-- Keep 30 days of detailed arcade rounds; aggregate wallet/admin history remains
-- in the append-only ledger. Never delete the singleton's current round.
create or replace function public.cleanup_arcade_rounds()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.crash_rounds
  where created_at < now() - interval '30 days'
    and id is distinct from (select current_round_id from public.crash_table where id = 1);
  delete from public.dice_rounds
  where created_at < now() - interval '30 days'
    and id is distinct from (select current_round_id from public.dice_table where id = 1);
end;
$$;
revoke all on function public.cleanup_arcade_rounds() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'doz-arcade-cleanup') then
    perform cron.schedule(
      'doz-arcade-cleanup',
      '45 3 * * *',
      $cron$ select public.cleanup_arcade_rounds() $cron$
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
