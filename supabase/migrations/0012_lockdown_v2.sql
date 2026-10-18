-- SHARIFCOIN / DOZ ONLINE — 0012: lockdown v2 (new tables) + function grants
-- Same hard policy as 0005: deny-all RLS on every table, revoke direct access,
-- and grant an explicit allow-list of audited SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------
-- RLS: enable + deny-all on every new table
-- ---------------------------------------------------------------------------
alter table public.player_profiles    enable row level security;
alter table public.player_stats       enable row level security;
alter table public.player_ratings     enable row level security;
alter table public.wallets            enable row level security;
alter table public.wallet_ledger      enable row level security;
alter table public.matches            enable row level security;
alter table public.matchmaking_tickets enable row level security;
alter table public.stake_escrows      enable row level security;
alter table public.seasons            enable row level security;
alter table public.season_standings   enable row level security;
alter table public.shop_items         enable row level security;
alter table public.player_inventory   enable row level security;
alter table public.achievements       enable row level security;
alter table public.player_achievements enable row level security;
alter table public.risk_flags         enable row level security;
alter table public.bans               enable row level security;
alter table public.economy_config     enable row level security;
alter table public.economy_config_history enable row level security;
alter table public.economy_snapshots  enable row level security;
alter table public.announcements      enable row level security;
alter table public.events             enable row level security;

revoke all on public.player_profiles,
              public.player_stats,
              public.player_ratings,
              public.wallets,
              public.wallet_ledger,
              public.matches,
              public.matchmaking_tickets,
              public.stake_escrows,
              public.seasons,
              public.season_standings,
              public.shop_items,
              public.player_inventory,
              public.achievements,
              public.player_achievements,
              public.risk_flags,
              public.bans,
              public.economy_config,
              public.economy_config_history,
              public.economy_snapshots,
              public.announcements,
              public.events
from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily economy snapshot helper (fed by pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.snapshot_economy()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.economy_snapshots (
    day, total_supply, issued_24h, burned_24h, active_players, matches_24h, median_balance
  )
  values (
    current_date,
    (select coalesce(sum(balance), 0) from public.wallets),
    (select coalesce(sum(amount), 0) from public.wallet_ledger
      where amount > 0 and created_at > now() - interval '24 hours'),
    (select coalesce(-sum(amount), 0) from public.wallet_ledger
      where amount < 0 and created_at > now() - interval '24 hours'),
    (select count(*) from public.player_profiles where last_seen_at > now() - interval '24 hours'),
    (select count(*) from public.matches where finished_at > now() - interval '24 hours'),
    (select coalesce(percentile_cont(0.5) within group (order by balance), 0)::bigint from public.wallets)
  )
  on conflict (day) do update set
    total_supply    = excluded.total_supply,
    issued_24h      = excluded.issued_24h,
    burned_24h      = excluded.burned_24h,
    active_players  = excluded.active_players,
    matches_24h     = excluded.matches_24h,
    median_balance  = excluded.median_balance,
    created_at      = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Function allow-list (fresh grants; safe to run repeatedly)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- player surface — original
grant execute on function public.create_room(text) to anon;
grant execute on function public.join_room(text, text) to anon;
grant execute on function public.get_room_state(text, text, boolean) to anon;
grant execute on function public.make_move(text, text, integer) to anon;
grant execute on function public.request_rematch(text, text) to anon;
grant execute on function public.leave_room(text, text) to anon;
grant execute on function public.get_public_status() to anon;

-- player surface — profiles & economy
grant execute on function public.register_player(text) to anon;
grant execute on function public.recover_player(text) to anon;
grant execute on function public.rotate_recovery_code(text) to anon;
grant execute on function public.get_my_profile(text) to anon;
grant execute on function public.get_leaderboard(text, integer, integer) to anon;
grant execute on function public.list_shop_items() to anon;
grant execute on function public.purchase_item(text, uuid) to anon;
grant execute on function public.get_active_announcements() to anon;

-- player surface — matchmaking
grant execute on function public.queue_join(text, text, integer) to anon;
grant execute on function public.queue_leave(text) to anon;
grant execute on function public.queue_accept(text) to anon;
grant execute on function public.queue_status(text) to anon;

-- admin surface — original
grant execute on function public.admin_login(text, text) to anon;
grant execute on function public.admin_verify(text) to anon;
grant execute on function public.admin_logout(text) to anon;
grant execute on function public.admin_change_password(text, text, text) to anon;
grant execute on function public.admin_get_overview(text) to anon;
grant execute on function public.admin_list_rooms(text, text, text, integer, integer) to anon;
grant execute on function public.admin_get_room(text, text) to anon;
grant execute on function public.admin_close_room(text, text, text) to anon;
grant execute on function public.admin_list_games(text, integer, integer) to anon;
grant execute on function public.admin_get_settings(text) to anon;
grant execute on function public.admin_update_settings(text, integer, integer, integer, boolean, text) to anon;
grant execute on function public.admin_get_audit(text, integer, integer) to anon;

-- admin surface — professional suite
grant execute on function public.admin_get_dashboard(text) to anon;
grant execute on function public.admin_list_players(text, text, integer, integer) to anon;
grant execute on function public.admin_get_player(text, uuid) to anon;
grant execute on function public.admin_adjust_coins(text, uuid, bigint, text, text) to anon;
grant execute on function public.admin_set_wallet_frozen(text, uuid, boolean, text) to anon;
grant execute on function public.admin_set_ban(text, uuid, text, integer, text) to anon;
grant execute on function public.admin_reset_rating(text, uuid, text) to anon;
grant execute on function public.admin_get_economy(text) to anon;
grant execute on function public.admin_get_economy_config(text) to anon;
grant execute on function public.admin_update_economy_config(text, text, text, text) to anon;
grant execute on function public.admin_rollback_economy_config(text, bigint, text) to anon;
grant execute on function public.admin_list_risk_flags(text, text, integer, integer) to anon;
grant execute on function public.admin_resolve_risk_flag(text, uuid, text, text) to anon;
grant execute on function public.admin_matchmaking_stats(text) to anon;
grant execute on function public.admin_list_seasons(text) to anon;
grant execute on function public.admin_create_season(text, text, timestamptz, timestamptz, numeric) to anon;
grant execute on function public.admin_end_season(text, uuid) to anon;
grant execute on function public.admin_list_matches(text, text, integer, integer) to anon;
grant execute on function public.admin_create_shop_item(text, text, text, text, integer, text) to anon;
grant execute on function public.admin_list_admins(text) to anon;
grant execute on function public.admin_set_role(text, text, text) to anon;
grant execute on function public.admin_create_announcement(text, text, text, integer) to anon;

-- ---------------------------------------------------------------------------
-- Scheduled jobs: economy snapshot (daily) + matchmaking tick (every minute)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'doz-economy-snapshot') then
    perform cron.schedule(
      'doz-economy-snapshot',
      '20 0 * * *',
      $cron$ select public.snapshot_economy() $cron$
    );
  end if;
  if not exists (select 1 from cron.job where jobname = 'doz-matchmaking') then
    perform cron.schedule(
      'doz-matchmaking',
      '* * * * *',
      $cron$ select public.matchmaking_tick() $cron$
    );
  end if;
end;
$$;
