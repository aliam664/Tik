-- SHARIFCOIN / DOZ ONLINE — 0008: player profile, wallet, Elo & economy RPCs
-- Identity (register/recover), profile, leaderboard, shop, achievements and
-- the shared economy core (config, coins, Elo, tiers, settlement helpers).

-- ===========================================================================
-- Shared helpers
-- ===========================================================================

-- read an integer economy config value with safe fallback
create or replace function public.cfg_int(p_key text, p_default integer)
returns integer
language sql
stable
as $$
  select coalesce(
    (select value::integer from public.economy_config where key = p_key),
    p_default
  );
$$;

create or replace function public.cfg_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (value::integer = 1) from public.economy_config where key = p_key),
    p_default
  );
$$;

-- display-name validation shared with guest flow
create or replace function public.validate_player_name(p_name text)
returns text
language sql
immutable
as $$
  select public.validate_display_name(p_name);
$$;

-- recovery code: 12 chars in 3 groups of 4 from an unambiguous alphabet
create or replace function public.generate_recovery_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(extensions.gen_random_bytes(1), 0) % 31) + 1, 1),
    ''
  ) from generate_series(1, 12);
$$;

-- ---------------------------------------------------------------------------
-- Elo core (mirror of src/lib/elo.ts). X carries a first-move advantage that
-- is folded into the expected score, not the rating itself.
-- ---------------------------------------------------------------------------
create or replace function public.elo_expected(
  p_rating_a integer,
  p_rating_b integer,
  p_a_advantage integer default 0
)
returns double precision
language sql
immutable
as $$
  select 1.0 / (1.0 + power(10.0, ((p_rating_b - (p_rating_a + coalesce(p_a_advantage, 0)))::numeric / 400.0)));
$$;

create or replace function public.elo_k_for(p_games integer, p_placement_left integer)
returns integer
language sql
stable
as $$
  select case
    when coalesce(p_placement_left, 0) > 0 then public.cfg_int('elo_k_placement', 40)
    when coalesce(p_games, 0) < 20 then public.cfg_int('elo_k_new', 32)
    when p_games < 50 then public.cfg_int('elo_k_mid', 24)
    else public.cfg_int('elo_k_pro', 16)
  end;
$$;

-- tier/direction helper: returns {tier, division} jsonb
create or replace function public.tier_for_rating(p_rating integer)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_rating integer := coalesce(p_rating, 0);
  v_tier text;
  v_div integer;
begin
  if v_rating >= 1800 then
    return jsonb_build_object('tier', 'master', 'division', 1);
  elsif v_rating >= 1600 then
    v_tier := 'diamond';
  elsif v_rating >= 1400 then
    v_tier := 'platinum';
  elsif v_rating >= 1200 then
    v_tier := 'gold';
  elsif v_rating >= 1000 then
    v_tier := 'silver';
  else
    v_tier := 'bronze';
  end if;
  -- 4 divisions per tier: thresholds are 200 wide → 50 per division (IV..I)
  v_div := 4 - least(3, greatest(0, floor(((v_rating mod 200 + 200) mod 200) / 50)::integer));
  return jsonb_build_object('tier', v_tier, 'division', v_div);
end;
$$;

-- ---------------------------------------------------------------------------
-- Coin movement — THE single writer of wallet + ledger.
-- Never call for unlocked stake flows; stakes use stake_* reasons explicitly.
-- ---------------------------------------------------------------------------
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
begin
  if p_amount = 0 then
    select balance into v_balance from public.wallets where player_id = p_player_id;
    return v_balance;
  end if;

  select w.balance, pp.wallet_frozen
  into v_balance, v_frozen
  from public.wallets w
  join public.player_profiles pp on pp.id = w.player_id
  where w.player_id = p_player_id
  for update of w;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- frozen wallets can only receive, never lose (protects players during review)
  if v_frozen and p_amount < 0 and p_reason not in ('admin_clawback') then
    raise exception 'WALLET_FROZEN';
  end if;

  v_balance := v_balance + p_amount;
  if v_balance < 0 then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.wallets set balance = v_balance where player_id = p_player_id;

  insert into public.wallet_ledger (player_id, amount, balance_after, reason, ref_id, note)
  values (p_player_id, p_amount, v_balance, p_reason, p_ref_id, p_note);

  return v_balance;
end;
$$;

-- daily earnings helper: sum of positive match-ish income since UTC midnight
create or replace function public.coins_earned_today(p_player_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(amount), 0)
  from public.wallet_ledger
  where player_id = p_player_id
    and amount > 0
    and reason in ('win_reward', 'draw_reward', 'loss_reward', 'daily_bonus',
                   'first_win', 'streak_bonus', 'event_reward', 'stake_payout')
    and created_at >= date_trunc('day', now());
$$;

-- ===========================================================================
-- register_player(p_display_name) → { player_token, recovery_code, profile }
-- ===========================================================================
create or replace function public.register_player(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_ip inet;
  v_token text;
  v_recovery text;
  v_id uuid;
  v_start integer;
begin
  if (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('register_player', v_ip, 10, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_recovery := public.generate_recovery_code();
  v_start := public.cfg_int('starting_balance', 100);

  insert into public.player_profiles (display_name, token_hash, recovery_hash, register_ip)
  values (v_name, public.hash_token(v_token), public.hash_token(v_recovery), v_ip)
  returning id into v_id;

  insert into public.player_stats (player_id) values (v_id);
  insert into public.player_ratings (player_id) values (v_id);
  insert into public.wallets (player_id, balance) values (v_id, 0);
  perform public.coins_grant(v_id, v_start, 'welcome', null, 'بسته خوش‌آمد');

  return jsonb_build_object(
    'player_token', v_token,
    'recovery_code', v_recovery,
    'profile', public.profile_public(v_id)
  );
end;
$$;

-- ===========================================================================
-- recover_player(p_recovery_code) → { player_token, profile }
-- Issues a fresh token (old device is revoked).
-- ===========================================================================
create or replace function public.recover_player(p_recovery_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_id uuid;
  v_token text;
begin
  if not public.rate_limit_check('recover_player', public.get_client_ip(), 5, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_code := upper(btrim(coalesce(p_recovery_code, '')));
  if v_code !~ '^[A-Z2-9]{12}$' then
    raise exception 'INVALID_RECOVERY_CODE';
  end if;

  select id into v_id from public.player_profiles where recovery_hash = public.hash_token(v_code);
  if not found then
    raise exception 'INVALID_RECOVERY_CODE';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  update public.player_profiles
  set token_hash = public.hash_token(v_token), last_seen_at = now()
  where id = v_id;

  return jsonb_build_object('player_token', v_token, 'profile', public.profile_public(v_id));
end;
$$;

-- rotate recovery code (invalidate the old one)
create or replace function public.rotate_recovery_code(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
begin
  v_id := public.assert_player_token(p_token);
  v_code := public.generate_recovery_code();
  update public.player_profiles set recovery_hash = public.hash_token(v_code) where id = v_id;
  return jsonb_build_object('recovery_code', v_code);
end;
$$;

-- internal: token → player id (updates presence)
create or replace function public.assert_player_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  select id, status into v_id, v_status
  from public.player_profiles
  where token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  if v_status = 'banned' then
    raise exception 'PLAYER_BANNED';
  end if;
  update public.player_profiles set last_seen_at = now() where id = v_id;
  return v_id;
end;
$$;

-- public profile projection (no token material)
create or replace function public.profile_public(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'id', pp.id,
    'display_name', pp.display_name,
    'created_at', to_jsonb(pp.created_at),
    'wallet_frozen', pp.wallet_frozen,
    'balance', w.balance,
    'stats', jsonb_build_object(
      'games', s.games, 'wins', s.wins, 'losses', s.losses, 'draws', s.draws,
      'win_streak', s.win_streak, 'best_win_streak', s.best_win_streak,
      'forfeits_for', s.forfeits_for, 'forfeits_against', s.forfeits_against,
      'stakes_played', s.stakes_played, 'stakes_won', s.stakes_won
    ),
    'rating', jsonb_build_object(
      'rating', r.rating, 'peak_rating', r.peak_rating,
      'placement_left', r.placement_left,
      'tier', public.tier_for_rating(r.rating)
    )
  ) into v
  from public.player_profiles pp
  join public.wallets w on w.player_id = pp.id
  join public.player_stats s on s.player_id = pp.id
  join public.player_ratings r on r.player_id = pp.id
  where pp.id = p_id;
  return v;
end;
$$;

-- ===========================================================================
-- get_my_profile(p_token) → { profile, recent_matches, ledger, achievements }
-- ===========================================================================
create or replace function public.get_my_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  v_id := public.assert_player_token(p_token);
  return jsonb_build_object(
    'profile', public.profile_public(v_id),
    'recent_matches', (
      select coalesce(jsonb_agg(m order by m.finished_at desc), '[]'::jsonb)
      from (
        select
          m.room_code, m.game_number, m.mode, m.stake, m.winner_symbol, m.is_draw,
          m.forfeit, m.move_count, m.finished_at,
          m.rating_x_after, m.rating_o_after, m.coins_x, m.coins_o,
          case when m.player_x = v_id then 'X' else 'O' end as my_symbol,
          case when m.player_x = v_id then m.rating_x_before else m.rating_o_before end as my_rating_before,
          case when m.player_x = v_id then m.rating_x_after else m.rating_o_after end as my_rating_after,
          case when m.player_x = v_id then m.coins_x else m.coins_o end as my_coins,
          (select display_name from public.player_profiles p
            where p.id = case when m.player_x = v_id then m.player_o else m.player_x end) as opponent_name
        from public.matches m
        where m.player_x = v_id or m.player_o = v_id
        order by m.finished_at desc
        limit 20
      ) m
    ),
    'recent_ledger', (
      select coalesce(jsonb_agg(l order by l.created_at desc), '[]'::jsonb)
      from (
        select amount, balance_after, reason, created_at
        from public.wallet_ledger
        where player_id = v_id
        order by created_at desc
        limit 30
      ) l
    ),
    'achievements', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', a.code, 'title', a.title, 'description', a.description,
        'reward_coins', a.reward_coins,
        'achieved', (pa.player_id is not null)
      )), '[]'::jsonb)
      from public.achievements a
      left join public.player_achievements pa
        on pa.achievement_id = a.id and pa.player_id = v_id
    )
  );
end;
$$;

-- ===========================================================================
-- get_leaderboard(p_period, p_limit, p_offset)
-- period: 'season' | 'all' — currently both read live ratings (season history
-- lands with the seasons module); top players only (placement finished).
-- ===========================================================================
create or replace function public.get_leaderboard(
  p_period text default 'season',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 50)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return jsonb_build_object(
    'period', coalesce(p_period, 'season'),
    'total', (select count(*) from public.player_ratings r
              join public.player_stats s on s.player_id = r.player_id
              where r.placement_left = 0 and s.games >= 20 and s.wins + s.losses + s.draws > 0),
    'items', (
      select coalesce(jsonb_agg(row order by rank), '[]'::jsonb)
      from (
        select
          row_number() over (order by r.rating desc, s.wins desc) as rank,
          pp.display_name,
          r.rating,
          r.peak_rating,
          s.games, s.wins, s.losses, s.draws,
          public.tier_for_rating(r.rating) as tier
        from public.player_ratings r
        join public.player_profiles pp on pp.id = r.player_id
        join public.player_stats s on s.player_id = r.player_id
        where r.placement_left = 0 and s.games >= 20 and pp.status = 'active'
        order by r.rating desc, s.wins desc
        limit v_limit offset v_offset
      ) row
    ),
    'server_now', to_jsonb(now())
  );
end;
$$;

-- ===========================================================================
-- Shop: list + purchase (coins only; cosmetic only).
-- ===========================================================================
create or replace function public.list_shop_items()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'sku', sku, 'name', name, 'kind', kind,
    'price', price, 'rarity', rarity
  ) order by price), '[]'::jsonb)
  from public.shop_items where active;
$$;

create or replace function public.purchase_item(p_token text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_item public.shop_items;
  v_balance bigint;
begin
  v_id := public.assert_player_token(p_token);

  select * into v_item from public.shop_items where id = p_item_id and active;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if exists (select 1 from public.player_inventory where player_id = v_id and item_id = p_item_id) then
    raise exception 'ITEM_OWNED';
  end if;

  -- atomic-ish: grant negative then insert inventory; coins_grant enforces funds
  v_balance := public.coins_grant(v_id, -v_item.price, 'shop_purchase', p_item_id, v_item.name);
  insert into public.player_inventory (player_id, item_id) values (v_id, p_item_id);

  return jsonb_build_object('ok', true, 'balance', v_balance, 'item', v_item.name);
end;
$$;

-- ===========================================================================
-- Achievement checker — called after settlement. One-time coin faucets.
-- ===========================================================================
create or replace function public.check_achievements(p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec record;
  v_unlocked integer := 0;
  v_games integer;
  v_wins integer;
  v_streak integer;
  v_stakes integer;
  v_rating integer;
begin
  select games, wins, win_streak, stakes_played
  into v_games, v_wins, v_streak, v_stakes
  from public.player_stats where player_id = p_player_id;
  select rating into v_rating from public.player_ratings where player_id = p_player_id;

  for v_rec in
    select a.id, a.code, a.reward_coins
    from public.achievements a
    where not exists (
      select 1 from public.player_achievements pa
      where pa.player_id = p_player_id and pa.achievement_id = a.id
    )
  loop
    if (v_rec.code = 'first_win'   and v_wins >= 1)
      or (v_rec.code = 'wins_10'   and v_wins >= 10)
      or (v_rec.code = 'wins_100'  and v_wins >= 100)
      or (v_rec.code = 'streak_5'  and v_streak >= 5)
      or (v_rec.code = 'games_50'  and v_games >= 50)
      or (v_rec.code = 'stake_first' and v_stakes >= 1)
      or (v_rec.code = 'gold_tier' and v_rating >= 1200)
      or (v_rec.code = 'master_tier' and v_rating >= 1800)
    then
      insert into public.player_achievements (player_id, achievement_id)
      values (p_player_id, v_rec.id);
      if v_rec.reward_coins > 0 then
        perform public.coins_grant(p_player_id, v_rec.reward_coins, 'achievement', v_rec.id, null);
      end if;
      v_unlocked := v_unlocked + 1;
    end if;
  end loop;

  return v_unlocked;
end;
$$;
