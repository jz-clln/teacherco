-- Serialize saves for a class/day and reject stale offline changes atomically.
create or replace function public.save_attendance_day(p_class uuid,p_date date,p_marks jsonb,p_baseline jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_marks jsonb; stamp timestamptz:=now();
begin
  if auth.uid() is null or not exists(select 1 from classes where id=p_class and teacher_id=auth.uid()) then
    raise exception 'Class not found';
  end if;
  if p_date>(now() at time zone 'Asia/Manila')::date or p_date is null then raise exception 'Invalid attendance date'; end if;
  if jsonb_typeof(p_marks) is distinct from 'object' or p_marks='{}'::jsonb then raise exception 'Invalid marks'; end if;
  if (select count(*) from jsonb_each(p_marks))>500 then raise exception 'Too many marks'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class::text||':'||p_date::text,0));
  if exists(select 1 from jsonb_each_text(p_marks) m where m.value not in ('present','absent','late','excused') or not exists(
    select 1 from class_enrollments e where e.class_id=p_class and e.learner_id=m.key::uuid and e.status='active'
  )) then return jsonb_build_object('ok',false,'error','The class roster changed. Review attendance online before syncing.'); end if;
  select coalesce(jsonb_object_agg(learner_id::text,status),'{}'::jsonb) into current_marks from attendance_entries where class_id=p_class and attendance_date=p_date;
  -- A lost response may be retried safely without changing the saved rows again.
  if current_marks @> p_marks then return jsonb_build_object('ok',true,'updatedAt',stamp,'marks',current_marks); end if;
  if p_baseline is not null and current_marks<>p_baseline then
    return jsonb_build_object('ok',false,'error','Attendance changed online. Your device copy is kept. Review the saved attendance before replacing it.');
  end if;
  insert into attendance_entries(class_id,learner_id,attendance_date,status,updated_at)
    select p_class,m.key::uuid,p_date,m.value,stamp from jsonb_each_text(p_marks) m
    on conflict(class_id,learner_id,attendance_date) do update set status=excluded.status,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'updatedAt',stamp,'marks',current_marks||p_marks);
end $$;
revoke all on function public.save_attendance_day(uuid,date,jsonb,jsonb) from public,anon;
grant execute on function public.save_attendance_day(uuid,date,jsonb,jsonb) to authenticated;
