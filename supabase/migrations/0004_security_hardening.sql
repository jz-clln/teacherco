-- TeacherCo security hardening.
-- Fixes Supabase linter warnings 0011, 0028 and 0029.
-- Safe to run more than once.

-- 1. Lock the search_path on the updated_at trigger function.
alter function public.set_updated_at() set search_path = '';

-- 2. handle_new_user should only fire from the auth.users trigger,
--    never through /rest/v1/rpc. Remove API access to it.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;