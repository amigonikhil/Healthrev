-- ============================================================================
-- Phase 1 hardening — addresses Supabase security-advisor findings on 0001.
--   * 0011 function_search_path_mutable: pin search_path on set_updated_at.
--   * 0028/0029 security-definer functions callable via PostgREST RPC:
--     - Trigger functions (audit_write, handle_new_user) must never be RPC-
--       callable. Revoking EXECUTE is safe: Postgres does not check EXECUTE on
--       trigger functions during DML, so the triggers still fire.
--     - RLS helpers (is_admin, is_active_user) are locked to `authenticated`
--       only (removed from anon). `authenticated` MUST retain EXECUTE because
--       RLS policies call these on every query; this residual advisory warning
--       is expected and benign (a signed-in user only learns their own
--       admin/active status).
-- Supabase grants EXECUTE to anon+authenticated via default privileges, so we
-- revoke those roles explicitly (revoking from `public` alone is insufficient).
-- ============================================================================

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.audit_write() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
