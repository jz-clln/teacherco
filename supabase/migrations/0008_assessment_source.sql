-- supabase/migrations/0008_assessment_source.sql

-- Records where each assessment's scores come from, so the app knows what a teacher may edit.
--   checked  = scored from an answer sheet on the Check screen (has per-question answers)
--   imported = read from the teacher's Excel class record
--   manual   = typed in by the teacher (for example oral recitations)
-- Safe to run more than once.
--
-- Run this BEFORE deploying the app update. New rows default to 'checked',
-- which is what the Check screen creates. Imports and manual activities set it themselves.

alter table public.assessments
  add column if not exists source text;

-- Label what already exists. Anything with answer-key items came from the Check screen.
update public.assessments a
set source = case
  when exists (select 1 from public.assessment_items ai where ai.assessment_id = a.id) then 'checked'
  else 'imported'
end
where a.source is null;

alter table public.assessments alter column source set default 'checked';
alter table public.assessments alter column source set not null;

alter table public.assessments drop constraint if exists assessments_source_check;
alter table public.assessments
  add constraint assessments_source_check check (source in ('checked', 'imported', 'manual'));