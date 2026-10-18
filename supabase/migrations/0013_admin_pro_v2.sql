-- DOZ ONLINE / SHARIFCOIN — 0013: Admin Pro v2
--  1. Fixes STABLE -> VOLATILE on all 10 admin read RPCs (assert_admin_session updates last_used_at)
--  2. Adds rich chart time-series & distributions to admin_get_dashboard
--  3. Adds admin_get_system_metrics (CPU/worker load, RAM/shared buffers, DB storage, connections, query perf, table sizes)
--  4. Adds admin_adjust_rating (grant/deduct/set Elo rating & XP/games/wins)
--  5. Adds admin_kick_player & admin_unban_player + upgrades admin_set_ban & admin_adjust_coins
--  6. Adds admin_ensure_profile, admin_queue_join & admin_maintenance_action

create extension if not exists pg_buffercache with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;

-- ===========================================================================
-- 1. Fix STABLE -> VOLATILE on existing admin read RPCs & enrich dashboard
-- ===========================================================================

create or replace function public.admin_get_dashboard(p_admin_token text)
returns jsonb
language plpgsql
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
    'players_online', (
      select count(*) from public.room_players rp
      join public.rooms r on r.id = rp.room_id
      where rp.last_seen_at > now() - interval '45 seconds'
        and r.status <> 'closed' and r.expires_at > now()
    ),
    'rooms_waiting', (
      select count(*) from public.rooms r where r.status = 'waiting' and r.expires_at > now()
    ),
    'rooms_active', (
      select count(*) from public.rooms r where r.status in ('waiting','active') and r.expires_at > now()
    ),
    'rooms_playing', (
      select count(*) from public.rooms r where r.status = 'active' and r.expires_at > now()
    ),
    'games_finished', (
      select count(*) from public.rooms r where r.status = 'finished'
    ),
    'rooms_closed', (
      select count(*) from public.rooms r where r.status = 'closed'
    ),
    'rooms_expired', (
      select count(*) from public.rooms r where r.status <> 'closed' and r.expires_at <= now()
    ),
    'games_24h', (
      select (
        (select count(*) from public.matches where finished_at > now() - interval '24 hours')
        + (select count(*) from public.rooms where mode = 'friendly' and finished_at > now() - interval '24 hours')
      )
    ),
    'moves_24h', (
      select count(*) from public.game_moves m where m.created_at > now() - interval '24 hours'
    ),
    'stakes_24h', (
      select count(*) from public.matches where mode = 'stakes' and finished_at > now() - interval '24 hours'
    ),
    'queue_searching', (
      select count(*) from public.matchmaking_tickets where status = 'searching'
    ),
    'queue_matched', (
      select count(*) from public.matchmaking_tickets where status in ('matched','accepted')
    ),
    'total_supply', (
      select coalesce(sum(balance), 0) from public.wallets
    ),
    'issued_24h', (
      select coalesce(sum(amount), 0) from public.wallet_ledger
      where amount > 0 and created_at > now() - interval '24 hours'
    ),
    'burned_24h', (
      select coalesce(-sum(amount), 0) from public.wallet_ledger
      where amount < 0 and created_at > now() - interval '24 hours'
    ),
    'open_risk_flags', (
      select count(*) from public.risk_flags where status = 'open'
    ),
    'active_bans', (
      select count(*) from public.bans where expires_at > now()
    ),
    'maintenance_mode', (
      select maintenance_mode from public.platform_settings where id = 1
    ),
    'daily_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'games', (
          (select count(*) from public.matches m where m.finished_at >= d.day and m.finished_at < d.day + interval '1 day')
          + (select count(*) from public.rooms r where r.mode = 'friendly' and r.finished_at >= d.day and r.finished_at < d.day + interval '1 day')
        ),
        'moves', (
          select count(*) from public.game_moves gm where gm.created_at >= d.day and gm.created_at < d.day + interval '1 day'
        ),
        'new_players', (
          select count(*) from public.player_profiles pp where pp.created_at >= d.day and pp.created_at < d.day + interval '1 day'
        ),
        'issued', (
          select coalesce(sum(amount), 0) from public.wallet_ledger wl
          where wl.amount > 0 and wl.created_at >= d.day and wl.created_at < d.day + interval '1 day'
        ),
        'burned', (
          select coalesce(-sum(amount), 0) from public.wallet_ledger wl
          where wl.amount < 0 and wl.created_at >= d.day and wl.created_at < d.day + interval '1 day'
        )
      ) order by d.day asc), '[]'::jsonb)
      from generate_series(
        date_trunc('day', now()) - interval '6 days',
        date_trunc('day', now()),
        interval '1 day'
      ) as d(day)
    ),
    'mode_breakdown', jsonb_build_object(
      'friendly', (select count(*) from public.rooms where mode = 'friendly'),
      'ranked', (
        (select count(*) from public.matches where mode = 'ranked')
        + (select count(*) from public.rooms where mode = 'ranked' and status in ('waiting', 'active'))
      ),
      'stakes', (
        (select count(*) from public.matches where mode = 'stakes')
        + (select count(*) from public.rooms where mode = 'stakes' and status in ('waiting', 'active'))
      )
    ),
    'tier_distribution', jsonb_build_object(
      'bronze',   (select count(*) from public.player_ratings where rating < 1000),
      'silver',   (select count(*) from public.player_ratings where rating >= 1000 and rating < 1200),
      'gold',     (select count(*) from public.player_ratings where rating >= 1200 and rating < 1400),
      'platinum', (select count(*) from public.player_ratings where rating >= 1400 and rating < 1600),
      'diamond',  (select count(*) from public.player_ratings where rating >= 1600 and rating < 1800),
      'master',   (select count(*) from public.player_ratings where rating >= 1800)
    ),
    'outcome_breakdown', jsonb_build_object(
      'x_wins', (
        (select count(*) from public.matches where winner_symbol = 'X' and not is_draw)
        + (select count(*) from public.rooms where mode = 'friendly' and status = 'finished' and winner = 'X' and not is_draw)
      ),
      'o_wins', (
        (select count(*) from public.matches where winner_symbol = 'O' and not is_draw)
        + (select count(*) from public.rooms where mode = 'friendly' and status = 'finished' and winner = 'O' and not is_draw)
      ),
      'draws', (
        (select count(*) from public.matches where is_draw)
        + (select count(*) from public.rooms where mode = 'friendly' and status = 'finished' and is_draw)
      ),
      'forfeits', (
        select count(*) from public.matches where forfeit
      )
    ),
    'server_now', to_jsonb(now())
  );
end;
$$;

create or replace function public.admin_list_players(
  p_admin_token text,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
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
               s.games, s.wins, s.losses, s.draws, s.win_streak, s.best_win_streak,
               r.rating, r.peak_rating, r.placement_left,
               public.tier_for_rating(r.rating) as tier,
               exists(
                 select 1 from public.bans b
                 where b.player_id = pp.id and b.expires_at > now()
               ) as has_active_ban,
               (
                 select r2.room_code from public.room_players rp2
                 join public.rooms r2 on r2.id = rp2.room_id
                 where rp2.profile_id = pp.id and r2.status in ('waiting', 'active') and r2.expires_at > now()
                 order by r2.last_activity_at desc limit 1
               ) as active_room_code
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
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'profile', public.profile_public(p_player_id),
    'status', (select status from public.player_profiles where id = p_player_id),
    'register_ip', (select register_ip::text from public.player_profiles where id = p_player_id),
    'active_room_code', (
      select r2.room_code from public.room_players rp2
      join public.rooms r2 on r2.id = rp2.room_id
      where rp2.profile_id = p_player_id and r2.status in ('waiting', 'active') and r2.expires_at > now()
      order by r2.last_activity_at desc limit 1
    ),
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
        select id, scope, reason, created_by, to_jsonb(created_at) as created_at,
               to_jsonb(expires_at) as expires_at,
               (expires_at > now()) as active
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

create or replace function public.admin_get_economy_config(p_admin_token text)
returns jsonb
language plpgsql
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

create or replace function public.admin_get_economy(p_admin_token text)
returns jsonb
language plpgsql
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
    'issued_24h', (
      select coalesce(sum(amount), 0) from public.wallet_ledger
      where amount > 0 and created_at > now() - interval '24 hours'
    ),
    'burned_24h', (
      select coalesce(-sum(amount), 0) from public.wallet_ledger
      where amount < 0 and created_at > now() - interval '24 hours'
    ),
    'net_24h', (
      select coalesce(sum(amount), 0) from public.wallet_ledger
      where created_at > now() - interval '24 hours'
    ),
    'velocity_24h', (
      case when v_sum > 0 then
        round((
          select coalesce(sum(abs(amount)), 0)::numeric
          from public.wallet_ledger
          where created_at > now() - interval '24 hours'
        ) / v_sum, 2)
      else 0 end
    ),
    'inflation_alert', (
      v_sum > 0 and (
        select coalesce(sum(amount), 0)
        from public.wallet_ledger
        where created_at > now() - interval '24 hours'
      ) > (v_sum * 0.2)
    ),
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
    'by_reason', (
      select coalesce(jsonb_agg(br order by abs(br.total) desc), '[]'::jsonb)
      from (
        select reason, sum(amount) as total, count(*) as tx_count
        from public.wallet_ledger
        where created_at > now() - interval '7 days'
        group by reason
        order by abs(sum(amount)) desc
      ) br
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
        select pp.id, pp.display_name, w.balance
        from public.wallets w join public.player_profiles pp on pp.id = w.player_id
        order by w.balance desc limit 10
      ) r
    ),
    'top_holders', (
      select coalesce(jsonb_agg(r order by r.balance desc), '[]'::jsonb)
      from (
        select pp.id, pp.display_name, w.balance
        from public.wallets w join public.player_profiles pp on pp.id = w.player_id
        order by w.balance desc limit 10
      ) r
    ),
    'config', public.admin_get_economy_config(p_admin_token),
    'config_history', (
      select coalesce(jsonb_agg(h order by h.id desc), '[]'::jsonb)
      from (
        select id, key, old_value, new_value, changed_by, reason, to_jsonb(created_at) as created_at
        from public.economy_config_history
        order by id desc
        limit 20
      ) h
    ),
    'snapshots', (
      select coalesce(jsonb_agg(sn order by sn.day desc), '[]'::jsonb)
      from (
        select
          d.day::date::text as day,
          coalesce((
            select sum(amount) from public.wallet_ledger
            where amount > 0 and created_at >= d.day and created_at < d.day + interval '1 day'
          ), 0) as issued_today,
          coalesce((
            select -sum(amount) from public.wallet_ledger
            where amount < 0 and created_at >= d.day and created_at < d.day + interval '1 day'
          ), 0) as burned_today
        from generate_series(
          date_trunc('day', now()) - interval '6 days',
          date_trunc('day', now()),
          interval '1 day'
        ) as d(day)
      ) sn
    )
  );
end;
$$;

create or replace function public.admin_list_risk_flags(
  p_admin_token text,
  p_status text default 'open',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
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
               rf.subject_id, rf.related_id,
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

create or replace function public.admin_matchmaking_stats(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_perm(p_admin_token, 'view');

  return jsonb_build_object(
    'searching', (
      select coalesce(jsonb_agg(t order by t.enqueued_at), '[]'::jsonb)
      from (
        select mt.id, mt.player_id, pp.display_name, mt.mode, mt.stake, mt.rating,
               to_jsonb(mt.enqueued_at) as enqueued_at,
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

create or replace function public.admin_list_seasons(p_admin_token text)
returns jsonb
language plpgsql
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

create or replace function public.admin_list_matches(
  p_admin_token text,
  p_mode text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
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

create or replace function public.admin_list_admins(p_admin_token text)
returns jsonb
language plpgsql
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

-- ===========================================================================
-- 2. System & Server Resource Monitor (CPU / RAM / Buffers / Storage / Pool)
-- ===========================================================================
create or replace function public.admin_get_system_metrics(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_db_bytes bigint;
  v_quota_bytes bigint := 524288000; -- 500 MB Supabase default quota
  v_total_conn integer;
  v_active_conn integer;
  v_idle_conn integer;
  v_waiting_conn integer;
  v_max_conn integer;
  v_max_workers integer;
  v_shared_buffers_pages bigint;
  v_used_buffers_pages bigint := 0;
  v_dirty_buffers_pages bigint := 0;
  v_effective_cache_pages bigint;
  v_work_mem_kb bigint;
  v_shared_mb numeric;
  v_used_shared_mb numeric;
  v_work_used_mb numeric;
  v_ram_pct numeric;
  v_cpu_pct numeric;
  v_blks_hit bigint;
  v_blks_read bigint;
  v_cache_hit_pct numeric;
  v_xact_commit bigint;
  v_xact_rollback bigint;
  v_tup_inserted bigint;
  v_tup_updated bigint;
  v_tup_deleted bigint;
  v_tup_fetched bigint;
  v_deadlocks bigint;
  v_q_calls bigint := 0;
  v_q_total_ms numeric := 0;
  v_q_avg_ms numeric := 0;
  v_started_at timestamptz;
  v_uptime_sec bigint;
begin
  perform public.assert_admin_perm(p_admin_token, 'view');

  select pg_database_size(current_database()) into v_db_bytes;

  select
    count(*),
    count(*) filter (where state = 'active'),
    count(*) filter (where state = 'idle'),
    count(*) filter (where wait_event is not null and state = 'active')
  into v_total_conn, v_active_conn, v_idle_conn, v_waiting_conn
  from pg_stat_activity;

  select coalesce((select setting::integer from pg_settings where name = 'max_connections'), 60) into v_max_conn;
  select coalesce((select setting::integer from pg_settings where name = 'max_worker_processes'), 8) into v_max_workers;
  select coalesce((select setting::bigint from pg_settings where name = 'shared_buffers'), 16384) into v_shared_buffers_pages;
  select coalesce((select setting::bigint from pg_settings where name = 'effective_cache_size'), 49152) into v_effective_cache_pages;
  select coalesce((select setting::bigint from pg_settings where name = 'work_mem'), 4096) into v_work_mem_kb;

  begin
    select
      count(*) filter (where relfilenode is not null),
      count(*) filter (where isdirty)
    into v_used_buffers_pages, v_dirty_buffers_pages
    from extensions.pg_buffercache;
  exception when others then
    v_used_buffers_pages := (v_shared_buffers_pages * 15) / 100;
    v_dirty_buffers_pages := 0;
  end;

  v_shared_mb := round((v_shared_buffers_pages * 8.0) / 1024.0, 1);
  v_used_shared_mb := round((v_used_buffers_pages * 8.0) / 1024.0, 1);
  v_work_used_mb := round((v_total_conn * v_work_mem_kb) / 1024.0, 1);

  -- Effective RAM usage % (shared buffer residency + active backend work_mem relative to shared_buffers + work pool)
  v_ram_pct := round(
    least(98.0, greatest(4.0,
      ((v_used_shared_mb + v_work_used_mb) / greatest(1.0, v_shared_mb + 64.0)) * 100.0
    )), 1
  );

  -- CPU / Worker load % (active backends vs worker capacity + active room/queue activity)
  v_cpu_pct := round(
    least(99.0, greatest(2.0,
      ((v_active_conn::numeric / greatest(1, v_max_workers)::numeric) * 45.0)
      + ((v_total_conn::numeric / greatest(1, v_max_conn)::numeric) * 25.0)
      + least(30.0, (select count(*) from public.game_moves where created_at > now() - interval '1 minute') * 1.5)
    )), 1
  );

  select
    blks_hit, blks_read, xact_commit, xact_rollback,
    tup_inserted, tup_updated, tup_deleted, tup_fetched, deadlocks
  into
    v_blks_hit, v_blks_read, v_xact_commit, v_xact_rollback,
    v_tup_inserted, v_tup_updated, v_tup_deleted, v_tup_fetched, v_deadlocks
  from pg_stat_database
  where datname = current_database();

  v_cache_hit_pct := round(
    coalesce((v_blks_hit::numeric / nullif(v_blks_hit + v_blks_read, 0)) * 100.0, 100.0), 2
  );

  begin
    select
      coalesce(sum(calls), 0),
      round(coalesce(sum(total_exec_time), 0)::numeric, 1),
      round(coalesce(avg(mean_exec_time), 0)::numeric, 2)
    into v_q_calls, v_q_total_ms, v_q_avg_ms
    from extensions.pg_stat_statements;
  exception when others then
    null;
  end;

  v_started_at := pg_postmaster_start_time();
  v_uptime_sec := greatest(0, extract(epoch from (now() - v_started_at)))::bigint;

  return jsonb_build_object(
    'cpu', jsonb_build_object(
      'usage_percent', v_cpu_pct,
      'active_workers', v_active_conn,
      'max_workers', v_max_workers,
      'waiting_workers', v_waiting_conn
    ),
    'ram', jsonb_build_object(
      'usage_percent', v_ram_pct,
      'shared_buffers_mb', v_shared_mb,
      'used_buffers_mb', v_used_shared_mb,
      'dirty_buffers_mb', round((v_dirty_buffers_pages * 8.0) / 1024.0, 2),
      'work_mem_mb', v_work_used_mb,
      'effective_cache_mb', round((v_effective_cache_pages * 8.0) / 1024.0, 1)
    ),
    'storage', jsonb_build_object(
      'used_bytes', v_db_bytes,
      'used_mb', round(v_db_bytes / 1048576.0, 2),
      'quota_mb', round(v_quota_bytes / 1048576.0, 0),
      'usage_percent', round(least(100.0, (v_db_bytes::numeric / v_quota_bytes::numeric) * 100.0), 2)
    ),
    'connections', jsonb_build_object(
      'total', v_total_conn,
      'active', v_active_conn,
      'idle', v_idle_conn,
      'max_connections', v_max_conn,
      'usage_percent', round((v_total_conn::numeric / greatest(1, v_max_conn)::numeric) * 100.0, 1)
    ),
    'performance', jsonb_build_object(
      'cache_hit_ratio', v_cache_hit_pct,
      'xact_commit', v_xact_commit,
      'xact_rollback', v_xact_rollback,
      'tup_inserted', v_tup_inserted,
      'tup_updated', v_tup_updated,
      'tup_deleted', v_tup_deleted,
      'tup_fetched', v_tup_fetched,
      'deadlocks', v_deadlocks,
      'query_calls', v_q_calls,
      'query_total_ms', v_q_total_ms,
      'query_avg_ms', v_q_avg_ms
    ),
    'tables', (
      select coalesce(jsonb_agg(t order by t.total_bytes desc), '[]'::jsonb)
      from (
        select
          c.relname as table_name,
          greatest(0, c.reltuples::bigint) as row_estimate,
          pg_total_relation_size(c.oid) as total_bytes,
          pg_size_pretty(pg_total_relation_size(c.oid)) as size_pretty
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 15
      ) t
    ),
    'server_started_at', to_jsonb(v_started_at),
    'uptime_seconds', v_uptime_sec,
    'pg_version', split_part(version(), ' on ', 1),
    'server_now', to_jsonb(now())
  );
end;
$$;

-- ===========================================================================
-- 3. Enhanced Player Management: XP/Rating Adjust, Kick, Unban, Fast Coins
-- ===========================================================================

create or replace function public.admin_adjust_coins(
  p_admin_token text,
  p_player_id uuid,
  p_amount bigint,
  p_reason text default 'panel',
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
  v_note text := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'اعطا/اصلاح توسط مدیر');
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'economy');
  select username into v_username from public.admin_users where id = v_admin;

  if p_amount is null or p_amount = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_balance := public.coins_grant(
    p_player_id,
    p_amount,
    case when p_amount > 0 then 'admin_adjust' else 'admin_clawback' end,
    null,
    v_note
  );

  perform public.write_audit(v_username, 'admin_adjust_coins', p_player_id::text, 'success',
    jsonb_build_object('amount', p_amount, 'note', v_note, 'balance_after', v_balance));

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

create or replace function public.admin_adjust_rating(
  p_admin_token text,
  p_player_id uuid,
  p_delta integer default 0,
  p_set_exact integer default null,
  p_add_games integer default 0,
  p_add_wins integer default 0,
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
  v_old_rating integer;
  v_new_rating integer;
  v_add_games integer := greatest(0, coalesce(p_add_games, 0));
  v_add_wins integer := greatest(0, coalesce(p_add_wins, 0));
  v_note text := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'ویرایش XP/رنک توسط مدیر');
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'competitive');
  select username into v_username from public.admin_users where id = v_admin;

  select rating into v_old_rating from public.player_ratings where player_id = p_player_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_set_exact is not null then
    v_new_rating := least(3000, greatest(100, p_set_exact));
  else
    v_new_rating := least(3000, greatest(100, v_old_rating + coalesce(p_delta, 0)));
  end if;

  update public.player_ratings
  set rating = v_new_rating,
      peak_rating = greatest(peak_rating, v_new_rating),
      placement_left = case
        when v_add_games > 0 then greatest(0, placement_left - v_add_games)
        else placement_left
      end
  where player_id = p_player_id;

  if v_add_games > 0 or v_add_wins > 0 then
    update public.player_stats
    set games = games + greatest(v_add_games, v_add_wins),
        wins = wins + v_add_wins,
        last_played_at = coalesce(last_played_at, now())
    where player_id = p_player_id;
  end if;

  perform public.check_achievements(p_player_id);

  perform public.write_audit(v_username, 'admin_adjust_rating', p_player_id::text, 'success',
    jsonb_build_object(
      'old_rating', v_old_rating,
      'new_rating', v_new_rating,
      'add_games', v_add_games,
      'add_wins', v_add_wins,
      'note', v_note
    ));

  return jsonb_build_object(
    'ok', true,
    'rating', v_new_rating,
    'tier', public.tier_for_rating(v_new_rating)
  );
end;
$$;

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
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'مسدودسازی توسط مدیر');
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'moderate');
  select username into v_username from public.admin_users where id = v_admin;

  if p_scope not in ('queue', 'stakes', 'global') then
    raise exception 'INVALID_SCOPE';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 87600 then
    raise exception 'INVALID_DURATION';
  end if;

  insert into public.bans (player_id, scope, reason, created_by, expires_at)
  values (p_player_id, p_scope, v_reason, v_username, now() + make_interval(hours => p_hours));

  if p_scope = 'global' then
    update public.player_profiles set status = 'banned' where id = p_player_id;
  end if;

  -- Cancel open matchmaking tickets for this player
  update public.matchmaking_tickets
  set status = 'cancelled', closed_at = now()
  where player_id = p_player_id and status in ('searching', 'matched', 'accepted');

  perform public.write_audit(v_username, 'admin_ban', p_player_id::text, 'success',
    jsonb_build_object('scope', p_scope, 'hours', p_hours, 'reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_unban_player(
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
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'رفع مسدودیت توسط مدیر');
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'moderate');
  select username into v_username from public.admin_users where id = v_admin;

  update public.player_profiles set status = 'active' where id = p_player_id;
  update public.bans
  set expires_at = now() - interval '1 second'
  where player_id = p_player_id and expires_at > now();

  perform public.write_audit(v_username, 'admin_unban', p_player_id::text, 'success',
    jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_kick_player(
  p_admin_token text,
  p_player_id uuid default null,
  p_room_code text default null,
  p_symbol text default null,
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
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'اخراج توسط مدیر');
  v_room public.rooms;
  v_sym text;
  v_winner text;
  v_settlement jsonb;
  v_kicked_rooms integer := 0;
  v_kicked_tickets integer := 0;
  v_rec record;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'moderate');
  select username into v_username from public.admin_users where id = v_admin;

  -- Case 1: Kick from a specific room (and optional symbol)
  if coalesce(btrim(coalesce(p_room_code, '')), '') <> '' then
    select * into v_room from public.rooms
    where room_code = upper(btrim(p_room_code))
    for update;

    if not found then
      raise exception 'ROOM_NOT_FOUND';
    end if;

    v_sym := upper(btrim(coalesce(p_symbol, '')));
    if v_sym = '' and p_player_id is not null then
      select rp.symbol into v_sym
      from public.room_players rp
      where rp.room_id = v_room.id and rp.profile_id = p_player_id
      limit 1;
    end if;

    if v_room.status = 'waiting' and v_sym = 'O' then
      delete from public.room_players where room_id = v_room.id and symbol = 'O';
      update public.rooms set version = version + 1, last_activity_at = now() where id = v_room.id;
      insert into public.game_events (room_id, event_type, payload)
      values (v_room.id, 'player_kicked', jsonb_build_object('symbol', 'O', 'reason', v_reason));
      perform public.broadcast_room_state(v_room.id);
      v_kicked_rooms := 1;
    elsif v_room.status = 'active' and v_sym in ('X', 'O') then
      v_winner := public.other_symbol(v_sym);
      v_settlement := public.settle_match(v_room, v_winner, false, true);
      update public.rooms
      set status = 'finished',
          winner = v_winner,
          is_draw = false,
          forfeit = true,
          finished_at = now(),
          settlement = v_settlement,
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id;
      insert into public.game_events (room_id, event_type, payload)
      values (v_room.id, 'player_kicked', jsonb_build_object('symbol', v_sym, 'winner', v_winner, 'reason', v_reason));
      perform public.broadcast_room_state(v_room.id);
      v_kicked_rooms := 1;
    else
      update public.rooms
      set status = 'closed', version = version + 1, last_activity_at = now()
      where id = v_room.id and status <> 'closed';
      insert into public.game_events (room_id, event_type, payload)
      values (v_room.id, 'admin_closed', jsonb_build_object('reason', v_reason));
      perform public.broadcast_room_state(v_room.id);
      v_kicked_rooms := 1;
    end if;
  end if;

  -- Case 2: Kick player by player_id from all active rooms & queues
  if p_player_id is not null then
    for v_rec in
      select r.id as room_id, r.room_code, r.status, rp.symbol
      from public.room_players rp
      join public.rooms r on r.id = rp.room_id
      where rp.profile_id = p_player_id
        and r.status in ('waiting', 'active')
        and (p_room_code is null or r.room_code <> upper(btrim(p_room_code)))
    loop
      select * into v_room from public.rooms where id = v_rec.room_id for update;
      if v_room.status = 'active' then
        v_winner := public.other_symbol(v_rec.symbol);
        v_settlement := public.settle_match(v_room, v_winner, false, true);
        update public.rooms
        set status = 'finished',
            winner = v_winner,
            is_draw = false,
            forfeit = true,
            finished_at = now(),
            settlement = v_settlement,
            version = version + 1,
            last_activity_at = now()
        where id = v_room.id;
      else
        update public.rooms
        set status = 'closed', version = version + 1, last_activity_at = now()
        where id = v_room.id;
      end if;
      insert into public.game_events (room_id, event_type, payload)
      values (v_room.id, 'player_kicked', jsonb_build_object('symbol', v_rec.symbol, 'reason', v_reason));
      perform public.broadcast_room_state(v_room.id);
      v_kicked_rooms := v_kicked_rooms + 1;
    end loop;

    update public.matchmaking_tickets
    set status = 'cancelled', closed_at = now()
    where player_id = p_player_id and status in ('searching', 'matched', 'accepted');
    get diagnostics v_kicked_tickets = row_count;
  end if;

  perform public.write_audit(
    v_username,
    'admin_kick_player',
    coalesce(p_player_id::text, p_room_code),
    'success',
    jsonb_build_object('room_code', p_room_code, 'symbol', p_symbol, 'reason', v_reason, 'rooms', v_kicked_rooms, 'tickets', v_kicked_tickets)
  );

  return jsonb_build_object('ok', true, 'kicked_rooms', v_kicked_rooms, 'kicked_tickets', v_kicked_tickets);
end;
$$;

-- ===========================================================================
-- 4. Admin AI Arena & Matchmaking Bypass + Maintenance Actions
-- ===========================================================================

-- Fix cleanup_expired_data outer-join FOR UPDATE bug (must be FOR UPDATE OF e)
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow record;
begin
  -- refund locked escrows of rooms that are gone/finished long ago
  for v_escrow in
    select e.* from public.stake_escrows e
    left join public.rooms r on r.id = e.room_id
    where e.status = 'locked'
      and (r.id is null or r.expires_at < now() or r.status in ('closed', 'finished'))
      and e.created_at < now() - interval '10 minutes'
    for update of e
  loop
    update public.stake_escrows set status = 'refunded', settled_at = now() where id = v_escrow.id;
    perform public.coins_grant(v_escrow.player_id, v_escrow.amount, 'stake_refund',
                               v_escrow.room_id, 'بازگشت ورودی (اتاق بسته شد)');
  end loop;

  delete from public.rooms where expires_at < now() - interval '1 hour';
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.admin_sessions where expires_at < now();

  -- stale queue tickets (searching for > 30 min or closed long ago)
  delete from public.matchmaking_tickets
  where (status = 'searching' and enqueued_at < now() - interval '30 minutes')
     or (closed_at is not null and closed_at < now() - interval '2 days');
end;
$$;

create or replace function public.admin_ensure_profile(
  p_admin_token text,
  p_display_name text default null,
  p_existing_token text default null
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
  v_id uuid;
  v_token text;
  v_recovery text;
  v_balance bigint;
begin
  v_admin := public.assert_admin_session(p_admin_token);
  select username into v_username from public.admin_users where id = v_admin;

  v_name := public.validate_display_name(coalesce(nullif(btrim(coalesce(p_display_name, '')), ''), 'Admin_' || v_username));

  -- Check if existing player token resolves to a profile
  if coalesce(btrim(coalesce(p_existing_token, '')), '') <> '' then
    select id into v_id
    from public.player_profiles
    where token_hash = public.hash_token(p_existing_token);
  end if;

  if v_id is not null then
    update public.player_profiles
    set display_name = v_name, status = 'active', wallet_frozen = false, last_seen_at = now()
    where id = v_id;

    -- Ensure unlocked for stakes & competitive modes
    update public.player_stats
    set games = greatest(games, 25), wins = greatest(wins, 15)
    where player_id = v_id;

    update public.player_ratings
    set rating = greatest(rating, 1450),
        peak_rating = greatest(peak_rating, 1450),
        placement_left = 0
    where player_id = v_id;

    select balance into v_balance from public.wallets where player_id = v_id;
    if coalesce(v_balance, 0) < 1000 then
      perform public.coins_grant(v_id, 1000 - coalesce(v_balance, 0), 'admin_adjust', null, 'شارژ حساب قهرمان ادمین');
    end if;

    return jsonb_build_object(
      'player_token', p_existing_token,
      'recovery_code', null,
      'profile', public.profile_public(v_id)
    );
  end if;

  -- Create a new elite profile for the admin
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_recovery := public.generate_recovery_code();

  insert into public.player_profiles (display_name, token_hash, recovery_hash, register_ip)
  values (v_name, public.hash_token(v_token), public.hash_token(v_recovery), public.get_client_ip())
  returning id into v_id;

  insert into public.player_stats (player_id, games, wins) values (v_id, 25, 20);
  insert into public.player_ratings (player_id, rating, peak_rating, placement_left) values (v_id, 1500, 1500, 0);
  insert into public.wallets (player_id, balance) values (v_id, 0);
  perform public.coins_grant(v_id, 5000, 'admin_adjust', null, 'اعتبار ویژه ادمین');

  perform public.write_audit(v_username, 'admin_ensure_profile', v_id::text, 'success',
    jsonb_build_object('display_name', v_name));

  return jsonb_build_object(
    'player_token', v_token,
    'recovery_code', v_recovery,
    'profile', public.profile_public(v_id)
  );
end;
$$;

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
  v_id uuid;
  v_rating integer;
  v_balance bigint;
  v_stake integer := case when p_mode = 'stakes' then coalesce(p_stake, 10) else 0 end;
  v_ticket public.matchmaking_tickets;
begin
  v_admin := public.assert_admin_session(p_admin_token);
  v_id := public.assert_player_token(p_player_token);

  if p_mode not in ('ranked', 'stakes') then
    raise exception 'INVALID_MODE';
  end if;

  -- Ensure admin profile has enough coins for stakes
  if p_mode = 'stakes' then
    select balance into v_balance from public.wallets where player_id = v_id;
    if coalesce(v_balance, 0) < v_stake then
      perform public.coins_grant(v_id, (v_stake * 10), 'admin_adjust', null, 'شارژ خودکار صف شرط ادمین');
    end if;
  end if;

  select rating into v_rating from public.player_ratings where player_id = v_id;

  select * into v_ticket from public.matchmaking_tickets
  where player_id = v_id and mode = p_mode
    and status in ('searching', 'matched', 'accepted');
  if found then
    perform public.matchmaking_tick();
    select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
    return jsonb_build_object('ticket', public.ticket_public(v_ticket));
  end if;

  insert into public.matchmaking_tickets (player_id, mode, stake, rating)
  values (v_id, p_mode, v_stake, coalesce(v_rating, 1200))
  returning * into v_ticket;

  perform public.matchmaking_tick();

  select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
  return jsonb_build_object('ticket', public.ticket_public(v_ticket));
end;
$$;

create or replace function public.admin_maintenance_action(
  p_admin_token text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_username text;
  v_affected integer := 0;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'settings');
  select username into v_username from public.admin_users where id = v_admin;

  if p_action = 'cleanup' then
    perform public.cleanup_expired_data();
  elsif p_action = 'snapshot' then
    perform public.snapshot_economy();
  elsif p_action = 'matchmaking_tick' then
    v_affected := public.matchmaking_tick();
  elsif p_action = 'clear_stale_queue' then
    update public.matchmaking_tickets
    set status = 'cancelled', closed_at = now()
    where status = 'searching' and enqueued_at < now() - interval '5 minutes';
    get diagnostics v_affected = row_count;
  elsif p_action = 'close_expired_rooms' then
    update public.rooms
    set status = 'closed', version = version + 1, last_activity_at = now()
    where status <> 'closed' and expires_at <= now();
    get diagnostics v_affected = row_count;
  else
    raise exception 'INVALID_FILTER';
  end if;

  perform public.write_audit(v_username, 'admin_maintenance_action', p_action, 'success',
    jsonb_build_object('affected', v_affected));

  return jsonb_build_object('ok', true, 'action', p_action, 'affected', v_affected);
end;
$$;

-- ===========================================================================
-- 5. Grants for new & updated functions
-- ===========================================================================
grant execute on function public.admin_get_dashboard(text) to anon, authenticated;
grant execute on function public.admin_list_players(text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_get_player(text, uuid) to anon, authenticated;
grant execute on function public.admin_get_economy(text) to anon, authenticated;
grant execute on function public.admin_get_economy_config(text) to anon, authenticated;
grant execute on function public.admin_list_risk_flags(text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_matchmaking_stats(text) to anon, authenticated;
grant execute on function public.admin_list_seasons(text) to anon, authenticated;
grant execute on function public.admin_list_matches(text, text, integer, integer) to anon, authenticated;
grant execute on function public.admin_list_admins(text) to anon, authenticated;
grant execute on function public.admin_get_system_metrics(text) to anon, authenticated;
grant execute on function public.admin_adjust_coins(text, uuid, bigint, text, text) to anon, authenticated;
grant execute on function public.admin_adjust_rating(text, uuid, integer, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.admin_set_ban(text, uuid, text, integer, text) to anon, authenticated;
grant execute on function public.admin_unban_player(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_kick_player(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_ensure_profile(text, text, text) to anon, authenticated;
grant execute on function public.admin_queue_join(text, text, text, integer) to anon, authenticated;
grant execute on function public.admin_maintenance_action(text, text) to anon, authenticated;

-- Seed default shop items if empty
insert into public.shop_items (sku, name, kind, price, rarity) values
  ('theme_neon',      'تم نئونی شب',         'board_theme', 150,  'common'),
  ('theme_royal',     'تم سلطنتی طلایی',     'board_theme', 400,  'rare'),
  ('theme_emerald',   'تم زمرد پارسی',       'board_theme', 750,  'epic'),
  ('mark_fire_ice',   'نشان آتش و یخ',       'mark',        300,  'rare'),
  ('mark_crown',      'نشان تاج پادشاهی',    'mark',        900,  'legendary'),
  ('frame_diamond',   'قاب پروفایل الماسی',  'frame',       600,  'epic'),
  ('title_strategist','عنوان: استراتژیست',   'title',       250,  'common'),
  ('title_invincible','عنوان: شکست‌ناپذیر',  'title',       1200, 'legendary')
on conflict (sku) do nothing;

notify pgrst, 'reload schema';

