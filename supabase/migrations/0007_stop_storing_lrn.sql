-- supabase/migrations/0007_stop_storing_lrn.sql

-- TeacherCo no longer stores the Learner Reference Number (LRN).
-- The LRN is only read in the teacher's browser while importing and exporting.
-- Safe to run more than once.
--
-- Deploy the app update first, then run this. The old code still selects external_ref.

-- 1. Wipe every stored LRN.
update public.learners set external_ref = null where external_ref is not null;

-- 2. Remove the column so an LRN can never be saved again.
alter table public.learners drop column if exists external_ref;