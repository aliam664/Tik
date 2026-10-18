-- DOZ ONLINE — 0005: lockdown
-- Hard data-access policy:
--  • RLS is ENABLED on every table with NO permissive policies → deny-all
--  • Direct table/sequence privileges are revoked from anon & authenticated
--  • Clients can ONLY reach data through audited SECURITY DEFINER functions
-- This means even a stolen anon key cannot read room lists, player names in
-- bulk, tokens hashes, audit logs or settings. Realtime uses realtime.send
-- broadcasts (safe projections), not postgres_changes table streams.

alter table public.platform_settings enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_moves enable row level security;
alter table public.game_events enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limit_hits enable row level security;

revoke all on public.platform_settings,
              public.rooms,
              public.room_players,
              public.game_moves,
              public.game_events,
              public.admin_users,
              public.admin_sessions,
              public.audit_log,
              public.rate_limit_hits
from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

-- functions: drop default PUBLIC execute, then grant an explicit allow-list
revoke execute on all functions in schema public from public, anon, authenticated;

-- player surface
grant execute on function public.create_room(text) to anon;
grant execute on function public.join_room(text, text) to anon;
grant execute on function public.get_room_state(text, text, boolean) to anon;
grant execute on function public.make_move(text, text, integer) to anon;
grant execute on function public.request_rematch(text, text) to anon;
grant execute on function public.leave_room(text, text) to anon;
grant execute on function public.get_public_status() to anon;

-- admin surface (each function validates its own session token server-side)
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
