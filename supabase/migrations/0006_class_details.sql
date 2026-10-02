-- TeacherCo class details (read from the teacher's class record, editable in the app).
-- Safe to run more than once.

alter table public.classes
  add column if not exists school_name text,
  add column if not exists school_id text,
  add column if not exists adviser text,
  add column if not exists section text;