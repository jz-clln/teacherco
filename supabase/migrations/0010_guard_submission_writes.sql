-- supabase/migrations/0010_guard_submission_writes.sql

-- Closes the gap where a direct write to public.submissions could change a score
-- that belongs to another source.
--
-- Every score now has one owner, set by assessments.source:
--   manual   -> public.save_manual_scores
--   imported -> public.import_grade_scores
--   checked  -> public.save_checked_submission (confirmed rows)
-- Each function sets a transaction-local flag (teacherco.write_path). The trigger below
-- rejects a signed-in user's write unless the flag matches the activity's source.
-- A browser request cannot set the flag. It is cleared when the function ends.
--
-- Not blocked: deletes caused by deleting a learner, activity or class (cascades),
-- and anything run as postgres or service_role (migrations, SQL editor, seed).
-- Safe to run more than once.

-- 0. Drafts that already have answer-key items belong to the Check screen.
update public.assessments a
set source = 'checked'
where a.source = 'imported'
  and exists (select 1 from public.assessment_items ai where ai.assessment_id = a.id);

-- 1. The guard.
create or replace function public.guard_submission_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text := coalesce(current_setting('teacherco.write_path', true), '');
  v_source text;
  v_wanted text;
begin
  -- Only direct requests from signed-in users are checked.
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.assessment_id is distinct from old.assessment_id then
    raise exception 'A score cannot be moved to another activity' using errcode = '42501';
  end if;

  select a.source into v_source
  from public.assessments a
  where a.id = case when tg_op = 'DELETE' then old.assessment_id else new.assessment_id end;

  if tg_op = 'DELETE' then
    -- The activity or the learner is already gone: this delete is a cascade.
    if v_source is null
       or not exists (select 1 from public.learners l where l.id = old.learner_id) then
      return old;
    end if;
  elsif v_source is null then
    raise exception 'Activity not found' using errcode = '42501';
  end if;

  if v_source = 'checked' then
    -- Removing a checked result also removes its per-question answers, so it stays consistent.
    if tg_op = 'DELETE' then
      return old;
    end if;
    -- Work in progress (not confirmed) may be written directly. Confirmed scores may not.
    if new.review_status <> 'confirmed'
       and (tg_op = 'INSERT' or old.review_status <> 'confirmed') then
      return new;
    end if;
    v_wanted := 'checked';
  elsif v_source = 'imported' then
    v_wanted := 'import';
  else
    v_wanted := 'manual';
  end if;

  if v_path is distinct from v_wanted then
    raise exception 'Scores of a % activity cannot be changed this way', v_source using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists submissions_guard_writes on public.submissions;
create trigger submissions_guard_writes
before insert or update or delete on public.submissions
for each row execute function public.guard_submission_writes();

-- 2. Import path. Writes scores from the teacher's Excel record to imported activities only.
create or replace function public.import_grade_scores(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  -- Every target must be an imported activity.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where not exists (
      select 1
      from public.assessments a
      where a.id = (r->>'assessment_id')::uuid
        and a.source = 'imported'
    )
  ) then
    raise exception 'An import can only write to imported activities' using errcode = '42501';
  end if;

  -- Every learner must be active in that activity's class.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where not exists (
      select 1
      from public.assessments a
      join public.class_enrollments e on e.class_id = a.class_id
      where a.id = (r->>'assessment_id')::uuid
        and e.learner_id = (r->>'learner_id')::uuid
        and e.status = 'active'
    )
  ) then
    raise exception 'Learner is not enrolled in this class' using errcode = '42501';
  end if;

  -- Scores must be from 0 to the highest possible score.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where (r->>'max_score')::numeric <= 0
       or (r->>'score')::numeric < 0
       or (r->>'score')::numeric > (r->>'max_score')::numeric
  ) then
    raise exception 'A score is outside 0 to the highest possible score' using errcode = '22003';
  end if;

  perform set_config('teacherco.write_path', 'import', true);

  insert into public.submissions
    (assessment_id, learner_id, score, max_score, review_status, confirmed_at)
  select
    (r->>'assessment_id')::uuid,
    (r->>'learner_id')::uuid,
    round((r->>'score')::numeric, 2),
    (r->>'max_score')::numeric,
    'confirmed',
    now()
  from jsonb_array_elements(p_rows) r
  on conflict (assessment_id, learner_id) do update set
    score = excluded.score,
    max_score = excluded.max_score,
    review_status = 'confirmed',
    confirmed_at = now();

  get diagnostics v_count = row_count;
  perform set_config('teacherco.write_path', '', true);
  return v_count;
end;
$$;

revoke execute on function public.import_grade_scores(jsonb) from public;
revoke execute on function public.import_grade_scores(jsonb) from anon;
grant execute on function public.import_grade_scores(jsonb) to authenticated;

-- 3. Manual path (replaces the 0009 version: same behaviour, plus the flag).
create or replace function public.save_manual_scores(
  p_assessment_id uuid,
  p_writes jsonb,
  p_removals uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_total numeric;
begin
  select a.source, a.total_points
    into v_source, v_total
  from public.assessments a
  where a.id = p_assessment_id;

  if not found then
    raise exception 'Activity not found' using errcode = '42501';
  end if;

  if v_source is distinct from 'manual' then
    raise exception 'Only typed-in activities can be edited here' using errcode = '42501';
  end if;

  if v_total is null or v_total <= 0 then
    raise exception 'Activity has no highest possible score' using errcode = '22023';
  end if;

  if jsonb_typeof(p_writes) is distinct from 'array' then
    raise exception 'p_writes must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_writes) w
    where not exists (
      select 1
      from public.assessments a
      join public.class_enrollments e on e.class_id = a.class_id
      where a.id = p_assessment_id
        and e.learner_id = (w->>'learner_id')::uuid
        and e.status = 'active'
    )
  ) then
    raise exception 'Learner is not enrolled in this class' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_writes) w
    where (w->>'score')::numeric < 0
       or (w->>'score')::numeric > v_total
  ) then
    raise exception 'A score is outside 0 to the highest possible score' using errcode = '22003';
  end if;

  perform set_config('teacherco.write_path', 'manual', true);

  insert into public.submissions
    (assessment_id, learner_id, score, max_score, review_status, confirmed_at)
  select
    p_assessment_id,
    (w->>'learner_id')::uuid,
    round((w->>'score')::numeric, 2),
    v_total,
    'confirmed',
    now()
  from jsonb_array_elements(p_writes) w
  on conflict (assessment_id, learner_id) do update set
    score = excluded.score,
    max_score = excluded.max_score,
    review_status = 'confirmed',
    confirmed_at = now();

  delete from public.submissions
  where assessment_id = p_assessment_id
    and learner_id = any(coalesce(p_removals, '{}'::uuid[]));

  perform set_config('teacherco.write_path', '', true);
end;
$$;

revoke execute on function public.save_manual_scores(uuid, jsonb, uuid[]) from public;
revoke execute on function public.save_manual_scores(uuid, jsonb, uuid[]) from anon;
grant execute on function public.save_manual_scores(uuid, jsonb, uuid[]) to authenticated;

-- 4. Check-screen path (replaces the 0005 version).
--    Adds: refuses typed-in activities, refuses an imported activity that has no answer key,
--    relabels an imported activity that has an answer key as "checked", and sets the flag.
create or replace function public.save_checked_submission(
  p_assessment_id uuid,
  p_learner_id uuid,
  p_source_image_path text,
  p_score numeric,
  p_max_score numeric,
  p_answers jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_submission_id uuid;
  v_expected integer;
  v_written integer;
  v_source text;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'p_answers must be a JSON array' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.assessments a
    join public.class_enrollments e on e.class_id = a.class_id
    where a.id = p_assessment_id
      and e.learner_id = p_learner_id
      and e.status = 'active'
  ) then
    raise exception 'Learner is not enrolled in this class' using errcode = '42501';
  end if;

  select a.source into v_source from public.assessments a where a.id = p_assessment_id;

  select count(*) into v_expected
  from public.assessment_items where assessment_id = p_assessment_id;

  if v_source = 'manual' then
    raise exception 'Typed-in activities cannot be checked from an answer sheet' using errcode = '42501';
  end if;

  if v_source = 'imported' then
    if v_expected = 0 then
      raise exception 'Imported activities have no answer key to check against' using errcode = '42501';
    end if;
    update public.assessments set source = 'checked' where id = p_assessment_id and source = 'imported';
  end if;

  perform set_config('teacherco.write_path', 'checked', true);

  insert into public.submissions
    (assessment_id, learner_id, score, max_score, review_status, source_image_path, confirmed_at)
  values
    (p_assessment_id, p_learner_id, p_score, p_max_score, 'confirmed', p_source_image_path, now())
  on conflict (assessment_id, learner_id) do update set
    score = excluded.score,
    max_score = excluded.max_score,
    review_status = 'confirmed',
    source_image_path = coalesce(excluded.source_image_path, public.submissions.source_image_path),
    confirmed_at = now()
  returning id into v_submission_id;

  insert into public.submission_answers
    (submission_id, assessment_item_id, extracted_answer, extraction_confidence,
     teacher_final_answer, is_correct, points_awarded, needs_review)
  select
    v_submission_id,
    ai.id,
    a->'extracted_answer',
    nullif(a->>'extraction_confidence', '')::numeric,
    a->'teacher_final_answer',
    (a->>'is_correct')::boolean,
    (a->>'points_awarded')::numeric,
    coalesce((a->>'needs_review')::boolean, false)
  from jsonb_array_elements(p_answers) as a
  join public.assessment_items ai
    on ai.id = (a->>'assessment_item_id')::uuid
   and ai.assessment_id = p_assessment_id
  on conflict (submission_id, assessment_item_id) do update set
    extracted_answer = excluded.extracted_answer,
    extraction_confidence = excluded.extraction_confidence,
    teacher_final_answer = excluded.teacher_final_answer,
    is_correct = excluded.is_correct,
    points_awarded = excluded.points_awarded,
    needs_review = excluded.needs_review;

  get diagnostics v_written = row_count;
  if v_written <> v_expected then
    raise exception 'Expected % answers, saved %', v_expected, v_written using errcode = '22023';
  end if;

  perform set_config('teacherco.write_path', '', true);
  return v_submission_id;
end;
$$;

revoke execute on function public.save_checked_submission(uuid, uuid, text, numeric, numeric, jsonb) from public;
revoke execute on function public.save_checked_submission(uuid, uuid, text, numeric, numeric, jsonb) from anon;
grant execute on function public.save_checked_submission(uuid, uuid, text, numeric, numeric, jsonb) to authenticated;