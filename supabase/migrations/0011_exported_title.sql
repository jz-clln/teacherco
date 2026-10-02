-- supabase/migrations/0011_exported_title.sql

-- Remembers which column of the teacher's workbook a checked or typed-in activity was
-- exported into, for example "Term 2 · Written Work 4".
-- Why: that column comes back on the next import. Without this record it would be read as
-- a new imported activity and the same scores would be counted twice.
-- Imported activities are the column itself, so they never need this.
-- Safe to run more than once.

alter table public.assessments
  add column if not exists exported_title text;

alter table public.assessments drop constraint if exists assessments_exported_title_check;
alter table public.assessments
  add constraint assessments_exported_title_check
  check (exported_title is null or source <> 'imported');

create index if not exists assessments_exported_title_idx
  on public.assessments (class_id, exported_title)
  where exported_title is not null;