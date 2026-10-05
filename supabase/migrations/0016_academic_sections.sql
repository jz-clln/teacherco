-- Independent, teacher-owned advisory identity. Deliberately no backfill.
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name ~ '[^[:space:]]' and length(name) <= 120),
  grade_level text not null check (grade_level ~ '[^[:space:]]' and length(grade_level) <= 50),
  school_year text not null check (school_year ~ '[^[:space:]]' and length(school_year) <= 30),
  school_name text check (length(school_name) <= 160),
  school_id text check (length(school_id) <= 30),
  is_adviser boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);
create index sections_teacher_status_year_idx on public.sections(teacher_id, status, school_year);

alter table public.learners add constraint learners_id_teacher_key unique (id, teacher_id);
create table public.section_enrollments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  section_id uuid not null,
  learner_id uuid not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, learner_id),
  foreign key (section_id, teacher_id) references public.sections(id, teacher_id) on delete cascade,
  foreign key (learner_id, teacher_id) references public.learners(id, teacher_id)
    on delete no action deferrable initially deferred
);
create index section_enrollments_section_status_idx on public.section_enrollments(section_id, status);
create index section_enrollments_learner_idx on public.section_enrollments(learner_id);
create index section_enrollments_teacher_idx on public.section_enrollments(teacher_id);

alter table public.classes add column section_id uuid;
alter table public.classes add constraint classes_section_owner_fkey
  foreign key (section_id, teacher_id) references public.sections(id, teacher_id)
  on delete no action deferrable initially deferred;
create index classes_section_idx on public.classes(section_id) where section_id is not null;

create function public.section_context_value(value text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(coalesce(value, ''), '[[:space:]]+', ' ', 'g')))
$$;

create function public.section_context_matches(c_grade text, c_year text, c_school text,
  s_grade text, s_year text, s_school text) returns boolean
language sql immutable set search_path = '' as $$
  select public.section_context_value(c_grade) = public.section_context_value(s_grade)
    and public.section_context_value(c_year) = public.section_context_value(s_year)
    and (public.section_context_value(c_school) = '' or public.section_context_value(s_school) = ''
      or public.section_context_value(c_school) = public.section_context_value(s_school))
$$;

create function public.guard_section_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.teacher_id is distinct from old.teacher_id then
    raise exception 'Section ownership cannot be changed.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger sections_identity before update on public.sections
  for each row execute function public.guard_section_identity();

create function public.guard_section_enrollment_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.teacher_id, new.section_id, new.learner_id) is distinct from
     (old.teacher_id, old.section_id, old.learner_id) then
    raise exception 'Section enrollment identity cannot be changed. Update its status instead.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger section_enrollments_identity before update on public.section_enrollments
  for each row execute function public.guard_section_enrollment_identity();

-- Both directions serialize on the Section row. The deliberate no-op UPDATE
-- also creates a row version: under REPEATABLE READ a concurrent context edit
-- must retry rather than validating against an old snapshot. No class row locks
-- are acquired by the Section trigger (avoids reversing class -> Section order).
-- SECURITY DEFINER ensures integrity checks see all linked rows, even under RLS.
create function public.guard_class_section_context() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sections;
begin
  if new.section_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if (new.section_id, new.teacher_id, new.grade_level, new.school_year, new.school_id)
      is not distinct from (old.section_id, old.teacher_id, old.grade_level, old.school_year, old.school_id)
      then return new; end if;
  end if;
  update public.sections set id = id
    where id = new.section_id and teacher_id = new.teacher_id returning * into s;
  if not found then
    raise exception 'Section not found in this teacher workspace.' using errcode = '23503';
  end if;
  if not public.section_context_matches(new.grade_level, new.school_year, new.school_id,
    s.grade_level, s.school_year, s.school_id) then
    raise exception 'Class grade, school year or school ID conflicts with its linked Section.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger classes_section_context before insert or update of section_id, teacher_id, grade_level, school_year, school_id
  on public.classes for each row execute function public.guard_class_section_context();

create function public.guard_section_class_context() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.classes c where c.section_id = new.id
    and not public.section_context_matches(c.grade_level, c.school_year, c.school_id,
      new.grade_level, new.school_year, new.school_id)) then
    raise exception 'Section grade, school year or school ID conflicts with a linked class.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger sections_class_context before update of grade_level, school_year, school_id
  on public.sections for each row execute function public.guard_section_class_context();

create trigger sections_updated_at before update on public.sections
  for each row execute function public.set_updated_at();
create trigger section_enrollments_updated_at before update on public.section_enrollments
  for each row execute function public.set_updated_at();

alter table public.sections enable row level security;
alter table public.section_enrollments enable row level security;
create policy sections_owner on public.sections for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy sections_active_access on public.sections as restrictive for all to authenticated
  using ((select public.has_active_access())) with check ((select public.has_active_access()));
create policy section_enrollments_owner on public.section_enrollments for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy section_enrollments_active_access on public.section_enrollments as restrictive for all to authenticated
  using ((select public.has_active_access())) with check ((select public.has_active_access()));
revoke all on public.sections, public.section_enrollments from public, anon, authenticated;
grant select, insert, update, delete on public.sections to authenticated;
grant select, insert, update on public.section_enrollments to authenticated;
grant all on public.sections, public.section_enrollments to service_role;
revoke all on function public.guard_section_identity(), public.guard_section_enrollment_identity(),
  public.guard_class_section_context(), public.guard_section_class_context() from public, anon, authenticated;
revoke all on function public.section_context_value(text),
  public.section_context_matches(text,text,text,text,text,text) from public, anon, authenticated;
