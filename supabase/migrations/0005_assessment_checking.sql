-- TeacherCo assessment checking support.
-- Safe to run more than once.

-- 1. Indexes for foreign keys the checking screens filter on.
create index if not exists submissions_assessment_id_idx on public.submissions(assessment_id);
create index if not exists submissions_learner_id_idx on public.submissions(learner_id);
create index if not exists submission_answers_submission_id_idx on public.submission_answers(submission_id);
create index if not exists submission_answers_item_id_idx on public.submission_answers(assessment_item_id);
create index if not exists assessment_competencies_competency_id_idx on public.assessment_competencies(competency_id);

-- 2. Atomic save of one confirmed answer sheet.
--    SECURITY INVOKER: every row is still filtered by the existing RLS policies.
--    The app computes score and is_correct with its deterministic scoring code;
--    this function only stores them together or not at all.
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

  select count(*) into v_expected
  from public.assessment_items where assessment_id = p_assessment_id;

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

  return v_submission_id;
end;
$$;

revoke execute on function public.save_checked_submission(uuid, uuid, text, numeric, numeric, jsonb) from public;
revoke execute on function public.save_checked_submission(uuid, uuid, text, numeric, numeric, jsonb) from anon;
grant execute on function public.save_checked_submission(uuid, uuid, text, numeric, numeric, jsonb) to authenticated;
