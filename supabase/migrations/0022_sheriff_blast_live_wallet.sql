-- DOZ ONLINE — 0022: Sheriff Blast production live salon + Sheriff Coin wallet.
-- Server-authoritative global rounds, atomic two-slot bets/cash-outs, automatic
-- cash-out settlement, daily loss cap, realtime invalidation and safe public
-- projections. Sheriff Coin is virtual and cannot be redeemed for money.

-- Extend the append-only wallet vocabulary for the two arcade wagering titles.
-- Dice reasons are admitted here so the next migration can stay focused on its
-- game schema. Existing reason values are preserved verbatim.
alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_reason_check check (reason in (
    'welcome', 'win_reward', 'draw_reward', 'loss_reward', 'daily_bonus',
    'first_win', 'streak_bonus', 'achievement', 'season_reward', 'rescue_grant',
    'event_reward', 'stake_lock', 'stake_payout', 'stake_refund', 'stake_loss',
    'shop_purchase', 'name_change', 'admin_adjust', 'admin_clawback',
    'crash_bet', 'crash_payout', 'dice_bet', 'dice_payout'
  ));

create index if not exists idx_crash_rounds_recent
  on public.crash_rounds (round_index desc);
create index if not exists idx_crash_bets_round
  on public.crash_bets (round_id, created_at);
create index if not exists idx_crash_bets_player_time
  on public.crash_bets (player_id, created_at desc);

-- Net virtual-coin loss across every wagering surface since UTC midnight.
create or replace function public.arcade_daily_loss(p_player_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select greatest(0, -coalesce(sum(amount), 0))::bigint
  from public.wallet_ledger
  where player_id = p_player_id
    and reason in (
      'stake_lock', 'stake_payout', 'stake_refund',
      'crash_bet', 'crash_payout',
      'dice_bet', 'dice_payout'
    )
    and created_at >= date_trunc('day', now());
$$;

-- A broadcast is only an invalidation hint. Clients always fetch the canonical
-- RPC projection, so no wallet/player-private data enters Realtime payloads.
create or replace function public.crash_broadcast(p_event text default 'state')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.crash_rounds;
begin
  select r.* into v_round
  from public.crash_table t
  join public.crash_rounds r on r.id = t.current_round_id
  where t.id = 1;

  if not found then return; end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'index', v_round.round_index,
        'phase', v_round.phase,
        'at', clock_timestamp()
      ),
      p_event,
      'crash:salon',
      false
    );
  exception when others then
    null; -- a Realtime outage must never roll back wallet settlement
  end;
end;
$$;

create or replace function public.crash_public_round(p_row public.crash_rounds)
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
    'seed', case when p_row.phase = 'crashed' then p_row.seed else null end,
    'salt', p_row.salt,
    'crash_point', case when p_row.phase = 'crashed' then p_row.crash_point else null end,
    'betting_ends_at', p_row.betting_ends_at,
    'flying_started_at', p_row.flying_started_at,
    'crashed_at', p_row.crashed_at,
    'next_at', case
      when p_row.crashed_at is null then null
      else p_row.crashed_at + interval '2.8 seconds'
    end
  );
$$;

create or replace function public.crash_open_round()
returns public.crash_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seed text;
  v_salt text;
  v_point integer;
  v_row public.crash_rounds;
  v_next bigint;
begin
  v_seed := encode(extensions.gen_random_bytes(32), 'hex');
  select coalesce(max(round_index), 0) + 1 into v_next from public.crash_rounds;
  v_salt := 'sheriff-blast:' || v_next::text;
  v_point := public.crash_point_from_seed(v_seed, v_salt);

  insert into public.crash_rounds (
    seed, seed_hash, salt, crash_point, phase, betting_started_at, betting_ends_at
  ) values (
    v_seed,
    encode(extensions.digest(decode(v_seed, 'hex'), 'sha256'), 'hex'),
    v_salt,
    v_point,
    'betting',
    clock_timestamp(),
    clock_timestamp() + interval '5 seconds'
  ) returning * into v_row;

  update public.crash_table set current_round_id = v_row.id where id = 1;
  perform public.crash_broadcast('state');
  return v_row;
end;
$$;

-- Advance under the singleton table lock. This serializes phase changes,
-- automatic payouts, manual cash-outs and placement at the betting boundary.
create or replace function public.crash_advance_locked()
returns public.crash_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.crash_rounds;
  v_id uuid;
  v_bet public.crash_bets;
  v_payout bigint;
  v_changed boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  select current_round_id into v_id
  from public.crash_table
  where id = 1
  for update;

  if v_id is null then
    return public.crash_open_round();
  end if;

  select * into v_row from public.crash_rounds where id = v_id for update;
  if not found then
    return public.crash_open_round();
  end if;

  if v_row.phase = 'betting' and v_now >= v_row.betting_ends_at then
    v_row.phase := 'flying';
    v_row.flying_started_at := v_row.betting_ends_at;
    v_row.crash_at := v_row.betting_ends_at
      + make_interval(secs => public.crash_elapsed_ms(v_row.crash_point) / 1000.0);
    if v_row.crash_point <= 100 then
      v_row.phase := 'crashed';
      v_row.crashed_at := v_row.flying_started_at;
    end if;
    update public.crash_rounds set
      phase = v_row.phase,
      flying_started_at = v_row.flying_started_at,
      crash_at = v_row.crash_at,
      crashed_at = v_row.crashed_at
    where id = v_row.id;
    v_changed := true;
  end if;

  -- Auto cash-outs are deterministic and survive sleeping clients. Strictly
  -- below the crash point wins; equality loses, matching the client engine.
  if v_row.phase = 'flying' and v_row.flying_started_at is not null then
    for v_bet in
      select * from public.crash_bets
      where round_id = v_row.id
        and cashed_at is null
        and auto_at is not null
        and auto_at < v_row.crash_point
        and v_now >= v_row.flying_started_at
          + make_interval(secs => public.crash_elapsed_ms(auto_at) / 1000.0)
      order by player_id, id
      for update
    loop
      v_payout := floor((v_bet.amount::numeric * v_bet.auto_at::numeric) / 100)::bigint;
      update public.crash_bets
      set cashed_at = v_bet.auto_at, payout = v_payout
      where id = v_bet.id and cashed_at is null;
      if found then
        perform public.coins_grant(
          v_bet.player_id,
          v_payout,
          'crash_payout',
          v_row.id,
          'برداشت خودکار انفجار شریف'
        );
        v_changed := true;
      end if;
    end loop;
  end if;

  if v_row.phase = 'flying' and v_row.crash_at is not null and v_now >= v_row.crash_at then
    v_row.phase := 'crashed';
    v_row.crashed_at := v_row.crash_at;
    update public.crash_rounds
    set phase = 'crashed', crashed_at = v_row.crash_at
    where id = v_row.id;
    v_changed := true;
  end if;

  if v_row.phase = 'crashed' and v_row.crashed_at is not null
     and v_now >= v_row.crashed_at + interval '2.8 seconds' then
    return public.crash_open_round();
  end if;

  if v_changed then perform public.crash_broadcast('state'); end if;
  return v_row;
end;
$$;

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
    if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;
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
        select cb.id, cb.slot, cb.amount, cb.auto_at, cb.cashed_at, cb.payout,
               pp.display_name as name, (cb.player_id = v_player) as is_me,
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
    'limits', jsonb_build_object(
      'min_bet', 10,
      'max_bet', 500,
      'max_slots', 2,
      'house_edge_bps', 100
    )
  );
end;
$$;

create or replace function public.crash_place_bet(
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
declare
  v_player uuid;
  v_row public.crash_rounds;
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
  if not public.rate_limit_check('crash_bet', public.get_client_ip(), 120, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_row := public.crash_advance_locked();
  if v_row.phase <> 'betting' or clock_timestamp() >= v_row.betting_ends_at then
    raise exception 'BETTING_CLOSED';
  end if;
  if p_amount is null or p_amount < 10 or p_amount > 500 then
    raise exception 'INVALID_STAKE';
  end if;
  if p_slot not in (0, 1) then raise exception 'INVALID_SLOT'; end if;
  if p_auto_at is not null and (p_auto_at < 101 or p_auto_at > 100000000) then
    raise exception 'INVALID_AUTO_CASHOUT';
  end if;
  if (select count(*) from public.crash_bets where round_id = v_row.id and player_id = v_player) >= 2 then
    raise exception 'MAX_SLOTS';
  end if;
  -- Serialize the shared daily-loss budget across Blast, Dice and stakes.
  perform 1 from public.wallets where player_id = v_player for update;
  if public.arcade_daily_loss(v_player) + p_amount > v_cap then
    raise exception 'DAILY_LOSS_CAP';
  end if;

  begin
    insert into public.crash_bets (round_id, player_id, slot, amount, auto_at)
    values (v_row.id, v_player, p_slot, p_amount, p_auto_at);
  exception when unique_violation then
    raise exception 'SLOT_TAKEN';
  end;

  perform public.coins_grant(
    v_player,
    -p_amount,
    'crash_bet',
    v_row.id,
    'ثبت شرط انفجار شریف'
  );
  perform public.crash_broadcast('state');
  return public.crash_get_state(p_token);
end;
$$;

create or replace function public.crash_cash_out(p_token text, p_bet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid;
  v_row public.crash_rounds;
  v_bet public.crash_bets;
  v_at integer;
  v_payout bigint;
  v_elapsed_ms numeric;
begin
  v_player := public.assert_player_token(p_token);
  if not public.rate_limit_check('crash_cash', public.get_client_ip(), 180, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_row := public.crash_advance_locked();
  if v_row.phase <> 'flying' or v_row.flying_started_at is null then
    raise exception 'NOT_FLYING';
  end if;

  select * into v_bet
  from public.crash_bets
  where id = p_bet_id and round_id = v_row.id and player_id = v_player
  for update;
  if not found then raise exception 'BET_NOT_FOUND'; end if;
  if v_bet.cashed_at is not null then raise exception 'ALREADY_CASHED'; end if;
  if v_row.crash_at is null or clock_timestamp() >= v_row.crash_at then
    raise exception 'ALREADY_CRASHED';
  end if;

  v_elapsed_ms := greatest(0, extract(epoch from (clock_timestamp() - v_row.flying_started_at)) * 1000);
  v_at := least(
    v_row.crash_point - 1,
    greatest(100, floor(100 * exp(0.06 * v_elapsed_ms / 1000))::integer)
  );
  v_payout := floor((v_bet.amount::numeric * v_at::numeric) / 100)::bigint;

  update public.crash_bets
  set cashed_at = v_at, payout = v_payout
  where id = v_bet.id and cashed_at is null;
  if not found then raise exception 'ALREADY_CASHED'; end if;

  perform public.coins_grant(
    v_player,
    v_payout,
    'crash_payout',
    v_row.id,
    'برداشت انفجار شریف'
  );
  perform public.crash_broadcast('state');
  return public.crash_get_state(p_token);
end;
$$;

-- Refresh admin telemetry so it reflects canonical server bets rather than a
-- browser-local simulation.
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
        select r.round_index as index, r.crash_point, r.seed_hash, r.salt,
               case when r.phase = 'crashed' then r.seed else null end as seed,
               r.phase, r.crashed_at,
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

-- Deny direct browser execution of every lifecycle/economy helper.
revoke all on function public.arcade_daily_loss(uuid) from public, anon, authenticated;
revoke all on function public.crash_broadcast(text) from public, anon, authenticated;
revoke all on function public.crash_open_round() from public, anon, authenticated;
revoke all on function public.crash_advance_locked() from public, anon, authenticated;
revoke all on function public.crash_public_round(public.crash_rounds) from public, anon, authenticated;

-- Explicit browser RPC allowlist.
revoke all on function public.crash_get_state(text) from public, anon, authenticated;
revoke all on function public.crash_place_bet(text, integer, integer, smallint) from public, anon, authenticated;
revoke all on function public.crash_cash_out(text, uuid) from public, anon, authenticated;
revoke all on function public.crash_point_from_seed(text, text) from public, anon, authenticated;
revoke all on function public.admin_crash_ops(text) from public, anon, authenticated;

grant execute on function public.crash_get_state(text) to anon, authenticated;
grant execute on function public.crash_place_bet(text, integer, integer, smallint) to anon, authenticated;
grant execute on function public.crash_cash_out(text, uuid) to anon, authenticated;
grant execute on function public.crash_point_from_seed(text, text) to anon, authenticated;
grant execute on function public.admin_crash_ops(text) to anon, authenticated;

notify pgrst, 'reload schema';
