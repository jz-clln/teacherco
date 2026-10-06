-- Reviewed Section values, independent of class records and report-card layouts.
create table public.section_grade_periods (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  section_id uuid not null,
  key text not null check (key ~ '^period_[a-zA-Z0-9_-]+$' and length(key) <= 80),
  label text not null check (label ~ '[^[:space:]]' and length(label) <= 60),
  position smallint not null check (position between 1 and 8),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, section_id, teacher_id), unique (section_id, key),
  unique (section_id, position) deferrable initially deferred,
  foreign key (section_id, teacher_id) references public.sections(id,teacher_id) on delete cascade
);
create table public.section_subjects (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null, section_id uuid not null,
  name text not null check (name ~ '[^[:space:]]' and length(name) <= 120),
  code text check (length(code) <= 40), category text check (length(category) <= 80),
  position integer not null check (position > 0),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, section_id, teacher_id),
  unique (section_id, position) deferrable initially deferred,
  foreign key (section_id, teacher_id) references public.sections(id,teacher_id) on delete cascade
);
alter table public.section_enrollments add constraint section_enrollments_owner_cell_key unique(section_id,learner_id,teacher_id);
alter table public.classes add constraint classes_gradebook_owner_key unique(id,teacher_id);
create table public.section_grade_entries (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null, section_id uuid not null,
  learner_id uuid not null, section_subject_id uuid not null, period_id uuid not null,
  grade numeric check (grade between 0 and 100),
  source_type text not null check (source_type in ('manual','teacherco_class','external_import')),
  source_class_id uuid, source_reference text check (length(source_reference) <= 240),
  source_snapshot jsonb check (source_snapshot is null or (jsonb_typeof(source_snapshot) = 'object' and octet_length(source_snapshot::text) <= 1024)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(section_id,learner_id,section_subject_id,period_id),
  foreign key(section_id,teacher_id) references public.sections(id,teacher_id) on delete cascade,
  foreign key(section_id,learner_id,teacher_id) references public.section_enrollments(section_id,learner_id,teacher_id) deferrable initially deferred,
  foreign key(section_subject_id,section_id,teacher_id) references public.section_subjects(id,section_id,teacher_id) deferrable initially deferred,
  foreign key(period_id,section_id,teacher_id) references public.section_grade_periods(id,section_id,teacher_id) deferrable initially deferred,
  foreign key(source_class_id,teacher_id) references public.classes(id,teacher_id) on delete set null (source_class_id)
);
create index section_grades_subject_period_idx on public.section_grade_entries(section_id,section_subject_id,period_id);
create index section_grades_learner_idx on public.section_grade_entries(learner_id);
create index section_grades_source_idx on public.section_grade_entries(source_class_id) where source_class_id is not null;

-- Invariant checks apply to direct authenticated writes as well as atomic RPCs.
create function public.guard_section_gradebook() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.id,new.teacher_id,new.section_id) is distinct from (old.id,old.teacher_id,old.section_id) then
      raise exception 'Grade Book identity cannot change.' using errcode='23514';
    end if;
    if tg_table_name = 'section_grade_periods' and to_jsonb(new)->>'key' is distinct from to_jsonb(old)->>'key' then
      raise exception 'Period keys are stable.' using errcode='23514';
    end if;
    -- Referential SET NULL must preserve history, including archived Sections.
    if tg_table_name = 'section_grade_entries' then
      if pg_trigger_depth() > 1 and new.source_class_id is null and old.source_class_id is not null
        and (to_jsonb(new)-'source_class_id'-'updated_at') = (to_jsonb(old)-'source_class_id'-'updated_at') then return new; end if;
    end if;
  end if;
  perform 1 from public.sections where id=new.section_id and teacher_id=new.teacher_id and status='active' for share;
  if not found then raise exception 'Reactivate the Section before editing its Grade Book.' using errcode='23514'; end if;
  if tg_table_name = 'section_grade_entries' then
    if tg_op='UPDATE' and (new.learner_id,new.section_subject_id,new.period_id) is distinct from (old.learner_id,old.section_subject_id,old.period_id) then
      raise exception 'Grade cell identity cannot change.' using errcode='23514'; end if;
    perform 1 from public.section_enrollments where section_id=new.section_id and teacher_id=new.teacher_id and learner_id=new.learner_id and status='active' for share;
    if not found then raise exception 'Choose an active Section learner.' using errcode='23514'; end if;
    perform 1 from public.section_subjects where id=new.section_subject_id and section_id=new.section_id and teacher_id=new.teacher_id and status='active' for share;
    if not found then raise exception 'Choose an active Section subject.' using errcode='23514'; end if;
    perform 1 from public.section_grade_periods where id=new.period_id and section_id=new.section_id and teacher_id=new.teacher_id and status='active' for share;
    if not found then raise exception 'Choose an active grading period.' using errcode='23514'; end if;
    if new.source_type='manual' then
      new.source_class_id:=null; new.source_reference:=null; new.source_snapshot:=null;
    elsif new.source_type='teacherco_class' then
      perform 1 from public.classes where id=new.source_class_id and teacher_id=new.teacher_id and section_id=new.section_id for share;
      if not found then raise exception 'Choose a linked class in this Section.' using errcode='23514'; end if;
      if new.source_snapshot is null or new.source_reference is null
        or new.source_snapshot - array['term','calculation','original_grade','sync_revision'] <> '{}'::jsonb then
        raise exception 'Invalid class provenance.' using errcode='23514'; end if;
    end if;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['section_grade_periods','section_subjects','section_grade_entries'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy gradebook_owner on public.%I for all to authenticated using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()))',t);
    execute format('create policy gradebook_access on public.%I as restrictive for all to authenticated using ((select public.has_active_access())) with check ((select public.has_active_access()))',t);
    execute format('create policy gradebook_editable on public.%I as restrictive for delete to authenticated using (exists(select 1 from public.sections s where s.id=%I.section_id and s.teacher_id=%I.teacher_id and s.status=''active''))',t,t,t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create trigger gradebook_guard before insert or update on public.%I for each row execute function public.guard_section_gradebook()',t);
    execute format('create trigger gradebook_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
end $$;
grant delete on public.section_grade_periods,public.section_subjects to authenticated;
revoke all on function public.guard_section_gradebook() from public,anon,authenticated;

-- All configuration changes serialize on the Section; expected versions prevent stale edits.
create function public.save_section_gradebook_setup(p_section uuid,p_periods jsonb,p_subjects jsonb,p_expected jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare r record; x jsonb;
begin
  if auth.uid() is null or not public.has_active_access() then raise exception 'Active access required.'; end if;
  perform 1 from public.sections where id=p_section and teacher_id=auth.uid() and status='active' for update;
  if not found then raise exception 'Active owned Section required.'; end if;
  if jsonb_typeof(p_periods) is distinct from 'array' or jsonb_array_length(p_periods) not between 1 and 8
    or jsonb_typeof(p_subjects) is distinct from 'array' or jsonb_array_length(p_subjects)>100
    or jsonb_typeof(p_expected) is distinct from 'array' then raise exception 'Invalid Grade Book configuration.'; end if;
  for r in select id,updated_at from public.section_grade_periods where section_id=p_section
    union all select id,updated_at from public.section_subjects where section_id=p_section loop
    if not exists(select 1 from jsonb_array_elements(p_expected) e where (e->>'id')::uuid=r.id and (e->>'updated_at')::timestamptz=r.updated_at) then
      raise exception 'Grade Book setup changed. Refresh before saving.'; end if;
  end loop;
  if jsonb_array_length(p_expected) <> (select count(*) from public.section_grade_periods where section_id=p_section)+(select count(*) from public.section_subjects where section_id=p_section) then
    raise exception 'Grade Book setup changed. Refresh before saving.'; end if;
  delete from public.section_grade_periods where section_id=p_section and id not in(select (e->>'id')::uuid from jsonb_array_elements(p_periods)e);
  delete from public.section_subjects where section_id=p_section and id not in(select (e->>'id')::uuid from jsonb_array_elements(p_subjects)e);
  for x in select * from jsonb_array_elements(p_periods) loop
    insert into public.section_grade_periods(id,teacher_id,section_id,key,label,position,status)
    values((x->>'id')::uuid,auth.uid(),p_section,x->>'key',x->>'label',(x->>'position')::smallint,x->>'status')
    on conflict(id) do update set label=excluded.label,position=excluded.position,status=excluded.status
    where section_grade_periods.section_id=p_section and section_grade_periods.teacher_id=auth.uid();
    if not found then raise exception 'Invalid period identity.'; end if;
  end loop;
  for x in select * from jsonb_array_elements(p_subjects) loop
    insert into public.section_subjects(id,teacher_id,section_id,name,code,category,position,status)
    values((x->>'id')::uuid,auth.uid(),p_section,x->>'name',x->>'code',x->>'category',(x->>'position')::int,x->>'status')
    on conflict(id) do update set name=excluded.name,code=excluded.code,category=excluded.category,position=excluded.position,status=excluded.status
    where section_subjects.section_id=p_section and section_subjects.teacher_id=auth.uid();
    if not found then raise exception 'Invalid subject identity.'; end if;
  end loop;
end $$;

-- One transaction for all cells. Expected timestamps stop another tab overwriting review.
-- Copy operations additionally verify the class revision and linkage under a lock.
create function public.save_section_grades(p_section uuid,p_subject uuid,p_period uuid,p_rows jsonb,
  p_class uuid default null,p_revision bigint default null,p_term integer default null,p_calculation text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare x jsonb; previous public.section_grade_entries; c public.classes; value numeric;
begin
  if auth.uid() is null or not public.has_active_access() then raise exception 'Active access required.'; end if;
  if p_class is not null then
    select * into c from public.classes where id=p_class and teacher_id=auth.uid() and section_id=p_section for share;
    if not found or c.sync_revision is distinct from p_revision then raise exception 'Source class changed. Review a fresh preview.'; end if;
    if p_term not between 1 and 3 or p_term is null or p_calculation is null or p_calculation not in ('printed','calculated') then raise exception 'Choose a class grade source.'; end if;
  end if;
  perform 1 from public.sections where id=p_section and teacher_id=auth.uid() and status='active' for update;
  if not found then raise exception 'Active owned Section required.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Choose 1 to 500 changes.'; end if;
  if (select count(distinct e->>'learner_id') from jsonb_array_elements(p_rows)e)<>jsonb_array_length(p_rows) then raise exception 'Duplicate learner.'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    select * into previous from public.section_grade_entries where section_id=p_section and section_subject_id=p_subject and period_id=p_period and learner_id=(x->>'learner_id')::uuid for update;
    if previous.updated_at is distinct from (x->>'expected_updated_at')::timestamptz then raise exception 'A reviewed grade changed. Refresh before saving.'; end if;
    value:=(x->>'grade')::numeric;
    if p_class is not null then
      if value is null then raise exception 'Missing class grades cannot erase reviewed values.'; end if;
      perform 1 from public.class_enrollments where class_id=p_class and learner_id=(x->>'learner_id')::uuid and status='active' for share;
      if not found then raise exception 'Learner is not active in the source class.'; end if;
      if previous.source_type='manual' and previous.grade is distinct from value and coalesce((x->>'replace_manual')::boolean,false)=false then raise exception 'Explicitly confirm replacing this manual value.'; end if;
    end if;
    if previous.id is not null and previous.grade is not distinct from value then continue; end if;
    if previous.id is null and value is null then continue; end if;
    insert into public.section_grade_entries(teacher_id,section_id,learner_id,section_subject_id,period_id,grade,source_type,source_class_id,source_reference,source_snapshot)
    values(auth.uid(),p_section,(x->>'learner_id')::uuid,p_subject,p_period,value,
      case when p_class is null then 'manual' else 'teacherco_class' end,p_class,
      case when p_class is null then null else left(c.subject||' - '||c.name,240) end,
      case when p_class is null then null else jsonb_build_object('term',p_term,'calculation',p_calculation,'original_grade',value,'sync_revision',p_revision) end)
    on conflict(section_id,learner_id,section_subject_id,period_id) do update set grade=excluded.grade,source_type=excluded.source_type,
      source_class_id=excluded.source_class_id,source_reference=excluded.source_reference,source_snapshot=excluded.source_snapshot;
  end loop;
end $$;
revoke all on function public.save_section_gradebook_setup(uuid,jsonb,jsonb,jsonb),public.save_section_grades(uuid,uuid,uuid,jsonb,uuid,bigint,integer,text) from public,anon;
grant execute on function public.save_section_gradebook_setup(uuid,jsonb,jsonb,jsonb),public.save_section_grades(uuid,uuid,uuid,jsonb,uuid,bigint,integer,text) to authenticated;
