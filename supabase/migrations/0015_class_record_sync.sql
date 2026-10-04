-- Reviewed Excel sync: optimistic concurrency, atomic writes, immutable private history.
alter table public.classes add column sync_revision bigint not null default 0;

-- Every existing write path participates, including the original importer and manual edits.
-- Updating the class row serializes concurrent writes with apply_class_record_sync.
create function public.bump_class_sync_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old uuid; v_new uuid; v_id uuid; v_classes uuid[];
begin
  if tg_table_name = 'learners' then
    select array_agg(distinct e.class_id order by e.class_id) into v_classes from public.class_enrollments e
      where e.learner_id = coalesce(new.id, old.id);
  else
    if tg_table_name = 'submissions' then
      if tg_op <> 'INSERT' then select class_id into v_old from public.assessments where id = old.assessment_id; end if;
      if tg_op <> 'DELETE' then select class_id into v_new from public.assessments where id = new.assessment_id; end if;
    else
      if tg_op <> 'INSERT' then v_old := old.class_id; end if;
      if tg_op <> 'DELETE' then v_new := new.class_id; end if;
    end if;
    v_classes := array[v_old, v_new];
  end if;
  for v_id in select distinct x from unnest(v_classes) x where x is not null order by x loop
    -- One increment/lock per class per transaction, rather than per score cell.
    if position('|' || v_id::text || '|' in coalesce(current_setting('teacherco.sync_touched_classes', true), '')) = 0 then
      update public.classes set sync_revision = sync_revision + 1 where id = v_id;
      perform set_config('teacherco.sync_touched_classes', coalesce(current_setting('teacherco.sync_touched_classes', true), '') || '|' || v_id::text || '|', true);
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
revoke all on function public.bump_class_sync_revision() from public;
do $$ declare t text; begin
  foreach t in array array['learners','class_enrollments','assessments','submissions','teacher_term_grades','attendance_entries','class_grading_config'] loop
    execute format('create trigger sync_revision before insert or update or delete on public.%I for each row execute function public.bump_class_sync_revision()', t);
  end loop;
end $$;

-- One statement gives a consistent snapshot. Invoker RLS and the class guard protect reads.
create function public.class_record_snapshot(p_class_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision', c.sync_revision,
    'learners', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'first_name', l.first_name, 'last_name', l.last_name, 'status', e.status) order by l.id) from public.class_enrollments e join public.learners l on l.id=e.learner_id where e.class_id=c.id), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'activity_slot', a.activity_slot, 'exported_title', a.exported_title, 'source', a.source, 'total_points', a.total_points, 'term', a.term, 'component', a.component) order by a.id) from public.assessments a where a.class_id=c.id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object('assessment_id', s.assessment_id, 'learner_id', s.learner_id, 'score', s.score, 'max_score', s.max_score) order by s.id) from public.submissions s join public.assessments a on a.id=s.assessment_id where a.class_id=c.id), '[]'::jsonb),
    'grades', coalesce((select jsonb_agg(jsonb_build_object('learner_id', g.learner_id, 'term', g.term, 'initial_grade', g.initial_grade, 'term_grade', g.term_grade, 'descriptor', g.descriptor) order by g.id) from public.teacher_term_grades g where g.class_id=c.id), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('learner_id', a.learner_id, 'attendance_date', a.attendance_date, 'status', a.status) order by a.id) from public.attendance_entries a where a.class_id=c.id), '[]'::jsonb),
    'config', (select to_jsonb(g) from public.class_grading_config g where g.class_id=c.id)
  ) from public.classes c where c.id=p_class_id;
$$;
revoke all on function public.class_record_snapshot(uuid) from public, anon;
grant execute on function public.class_record_snapshot(uuid) to authenticated, service_role;

create table public.class_record_sync_versions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  version_number integer not null check (version_number > 0),
  filename text not null,
  changes jsonb not null,
  change_count integer generated always as (jsonb_array_length(changes)) stored,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  uploaded_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(class_id, request_id), unique(class_id, version_number)
);
alter table public.class_record_sync_versions enable row level security;
create policy "active owner reads record sync history" on public.class_record_sync_versions for select to authenticated
using (teacher_id = auth.uid() and public.has_active_access() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid()));
revoke all on public.class_record_sync_versions from anon, authenticated;
grant select on public.class_record_sync_versions to authenticated;
grant all on public.class_record_sync_versions to service_role;

-- Only the authenticated server action may call this with its freshly computed plan.
-- No client-provided operation lists reach this RPC through the action.
create function public.apply_class_record_sync(p_teacher_id uuid, p_class_id uuid, p_request_id uuid, p_revision bigint, p_input jsonb, p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_revision bigint; v_version integer; v_existing jsonb; v_before jsonb; v_after jsonb;
  v_lmap jsonb := '{}'::jsonb; v_amap jsonb := '{}'::jsonb;
  r jsonb; v_id uuid;
begin
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_teacher_id and p.access_status='active' and u.email_confirmed_at is not null) then
    raise exception 'Active access required' using errcode='42501';
  end if;
  select sync_revision into v_revision from public.classes where id=p_class_id and teacher_id=p_teacher_id for update;
  if not found then raise exception 'Class not found' using errcode='42501'; end if;
  select jsonb_build_object('id', id, 'version', version_number) into v_existing from public.class_record_sync_versions where class_id=p_class_id and request_id=p_request_id;
  if v_existing is not null then return v_existing; end if;
  if v_revision <> p_revision then raise exception 'The class changed. Compare the workbook again before applying.' using errcode='40001'; end if;
  if jsonb_typeof(p_input) <> 'object' or jsonb_typeof(p_plan->'changes') <> 'array' then raise exception 'Invalid sync plan'; end if;
  v_before := public.class_record_snapshot(p_class_id);
  for r in select value from jsonb_array_elements(p_plan->'learners') loop
    v_id := (r->>'id')::uuid;
    if v_id is null then
      insert into public.learners(teacher_id,first_name,last_name,display_name) values(p_teacher_id,r->>'first_name',r->>'last_name',concat(r->>'first_name',' ',r->>'last_name')) returning id into v_id;
      insert into public.class_enrollments(class_id,learner_id) values(p_class_id,v_id);
    elsif not exists(select 1 from public.class_enrollments e join public.learners l on l.id=e.learner_id where e.class_id=p_class_id and e.learner_id=v_id and e.status='active' and l.teacher_id=p_teacher_id) then raise exception 'Learner not enrolled' using errcode='42501'; end if;
    v_lmap := v_lmap || jsonb_build_object(r->>'key',v_id);
  end loop;
  for r in select value from jsonb_array_elements(p_plan->'activities') loop
    v_id := (r->>'id')::uuid;
    if (r->>'total')::numeric <= 0 or (r->>'term')::integer not between 1 and 3 then raise exception 'Invalid activity'; end if;
    if v_id is null then
      insert into public.assessments(class_id,title,activity_slot,term,component,kind,status,source,total_points)
      values(p_class_id,r->>'title',r->>'title',(r->>'term')::smallint,r->>'component','mixed','closed','imported',(r->>'total')::numeric) returning id into v_id;
    else
      if not exists(select 1 from public.assessments where id=v_id and class_id=p_class_id and source='imported' and exported_title is null) then raise exception 'Activity is protected' using errcode='42501'; end if;
      update public.assessments set total_points=(r->>'total')::numeric where id=v_id and total_points is distinct from (r->>'total')::numeric;
    end if;
    v_amap := v_amap || jsonb_build_object(r->>'key',v_id);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_plan->'scores') s where (s->>'score')::numeric < 0 or (s->>'score')::numeric > (s->>'max')::numeric or (s->>'max')::numeric <= 0) then raise exception 'Invalid score'; end if;
  insert into public.submissions(assessment_id,learner_id,score,max_score,review_status,confirmed_at)
  select (v_amap->>(s->>'activity'))::uuid,(v_lmap->>(s->>'learner'))::uuid,(s->>'score')::numeric,(s->>'max')::numeric,'confirmed',now() from jsonb_array_elements(p_plan->'scores') s
  on conflict(assessment_id,learner_id) do update set score=excluded.score,max_score=excluded.max_score,review_status='confirmed',confirmed_at=now();
  if exists(select 1 from jsonb_array_elements(p_plan->'grades') g where (g->>'term')::integer not between 1 and 3) then raise exception 'Invalid term grade'; end if;
  insert into public.teacher_term_grades(class_id,learner_id,term,initial_grade,term_grade,descriptor,source_sheet)
  select p_class_id,(v_lmap->>(g->>'learner'))::uuid,(g->>'term')::smallint,(g->>'initial_grade')::numeric,(g->>'term_grade')::numeric,g->>'descriptor',concat('Term ',g->>'term') from jsonb_array_elements(p_plan->'grades') g
  on conflict(class_id,learner_id,term) do update set initial_grade=excluded.initial_grade,term_grade=excluded.term_grade,descriptor=excluded.descriptor,source_sheet=excluded.source_sheet,imported_at=now();
  insert into public.attendance_entries(class_id,learner_id,attendance_date,status)
  select p_class_id,(v_lmap->>(a->>'learner'))::uuid,(a->>'date')::date,a->>'status' from jsonb_array_elements(p_plan->'attendance') a
  on conflict(class_id,learner_id,attendance_date) do update set status=excluded.status;
  -- Only apply the HPS adjustment explicitly shown in the review. Preserve grading rules.
  if jsonb_typeof(p_plan->'termPossible') = 'object' then
    update public.class_grading_config set term_possible=p_plan->'termPossible',verified=false where class_id=p_class_id;
  end if;
  v_after := public.class_record_snapshot(p_class_id);
  select coalesce(max(version_number),0)+1 into v_version from public.class_record_sync_versions where class_id=p_class_id;
  insert into public.class_record_sync_versions(class_id,teacher_id,request_id,version_number,filename,changes,before_snapshot,after_snapshot,uploaded_snapshot)
  values(p_class_id,p_teacher_id,p_request_id,v_version,p_input->>'filename',p_plan->'changes',v_before,v_after,p_input) returning id into v_id;
  return jsonb_build_object('id',v_id,'version',v_version);
end; $$;
revoke all on function public.apply_class_record_sync(uuid,uuid,uuid,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_class_record_sync(uuid,uuid,uuid,bigint,jsonb,jsonb) to service_role;
