-- TeacherCo teacher onboarding profile fields.

alter table public.profiles
  add column if not exists preferred_name text,
  add column if not exists school_type text,
  add column if not exists school_name text,
  add column if not exists grade_bands text[] not null default '{}'::text[],
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_school_type_check;

alter table public.profiles
  add constraint profiles_school_type_check
  check (school_type is null or school_type in ('public', 'private'));
