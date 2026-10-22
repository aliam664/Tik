-- DOZ ONLINE — 0021: Sheriff Blast least-privilege hardening.
--
-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default.
-- Migration 0020 created the round lifecycle helpers after the earlier global
-- lockdown migrations, so browser roles could otherwise call a helper that
-- returns the unrevealed server seed. Keep lifecycle/projection helpers
-- callable only from SECURITY DEFINER entrypoints.

revoke all on function public.crash_open_round() from public, anon, authenticated;
revoke all on function public.crash_advance_locked() from public, anon, authenticated;
revoke all on function public.crash_public_round(public.crash_rounds) from public, anon, authenticated;

-- Rebuild the browser allowlist explicitly rather than relying on PostgreSQL's
-- implicit PUBLIC privilege. crash_point_from_seed is intentionally public so
-- a completed round can be verified independently by the client.
revoke all on function public.crash_get_state(text) from public, anon, authenticated;
revoke all on function public.crash_point_from_seed(text, text) from public, anon, authenticated;
revoke all on function public.admin_crash_ops(text) from public, anon, authenticated;

grant execute on function public.crash_get_state(text) to anon, authenticated;
grant execute on function public.crash_point_from_seed(text, text) to anon, authenticated;
grant execute on function public.admin_crash_ops(text) to anon, authenticated;

notify pgrst, 'reload schema';
