-- DOZ ONLINE — 0021: Sheriff Blast least-privilege hardening.
revoke all on function public.crash_open_round() from public, anon, authenticated;
revoke all on function public.crash_advance_locked() from public, anon, authenticated;
revoke all on function public.crash_public_round(public.crash_rounds) from public, anon, authenticated;
revoke all on function public.crash_get_state(text) from public, anon, authenticated;
revoke all on function public.crash_point_from_seed(text, text) from public, anon, authenticated;
revoke all on function public.admin_crash_ops(text) from public, anon, authenticated;
grant execute on function public.crash_get_state(text) to anon, authenticated;
grant execute on function public.crash_point_from_seed(text, text) to anon, authenticated;
grant execute on function public.admin_crash_ops(text) to anon, authenticated;
notify pgrst, 'reload schema';
