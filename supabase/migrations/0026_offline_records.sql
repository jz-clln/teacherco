-- Receipts make retrying after a lost response safe, including subsequent edits.
create table public.offline_sync_receipts (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null, table_name text not null, record_id uuid not null, created_at timestamptz not null default now(),
  primary key(teacher_id,operation_id)
);
alter table public.offline_sync_receipts enable row level security;
create policy offline_receipt_owner on public.offline_sync_receipts for all to authenticated
  using(teacher_id=(select auth.uid()) and (select public.has_active_access()))
  with check(teacher_id=(select auth.uid()) and (select public.has_active_access()));
revoke all on public.offline_sync_receipts from public,anon,authenticated;
grant select,insert on public.offline_sync_receipts to authenticated;
grant all on public.offline_sync_receipts to service_role;

create function public.sync_offline_record(p_operation uuid,p_table text,p_row jsonb,p_before jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  allowed jsonb := '{
    "classes":["id","teacher_id","name","subject","grade_level","school_year","status"],
    "learners":["id","teacher_id","first_name","last_name","display_name"],
    "class_enrollments":["id","class_id","learner_id","status"],
    "assessments":["id","class_id","title","activity_slot","term","component","total_points","source","status"],
    "submissions":["id","assessment_id","learner_id","score","max_score","review_status"],
    "sections":["id","teacher_id","name","grade_level","school_year","status"],
    "section_enrollments":["id","teacher_id","section_id","learner_id","status"],
    "section_subjects":["id","teacher_id","section_id","name","position","status"],
    "section_grade_periods":["id","teacher_id","section_id","key","label","position","status"],
    "section_grade_entries":["id","teacher_id","section_id","learner_id","section_subject_id","period_id","grade","source_type"]
  }';
  columns text[]; names text; assignments text; current_row jsonb; projected jsonb; answer jsonb; parent_class uuid; current_source text; activity_total numeric; receipt_table text; receipt_record uuid; slots jsonb; slot_title text;
begin
  if auth.uid() is null or not public.has_active_access() then raise exception 'Sign in with an active account.' using errcode='42501'; end if;
  if not (allowed ? p_table) or jsonb_typeof(p_row) <> 'object' or octet_length(p_row::text)>64000 then raise exception 'Invalid offline change.'; end if;
  select array_agg(value) into columns from jsonb_array_elements_text(allowed->p_table);
  if p_row - columns <> '{}'::jsonb or not (p_row ?& columns) then raise exception 'Invalid offline fields.'; end if;
  if p_row ? 'teacher_id' and (p_row->>'teacher_id')::uuid is distinct from auth.uid() then raise exception 'Wrong owner.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_operation::text,0));
  select table_name,record_id into receipt_table,receipt_record from public.offline_sync_receipts where teacher_id=auth.uid() and operation_id=p_operation;
  if found then
    if receipt_table<>p_table or receipt_record<>(p_row->>'id')::uuid then raise exception 'Operation identity cannot change.'; end if;
    -- Keep only opaque receipt identifiers, never a second copy of learner data.
    -- A retry after deletion acknowledges the original save without recreating it.
    execute format('select to_jsonb(t) from public.%I t where id=$1',p_table) into current_row using receipt_record;
    return jsonb_build_object('ok',true,'row',current_row);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table||(p_row->>'id'),0));
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_table) into current_row using (p_row->>'id')::uuid;
  if current_row is not null then
    select jsonb_object_agg(k,current_row->k) into projected from unnest(columns) k;
  end if;
  if projected is distinct from p_before then return jsonb_build_object('ok',false,'error','This record changed online. Review both versions.','current',current_row); end if;
  -- Relationships cannot be reassigned by an offline edit.
  if current_row is not null and exists(select 1 from unnest(array['class_id','learner_id','assessment_id','section_id','section_subject_id','period_id','teacher_id']) k where p_row ? k and p_row->k is distinct from current_row->k) then raise exception 'Record identity cannot change.'; end if;
  if p_table in ('class_enrollments','assessments') then parent_class:=(p_row->>'class_id')::uuid; end if;
  if p_table='submissions' then
    select class_id,source,total_points into parent_class,current_source,activity_total from public.assessments where id=(p_row->>'assessment_id')::uuid for share;
    if parent_class is null or current_source<>'manual' then return jsonb_build_object('ok',false,'error','Imported and checked scores are view only in the offline workspace.','current',current_row); end if;
    if activity_total is null or activity_total<=0 or (p_row->>'max_score')::numeric is distinct from activity_total or (p_row->>'score')::numeric<0 or (p_row->>'score')::numeric>activity_total or p_row->>'review_status'<>'confirmed' then return jsonb_build_object('ok',false,'error','The activity maximum changed. Keep the online version and refresh before entering scores.','current',current_row); end if;
    if not exists(select 1 from public.class_enrollments where class_id=parent_class and learner_id=(p_row->>'learner_id')::uuid and status='active') then raise exception 'Choose an enrolled learner.'; end if;
  end if;
  if parent_class is not null and not exists(select 1 from public.classes where id=parent_class and teacher_id=auth.uid() and status='active') then raise exception 'Choose an active owned class.' using errcode='42501'; end if;
  if p_table in ('class_enrollments','submissions') and not exists(select 1 from public.learners where id=(p_row->>'learner_id')::uuid and teacher_id=auth.uid()) then raise exception 'Choose an owned learner.' using errcode='42501'; end if;
  if p_table='assessments' and (p_row->>'source'<>'manual' or (current_row is not null and current_row->>'source'<>'manual')) then return jsonb_build_object('ok',false,'error','Only manual activities can be edited offline.','current',current_row); end if;
  if p_table='assessments' and (current_row is null or p_row->'activity_slot' is distinct from current_row->'activity_slot') then
    slot_title:=p_row->>'activity_slot';
    select activity_slots into slots from public.class_grading_config where class_id=parent_class;
    if jsonb_typeof(slots)='array' and jsonb_array_length(slots)>0 then
      if not exists(select 1 from jsonb_array_elements(slots) s where s->>'title'=slot_title and s->'term'=p_row->'term' and s->'component'=p_row->'component') then
        return jsonb_build_object('ok',false,'error','The class record activities changed online. Refresh before adding this activity.','current',current_row);
      end if;
    elsif slot_title is null or slot_title !~ '^Term [1-3] · (Written Work [1-5]|Performance Task [1-3]|Summative Test [12]|Term Exam)$'
      or substring(slot_title from '^Term ([1-3])')::integer is distinct from (p_row->>'term')::integer
      or p_row->>'component' is distinct from (case when slot_title like '%Written Work%' then 'written_work' when slot_title like '%Performance Task%' then 'performance_task' else 'assessment' end) then
      return jsonb_build_object('ok',false,'error','Choose an available class record activity.','current',current_row);
    end if;
  end if;
  if p_table='assessments' and ((p_row->>'total_points')::numeric is null or (p_row->>'total_points')::numeric<=0 or (p_row->>'total_points')::numeric>10000) then raise exception 'Invalid maximum score.'; end if;
  if p_table='assessments' and current_row is not null and p_row->'total_points' is distinct from current_row->'total_points' and exists(select 1 from public.submissions where assessment_id=(p_row->>'id')::uuid) then return jsonb_build_object('ok',false,'error','Keep the original maximum for an activity with saved scores.','current',current_row); end if;
  if p_table='section_grade_entries' and p_row->>'source_type'<>'manual' then raise exception 'Offline grades must be manual.'; end if;
  select string_agg(format('%I',c),','),string_agg(format('%I=v.%I',c,c),',') into names,assignments from unnest(columns) c;
  begin
    if p_table='submissions' then perform set_config('teacherco.write_path','manual',true); end if;
    if current_row is null then
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',p_table,names,names,p_table,p_table) into current_row using p_row;
    else
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) v where t.id=v.id returning to_jsonb(t.*)',p_table,assignments,p_table) into current_row using p_row;
    end if;
    if p_table='submissions' then
      update public.submissions set confirmed_at=now() where id=(p_row->>'id')::uuid;
      perform set_config('teacherco.write_path','',true);
    end if;
  exception when unique_violation or check_violation or foreign_key_violation then
    return jsonb_build_object('ok',false,'error','The online record or its related records changed. Keep the online version, refresh, then reapply this edit.','current',current_row);
  end;
  if current_row is null then raise exception 'Record is not available.' using errcode='42501'; end if;
  answer:=jsonb_build_object('ok',true,'row',current_row);
  insert into public.offline_sync_receipts(teacher_id,operation_id,table_name,record_id) values(auth.uid(),p_operation,p_table,(p_row->>'id')::uuid);
  return answer;
end $$;
revoke all on function public.sync_offline_record(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.sync_offline_record(uuid,text,jsonb,jsonb) to authenticated;
