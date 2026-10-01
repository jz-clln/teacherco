-- TeacherCo foundational schema
-- Teacher-only MVP. Every exposed table has RLS enabled.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  preferred_language text not null default 'en' check (preferred_language in ('en','fil')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  grade_level text not null,
  school_year text not null,
  benchmark numeric(5,2) not null default 75,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index classes_teacher_id_idx on public.classes(teacher_id);

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  external_ref text,
  first_name text,
  last_name text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learners_teacher_id_idx on public.learners(teacher_id);

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id, learner_id)
);
create index class_enrollments_class_id_idx on public.class_enrollments(class_id);
create index class_enrollments_learner_id_idx on public.class_enrollments(learner_id);

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  code text,
  description text,
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id, name)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  kind text not null default 'multiple_choice' check (kind in ('multiple_choice','true_false','short_answer','essay','mixed')),
  status text not null default 'draft' check (status in ('draft','active','closed')),
  assessment_date date,
  total_points numeric(8,2),
  answer_key jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessments_class_id_idx on public.assessments(class_id);

create table public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  item_number integer not null check (item_number > 0),
  item_type text not null default 'multiple_choice',
  prompt text,
  expected_answer jsonb,
  max_points numeric(8,2) not null default 1,
  created_at timestamptz not null default now(),
  unique(assessment_id, item_number)
);

create table public.assessment_competencies (
  assessment_item_id uuid not null references public.assessment_items(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  primary key (assessment_item_id, competency_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  score numeric(8,2),
  max_score numeric(8,2),
  review_status text not null default 'pending' check (review_status in ('pending','needs_review','confirmed')),
  source_image_path text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, learner_id)
);

create table public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  assessment_item_id uuid not null references public.assessment_items(id) on delete cascade,
  extracted_answer jsonb,
  extraction_confidence numeric(5,4),
  teacher_final_answer jsonb,
  is_correct boolean,
  points_awarded numeric(8,2),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id, assessment_item_id)
);

create table public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present','absent','late','excused')),
  source_record_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id, learner_id, attendance_date)
);

create table public.record_imports (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null,
  mime_type text,
  storage_path text,
  retention_mode text not null default 'keep' check (retention_mode in ('keep','delete_after_processing')),
  import_status text not null default 'uploaded' check (import_status in ('uploaded','parsing','needs_confirmation','imported','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.record_versions (
  id uuid primary key default gen_random_uuid(),
  record_import_id uuid not null references public.record_imports(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  normalized_snapshot jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique(record_import_id, version_number)
);

alter table public.attendance_entries
  add constraint attendance_source_record_version_fk
  foreign key (source_record_version_id) references public.record_versions(id) on delete set null;

create table public.teacher_notes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  learner_id uuid references public.learners(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attention_rules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  rule_type text not null,
  configuration jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attention_flags (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  rule_id uuid references public.attention_rules(id) on delete set null,
  source text not null check (source in ('rule','ai_observation')),
  reason jsonb not null,
  status text not null default 'active' check (status in ('active','dismissed','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  learner_id uuid references public.learners(id) on delete set null,
  report_type text not null check (report_type in ('class_performance','learner_progress')),
  evidence_snapshot jsonb not null,
  generated_content text,
  teacher_edited_content text,
  status text not null default 'draft' check (status in ('draft','final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger classes_updated_at before update on public.classes for each row execute function public.set_updated_at();
create trigger learners_updated_at before update on public.learners for each row execute function public.set_updated_at();
create trigger class_enrollments_updated_at before update on public.class_enrollments for each row execute function public.set_updated_at();
create trigger competencies_updated_at before update on public.competencies for each row execute function public.set_updated_at();
create trigger assessments_updated_at before update on public.assessments for each row execute function public.set_updated_at();
create trigger submissions_updated_at before update on public.submissions for each row execute function public.set_updated_at();
create trigger submission_answers_updated_at before update on public.submission_answers for each row execute function public.set_updated_at();
create trigger attendance_entries_updated_at before update on public.attendance_entries for each row execute function public.set_updated_at();
create trigger record_imports_updated_at before update on public.record_imports for each row execute function public.set_updated_at();
create trigger teacher_notes_updated_at before update on public.teacher_notes for each row execute function public.set_updated_at();
create trigger attention_rules_updated_at before update on public.attention_rules for each row execute function public.set_updated_at();
create trigger attention_flags_updated_at before update on public.attention_flags for each row execute function public.set_updated_at();
create trigger reports_updated_at before update on public.reports for each row execute function public.set_updated_at();

-- Create profile automatically for new auth users.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.learners enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.competencies enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_competencies enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.record_imports enable row level security;
alter table public.record_versions enable row level security;
alter table public.teacher_notes enable row level security;
alter table public.attention_rules enable row level security;
alter table public.attention_flags enable row level security;
alter table public.reports enable row level security;

create policy "profiles own row" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "classes own rows" on public.classes for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "learners own rows" on public.learners for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "enrollments through owned class" on public.class_enrollments for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  and exists (select 1 from public.learners l where l.id = learner_id and l.teacher_id = auth.uid()));

create policy "competencies through owned class" on public.competencies for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "assessments through owned class" on public.assessments for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "assessment items through owned assessment" on public.assessment_items for all
using (exists (select 1 from public.assessments a join public.classes c on c.id = a.class_id where a.id = assessment_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.assessments a join public.classes c on c.id = a.class_id where a.id = assessment_id and c.teacher_id = auth.uid()));

create policy "assessment competencies owned" on public.assessment_competencies for all
using (exists (select 1 from public.assessment_items ai join public.assessments a on a.id = ai.assessment_id join public.classes c on c.id = a.class_id where ai.id = assessment_item_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.assessment_items ai join public.assessments a on a.id = ai.assessment_id join public.classes c on c.id = a.class_id where ai.id = assessment_item_id and c.teacher_id = auth.uid()));

create policy "submissions through owned assessment" on public.submissions for all
using (exists (select 1 from public.assessments a join public.classes c on c.id = a.class_id where a.id = assessment_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.assessments a join public.classes c on c.id = a.class_id where a.id = assessment_id and c.teacher_id = auth.uid())
  and exists (select 1 from public.learners l where l.id = learner_id and l.teacher_id = auth.uid()));

create policy "submission answers owned" on public.submission_answers for all
using (exists (select 1 from public.submissions s join public.assessments a on a.id = s.assessment_id join public.classes c on c.id = a.class_id where s.id = submission_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.submissions s join public.assessments a on a.id = s.assessment_id join public.classes c on c.id = a.class_id where s.id = submission_id and c.teacher_id = auth.uid()));

create policy "attendance through owned class" on public.attendance_entries for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  and exists (select 1 from public.learners l where l.id = learner_id and l.teacher_id = auth.uid()));

create policy "record imports own rows" on public.record_imports for all
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "record versions through owned class" on public.record_versions for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "teacher notes own rows" on public.teacher_notes for all
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

create policy "attention rules through owned class" on public.attention_rules for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "attention flags through owned class" on public.attention_flags for all
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "reports own rows" on public.reports for all
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));
