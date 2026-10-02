-- TeacherCo DepEd-style grading.
--  1. Assessments get a term and a component (written work / performance task / assessment).
--  2. Each class keeps the grading rules read from the teacher's class record.
--  3. The term grades printed in that record are kept, so TeacherCo can compare its own.
-- Safe to run more than once.

alter table public.assessments
  add column if not exists term smallint,
  add column if not exists component text;

alter table public.assessments drop constraint if exists assessments_term_check;
alter table public.assessments
  add constraint assessments_term_check check (term is null or term between 1 and 4);

alter table public.assessments drop constraint if exists assessments_component_check;
alter table public.assessments
  add constraint assessments_component_check
  check (component is null or component in ('written_work', 'performance_task', 'assessment'));

create index if not exists assessments_class_term_idx on public.assessments(class_id, term);

-- Fill in rows the grade import created earlier ("Term 2 · Written Work 1").
update public.assessments
set term = substring(title from '^(?:Term|Quarter)\s+([1-4])(?:\s|$)')::smallint
where term is null and title ~ '^(Term|Quarter)\s+[1-4](\s|$)';

update public.assessments
set component = case
  when title ~* 'written|oral' then 'written_work'
  when title ~* 'performance|product' then 'performance_task'
  when title ~* 'summative|term exam|quarterly' then 'assessment'
end
where component is null and term is not null;

-- Grading rules read from the class record (weights, transmutation table, descriptors).
create table if not exists public.class_grading_config (
  class_id uuid primary key references public.classes(id) on delete cascade,
  weights jsonb not null,
  transmutation jsonb not null,
  descriptors jsonb not null,
  -- Highest possible score per component as printed in each term sheet: {"1": {"written_work": 20, ...}}
  term_possible jsonb not null default '{}'::jsonb,
  source_filename text,
  -- true when the table reproduced every term grade printed in the record.
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The teacher's own term grades, exactly as printed in the class record.
create table if not exists public.teacher_term_grades (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  term smallint not null check (term between 1 and 4),
  initial_grade numeric(6,2),
  term_grade numeric(5,2),
  descriptor text,
  source_sheet text,
  imported_at timestamptz not null default now(),
  unique (class_id, learner_id, term)
);
create index if not exists teacher_term_grades_class_term_idx on public.teacher_term_grades(class_id, term);
create index if not exists teacher_term_grades_learner_id_idx on public.teacher_term_grades(learner_id);

drop trigger if exists class_grading_config_updated_at on public.class_grading_config;
create trigger class_grading_config_updated_at
before update on public.class_grading_config
for each row execute function public.set_updated_at();

alter table public.class_grading_config enable row level security;
alter table public.teacher_term_grades enable row level security;

drop policy if exists "grading config through owned class" on public.class_grading_config;
create policy "grading config through owned class" on public.class_grading_config for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

drop policy if exists "teacher term grades through owned class" on public.teacher_term_grades;
create policy "teacher term grades through owned class" on public.teacher_term_grades for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (
  exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  and exists (select 1 from public.learners l where l.id = learner_id and l.teacher_id = auth.uid())
);