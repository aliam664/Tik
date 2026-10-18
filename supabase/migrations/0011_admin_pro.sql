-- SHARIFCOIN / DOZ ONLINE — 0011: professional admin RPCs
-- RBAC (role → permissions), player management, economy center (faucets/sinks,
-- supply, Gini, versioned config), integrity (risk flags), matchmaking monitor,
-- seasons (soft reset + rewards) and live-ops levers. Every action is audited.

-- ===========================================================================
-- RBAC core
-- ===========================================================================
create or replace function public.admin_role_perms(p_role text)
returns text[]
language sql
immutable
as $$
  select case coalesce(p_role, 'support')
    when 'owner'     then array['view','moderate','economy','competitive','rbac','settings']
    when 'admin'     then array['view','moderate','economy','competitive','settings']
    when 'moderator' then array['view','moderate']
    when 'economy'   then array['view','economy']
    else                  array['view']
  end::text[];
$$;

create or replace function public.assert_admin_perm(p_token text, p_perm text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_role text;
begin
  v_admin_id := public.assert_admin_session(p_token);
  select role into v_role from public.admin_users where id = v_admin_id;
  if not (p_perm = any (public.admin_role_perms(v_role))) then
    perform public.write_audit(
      (select username from public.admin_users where id = v_admin_id),
      'perm_denied', p_perm, 'failure', jsonb_build_object('role', v_role)
    );
    raise exception 'ADMIN_FORBIDDEN';
  end if;
  return v_admin_id;
end;
$$;

-- ===========================================================================
-- Dashboard (extended overview with economy & queue pulse)
-- ===========================================================================
create or replace function public.admin_get_dashboard(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  v_id := public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'players_total', (select count(*) from public.player_profiles),
    'players_active_24h', (
      select count(*) from public.player_profiles where last_seen_at > now() - interval '24 hours'
    ),
    'games_24h', (select count(*) from public.matches where finished_at > now() - interval '24 hours'),
    'stakes_24h', (select count(*) from public.matches where mode = 'stakes' and finished_at > now() - interval '24 hours'),
    'queue_searching', (select count(*) from public.matchmaking_tickets where status = 'searching'),
    'queue_matched', (select count(*) from public.matchmaking_tickets where status in ('matched','accepted')),
    'rooms_active', (select count(*) from public.rooms where status in ('waiting','active') and expires_at > now()),
    'total_supply', (select coalesce(sum(balance), 0) from public.wallets),
    'issued_24h', (
      select coalesce(sum(amount), 0) from public.wallet_ledger
      where amount > 0 and created_at > now() - interval '24 hours'
    ),
    'burned_24h', (
      select coalesce(-sum(amount), 0) from public.wallet_ledger
      where amount < 0 and created_at > now() - interval '24 hours'
    ),
    'open_risk_flags', (select count(*) from public.risk_flags where status = 'open'),
    'maintenance_mode', (select maintenance_mode from public.platform_settings where id = 1),
    'server_now', to_jsonb(now())
  );
end;
$$;

-- ===========================================================================
-- Player management
-- ===========================================================================
create or replace function public.admin_list_players(
  p_admin_token text,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 25)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := '%' || coalesce(p_search, '') || '%';
begin
  perform public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'total', (
      select count(*) from public.player_profiles pp
      where p_search is null or pp.display_name ilike v_search
    ),
    'items', (
      select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb)
      from (
        select pp.id, pp.display_name, pp.status, pp.wallet_frozen,
               to_jsonb(pp.created_at) as created_at,
               to_jsonb(pp.last_seen_at) as last_seen_at,
               w.balance,
               s.games, s.wins, s.losses, s.draws,
               r.rating, public.tier_for_rating(r.rating) as tier
        from public.player_profiles pp
        join public.wallets w on w.player_id = pp.id
        join public.player_stats s on s.player_id = pp.id
        join public.player_ratings r on r.player_id = pp.id
        where p_search is null or pp.display_name ilike v_search
        order by pp.created_at desc
        limit v_limit offset v_offset
      ) row
    ),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function public.admin_get_player(p_admin_token text, p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'profile', public.profile_public(p_player_id),
    'register_ip', (select register_ip from public.player_profiles where id = p_player_id),
    'ledger', (
      select coalesce(jsonb_agg(l order by l.created_at desc), '[]'::jsonb)
      from (
        select amount, balance_after, reason, note, to_jsonb(created_at) as created_at
        from public.wallet_ledger where player_id = p_player_id
        order by created_at desc limit 50
      ) l
    ),
    'matches', (
      select coalesce(jsonb_agg(m order by m.finished_at desc), '[]'::jsonb)
      from (
        select room_code, game_number, mode, stake, winner_symbol, is_draw, forfeit,
               rating_x_after, rating_o_after, coins_x, coins_o, to_jsonb(finished_at) as finished_at,
               case when player_x = p_player_id then 'X' else 'O' end as my_symbol
        from public.matches
        where player_x = p_player_id or player_o = p_player_id
        order by finished_at desc limit 30
      ) m
    ),
    'bans', (
      select coalesce(jsonb_agg(b order by b.created_at desc), '[]'::jsonb)
      from (
        select scope, reason, created_by, to_jsonb(created_at) as created_at,
               to_jsonb(expires_at) as expires_at
        from public.bans where player_id = p_player_id
        order by created_at desc limit 20
      ) b
    ),
    'risk_flags', (
      select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb)
      from (
        select id, kind, evidence, status, to_jsonb(created_at) as created_at
        from public.risk_flags
        where subject_id = p_player_id or related_id = p_player_id
        order by created_at desc limit 20
      ) f
    )
  );
end;
$$;

-- adjust coins (NEVER silent — audit + ledger note mandatory)
create or replace function public.admin_adjust_coins(
  p_admin_token text,
  p_player_id uuid,
  p_amount bigint,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_balance bigint;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'economy');
  select username into v_username from public.admin_users where id = v_admin;

  if coalesce(btrim(coalesce(p_note, '')), '') = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_balance := public.coins_grant(
    p_player_id,
    p_amount,
    case when p_amount > 0 then 'admin_adjust' else 'admin_clawback' end,
    null,
    p_note
  );

  perform public.write_audit(v_username, 'admin_adjust_coins', p_player_id::text, 'success',
    jsonb_build_object('amount', p_amount, 'note', p_note, 'balance_after', v_balance));

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- freeze / unfreeze wallet
create or replace function public.admin_set_wallet_frozen(
  p_admin_token text,
  p_player_id uuid,
  p_frozen boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'moderate');
  select username into v_username from public.admin_users where id = v_admin;

  update public.player_profiles set wallet_frozen = coalesce(p_frozen, false)
  where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  perform public.write_audit(v_username, 'admin_wallet_freeze', p_player_id::text, 'success',
    jsonb_build_object('frozen', p_frozen, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- bans (queue / stakes / global)
create or replace function public.admin_set_ban(
  p_admin_token text,
  p_player_id uuid,
  p_scope text,
  p_hours integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'moderate');
  select username into v_username from public.admin_users where id = v_admin;

  if p_scope not in ('queue', 'stakes', 'global') then
    raise exception 'INVALID_SCOPE';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 8760 then
    raise exception 'INVALID_DURATION';
  end if;

  insert into public.bans (player_id, scope, reason, created_by, expires_at)
  values (p_player_id, p_scope, coalesce(p_reason, ''), v_username, now() + make_interval(hours => p_hours));

  perform public.write_audit(v_username, 'admin_ban', p_player_id::text, 'success',
    jsonb_build_object('scope', p_scope, 'hours', p_hours, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- reset rating (soft: back to start, placement again)
create or replace function public.admin_reset_rating(
  p_admin_token text,
  p_player_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_start integer;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'competitive');
  select username into v_username from public.admin_users where id = v_admin;
  v_start := public.cfg_int('elo_start', 1200);

  update public.player_ratings
  set rating = v_start, peak_rating = v_start,
      placement_left = public.cfg_int('placement_games', 10)
  where player_id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  perform public.write_audit(v_username, 'admin_reset_rating', p_player_id::text, 'success',
    jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- Economy center
-- ===========================================================================
create or replace function public.admin_get_economy(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_gini double precision := 0;
  v_n bigint := 0;
  v_sum bigint := 0;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'economy');

  -- Gini coefficient of wallet balances (classic sorted-balance formula)
  select count(*), coalesce(sum(balance), 0)
  into v_n, v_sum
  from public.wallets
  where balance > 0;

  if v_n >= 2 and v_sum > 0 then
    select greatest(0, least(1,
      (2.0 * sum(t.i * t.balance) / (v_n * v_sum)) - ((v_n + 1.0) / v_n)
    ))
    into v_gini
    from (
      select balance, row_number() over (order by balance) as i
      from public.wallets
      where balance > 0
    ) t;
  end if;

  return jsonb_build_object(
    'total_supply', (select coalesce(sum(balance), 0) from public.wallets),
    'wallets', (select count(*) from public.wallets),
    'median_balance', (
      select coalesce(percentile_cont(0.5) within group (order by balance), 0)::bigint
      from public.wallets
    ),
    'gini', round(coalesce(v_gini, 0)::numeric, 4),
    'faucets_7d', (
      select coalesce(jsonb_agg(f order by f.total desc), '[]'::jsonb)
      from (
        select reason, sum(amount) as total, count(*) as cnt
        from public.wallet_ledger
        where amount > 0 and created_at > now() - interval '7 days'
        group by reason order by sum(amount) desc
      ) f
    ),
    'sinks_7d', (
      select coalesce(jsonb_agg(s order by s.total desc), '[]'::jsonb)
      from (
        select reason, -sum(amount) as total, count(*) as cnt
        from public.wallet_ledger
        where amount < 0 and created_at > now() - interval '7 days'
        group by reason order by sum(amount) asc
      ) s
    ),
    'issued_7d', (
      select coalesce(sum(amount), 0) from public.wallet_ledger
      where amount > 0 and created_at > now() - interval '7 days'
    ),
    'burned_7d', (
      select coalesce(-sum(amount), 0) from public.wallet_ledger
      where amount < 0 and created_at > now() - interval '7 days'
    ),
    'rake_7d', (
      select coalesce(sum(rake), 0) from public.matches
      where finished_at > now() - interval '7 days'
    ),
    'top_rich', (
      select coalesce(jsonb_agg(r order by r.balance desc), '[]'::jsonb)
      from (
        select pp.display_name, w.balance
        from public.wallets w join public.player_profiles pp on pp.id = w.player_id
        order by w.balance desc limit 10
      ) r
    ),
    'config', public.admin_get_economy_config(p_admin_token)
  );
end;
$$;

create or replace function public.admin_get_economy_config(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'view');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', key, 'value', value, 'updated_at', to_jsonb(updated_at), 'updated_by', updated_by
    ) order by key), '[]'::jsonb)
    from public.economy_config
  );
end;
$$;

create or replace function public.admin_update_economy_config(
  p_admin_token text,
  p_key text,
  p_value text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_old text;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'economy');
  select username into v_username from public.admin_users where id = v_admin;

  if coalesce(btrim(coalesce(p_reason, '')), '') = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_value !~ '^-?[0-9]+$' then
    raise exception 'INVALID_VALUE';
  end if;

  select value into v_old from public.economy_config where key = p_key;
  if not found then
    raise exception 'CONFIG_KEY_NOT_FOUND';
  end if;

  update public.economy_config
  set value = p_value, updated_at = now(), updated_by = v_username
  where key = p_key;

  insert into public.economy_config_history (key, old_value, new_value, changed_by, reason)
  values (p_key, v_old, p_value, v_username, p_reason);

  perform public.write_audit(v_username, 'economy_config_update', p_key, 'success',
    jsonb_build_object('old', v_old, 'new', p_value, 'reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

-- rollback config to its previous value (by history row)
create or replace function public.admin_rollback_economy_config(
  p_admin_token text,
  p_history_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_row public.economy_config_history;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'economy');
  select username into v_username from public.admin_users where id = v_admin;

  select * into v_row from public.economy_config_history where id = p_history_id;
  if not found then
    raise exception 'HISTORY_NOT_FOUND';
  end if;

  update public.economy_config
  set value = v_row.old_value, updated_at = now(), updated_by = v_username
  where key = v_row.key;

  insert into public.economy_config_history (key, old_value, new_value, changed_by, reason)
  values (v_row.key, v_row.new_value, v_row.old_value, v_username,
          coalesce(p_reason, 'rollback #' || p_history_id));

  perform public.write_audit(v_username, 'economy_config_rollback', v_row.key, 'success',
    jsonb_build_object('history_id', p_history_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- Integrity: risk flags
-- ===========================================================================
create or replace function public.admin_list_risk_flags(
  p_admin_token text,
  p_status text default 'open',
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
  perform public.assert_admin_perm(p_admin_token, 'moderate');

  return jsonb_build_object(
    'total', (
      select count(*) from public.risk_flags
      where p_status is null or status = p_status
    ),
    'items', (
      select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb)
      from (
        select rf.id, rf.kind, rf.evidence, rf.status, to_jsonb(rf.created_at) as created_at,
               s.display_name as subject_name,
               rel.display_name as related_name
        from public.risk_flags rf
        left join public.player_profiles s on s.id = rf.subject_id
        left join public.player_profiles rel on rel.id = rf.related_id
        where p_status is null or rf.status = p_status
        order by rf.created_at desc
        limit v_limit offset v_offset
      ) f
    ),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function public.admin_resolve_risk_flag(
  p_admin_token text,
  p_flag_id uuid,
  p_resolution text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'moderate');
  select username into v_username from public.admin_users where id = v_admin;

  if p_resolution not in ('resolved', 'dismissed') then
    raise exception 'INVALID_RESOLUTION';
  end if;

  update public.risk_flags
  set status = p_resolution, resolution = coalesce(p_note, ''), resolved_by = v_username, resolved_at = now()
  where id = p_flag_id;
  if not found then
    raise exception 'FLAG_NOT_FOUND';
  end if;

  perform public.write_audit(v_username, 'risk_flag_resolve', p_flag_id::text, 'success',
    jsonb_build_object('resolution', p_resolution, 'note', p_note));
  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- Matchmaking monitor
-- ===========================================================================
create or replace function public.admin_matchmaking_stats(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'searching', (
      select coalesce(jsonb_agg(t order by t.enqueued_at), '[]'::jsonb)
      from (
        select pp.display_name, mt.mode, mt.stake, mt.rating,
               greatest(0, extract(epoch from (now() - mt.enqueued_at)))::integer as wait_seconds
        from public.matchmaking_tickets mt
        join public.player_profiles pp on pp.id = mt.player_id
        where mt.status = 'searching'
        order by mt.enqueued_at
        limit 50
      ) t
    ),
    'avg_wait_seconds', (
      select coalesce(avg(greatest(0, extract(epoch from (closed_at - enqueued_at)))) filter (
        where closed_at is not null and status = 'matched'
      ), 0)::integer
      from public.matchmaking_tickets
      where enqueued_at > now() - interval '24 hours'
    ),
    'dodges_24h', (
      select count(*) from public.matchmaking_tickets
      where status = 'dodged' and closed_at > now() - interval '24 hours'
    ),
    'matches_24h', (
      select count(*) from public.matchmaking_tickets
      where status in ('accepted', 'expired') and closed_at > now() - interval '24 hours'
    ),
    'avg_rating_gap_24h', (
      select coalesce(avg(abs(m.rating_x_before - m.rating_o_before)), 0)::integer
      from public.matches m
      where m.finished_at > now() - interval '24 hours'
        and m.rating_x_before is not null
    )
  );
end;
$$;

-- ===========================================================================
-- Seasons (soft reset + rewards)
-- ===========================================================================
create or replace function public.admin_list_seasons(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'competitive');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name,
      'starts_at', to_jsonb(starts_at), 'ends_at', to_jsonb(ends_at),
      'status', status, 'reset_factor', reset_factor
    ) order by starts_at desc), '[]'::jsonb)
    from public.seasons
  );
end;
$$;

create or replace function public.admin_create_season(
  p_admin_token text,
  p_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reset_factor numeric default 0.70
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_season public.seasons;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'competitive');
  select username into v_username from public.admin_users where id = v_admin;

  if coalesce(btrim(coalesce(p_name, '')), '') = '' or p_ends_at <= p_starts_at then
    raise exception 'INVALID_SEASON';
  end if;

  insert into public.seasons (name, starts_at, ends_at, reset_factor)
  values (p_name, p_starts_at, p_ends_at, coalesce(p_reset_factor, 0.70))
  returning * into v_season;

  perform public.write_audit(v_username, 'season_create', v_season.id::text, 'success',
    jsonb_build_object('name', p_name));
  return jsonb_build_object('ok', true, 'season', to_jsonb(v_season));
end;
$$;

-- end season: snapshot standings, pay rewards, soft-reset ratings
create or replace function public.admin_end_season(p_admin_token text, p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_season public.seasons;
  v_factor numeric;
  v_start integer;
  v_count integer := 0;
  v_rec record;
  v_reward integer;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'competitive');
  select username into v_username from public.admin_users where id = v_admin;

  select * into v_season from public.seasons where id = p_season_id for update;
  if not found or v_season.status = 'finished' then
    raise exception 'SEASON_NOT_FOUND';
  end if;

  v_factor := v_season.reset_factor;
  v_start := public.cfg_int('elo_start', 1200);

  for v_rec in
    select r.player_id, r.rating, s.games, pp.status
    from public.player_ratings r
    join public.player_stats s on s.player_id = r.player_id
    join public.player_profiles pp on pp.id = r.player_id
    where pp.status = 'active'
  loop
    v_reward := case
      when v_rec.rating >= 1800 then 4000
      when v_rec.rating >= 1600 then 2000
      when v_rec.rating >= 1400 then 1000
      when v_rec.rating >= 1200 then 500
      when v_rec.rating >= 1000 then 250
      else 100
    end;

    insert into public.season_standings (season_id, player_id, rating_final, tier, games, rewards_coins)
    values (p_season_id, v_rec.player_id, v_rec.rating,
            public.tier_for_rating(v_rec.rating) ->> 'tier',
            v_rec.games, v_reward);

    if v_rec.games >= 10 then
      perform public.coins_grant(v_rec.player_id, v_reward, 'season_reward', p_season_id, v_season.name);
    end if;

    -- soft reset toward the start rating
    update public.player_ratings
    set rating = greatest(100, round(v_start + (rating - v_start) * v_factor))
    where player_id = v_rec.player_id;

    v_count := v_count + 1;
  end loop;

  update public.seasons set status = 'finished', ends_at = least(ends_at, now()) where id = p_season_id;

  perform public.write_audit(v_username, 'season_end', p_season_id::text, 'success',
    jsonb_build_object('players', v_count));
  return jsonb_build_object('ok', true, 'players', v_count);
end;
$$;

-- ===========================================================================
-- Rich games list (from the permanent matches table)
-- ===========================================================================
create or replace function public.admin_list_matches(
  p_admin_token text,
  p_mode text default null,
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
  perform public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'total', (
      select count(*) from public.matches where p_mode is null or mode = p_mode
    ),
    'items', (
      select coalesce(jsonb_agg(m order by m.finished_at desc), '[]'::jsonb)
      from (
        select m.room_code, m.game_number, m.mode, m.stake,
               m.winner_symbol, m.is_draw, m.forfeit, m.move_count, m.rake,
               m.rating_x_before, m.rating_x_after, m.rating_o_before, m.rating_o_after,
               m.coins_x, m.coins_o, to_jsonb(m.finished_at) as finished_at,
               px.display_name as player_x_name, po.display_name as player_o_name
        from public.matches m
        left join public.player_profiles px on px.id = m.player_x
        left join public.player_profiles po on po.id = m.player_o
        where p_mode is null or m.mode = p_mode
        order by m.finished_at desc
        limit v_limit offset v_offset
      ) m
    ),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

-- ===========================================================================
-- Shop admin: create item & grant item
-- ===========================================================================
create or replace function public.admin_create_shop_item(
  p_admin_token text,
  p_sku text,
  p_name text,
  p_kind text,
  p_price integer,
  p_rarity text default 'common'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_item public.shop_items;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'economy');
  select username into v_username from public.admin_users where id = v_admin;

  if p_kind not in ('board_theme', 'mark', 'frame', 'title', 'sound') then
    raise exception 'INVALID_KIND';
  end if;

  insert into public.shop_items (sku, name, kind, price, rarity)
  values (p_sku, p_name, p_kind, p_price, coalesce(p_rarity, 'common'))
  returning * into v_item;

  perform public.write_audit(v_username, 'shop_item_create', v_item.id::text, 'success',
    jsonb_build_object('sku', p_sku, 'price', p_price));
  return jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
end;
$$;

-- ===========================================================================
-- RBAC: list admins & change role (owner only)
-- ===========================================================================
create or replace function public.admin_list_admins(p_admin_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'rbac');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'username', username, 'role', role,
      'is_active', is_active, 'created_at', to_jsonb(created_at)
    ) order by created_at), '[]'::jsonb)
    from public.admin_users
  );
end;
$$;

create or replace function public.admin_set_role(
  p_admin_token text,
  p_target_username text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'rbac');
  select username into v_username from public.admin_users where id = v_admin;

  if p_role not in ('owner', 'admin', 'moderator', 'economy', 'support') then
    raise exception 'INVALID_ROLE';
  end if;

  update public.admin_users set role = p_role
  where username = lower(btrim(coalesce(p_target_username, '')));
  if not found then
    raise exception 'ADMIN_NOT_FOUND';
  end if;

  perform public.write_audit(v_username, 'admin_set_role', p_target_username, 'success',
    jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- Announcements (live ops)
-- ===========================================================================
create or replace function public.admin_create_announcement(
  p_admin_token text,
  p_body text,
  p_level text,
  p_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_id uuid;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'settings');
  select username into v_username from public.admin_users where id = v_admin;

  if p_level not in ('info', 'warn', 'event') or coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'INVALID_ANNOUNCEMENT';
  end if;

  insert into public.announcements (body, level, ends_at)
  values (p_body, p_level, now() + make_interval(hours => greatest(1, coalesce(p_hours, 24))))
  returning id into v_id;

  perform public.write_audit(v_username, 'announcement_create', v_id::text, 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- public: active announcements (landing + profile)
create or replace function public.get_active_announcements()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'body', body, 'level', level, 'ends_at', to_jsonb(ends_at)
  ) order by starts_at desc), '[]'::jsonb)
  from public.announcements
  where active and starts_at <= now() and ends_at > now();
$$;
