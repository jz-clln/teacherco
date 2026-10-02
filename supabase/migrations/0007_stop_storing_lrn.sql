-- supabase/migrations/0007_stop_storing_lrn.sql

-- TeacherCo no longer stores the Learner Reference Number (LRN).
-- The LRN is only read in the teacher's browser while importing and exporting.
-- Safe to run more than once.
--
-- Deploy the app update first, then run this. The old code still selects external_ref.

-- 1 + 2. Wipe every stored LRN, then remove the column so an LRN can never be saved again.
-- The column check makes a second run do nothing instead of failing.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'learners'
      and column_name = 'external_ref'
  ) then
    update public.learners set external_ref = null where external_ref is not null;
    alter table public.learners drop column external_ref;
  end if;
end;
$$;