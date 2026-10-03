-- A destination is independent of the teacher's descriptive assessment title.
alter table public.assessments add column if not exists activity_slot text;
alter table public.class_grading_config add column if not exists activity_slots jsonb not null default '[]'::jsonb;
alter table public.assessments add constraint assessments_activity_slot_term_check
  check (activity_slot is null or (term is not null and term between 1 and 3 and component is not null));
create unique index assessments_class_activity_slot_idx
  on public.assessments(class_id, activity_slot) where activity_slot is not null;

-- Claim unambiguous legacy destinations without deleting or merging historical data.
with candidates as (
  select id, class_id, coalesce(exported_title, case when source = 'imported' then title end) as slot
  from public.assessments
), parsed as (
  select *, substring(slot from '^Term ([1-3])')::smallint as slot_term,
    case when slot ~* 'written|oral' then 'written_work'
         when slot ~* 'performance|product' then 'performance_task'
         when slot ~* 'summative|term exam' then 'assessment' end as slot_component,
    count(*) over (partition by class_id, slot) as claims
  from candidates where slot ~ '^Term [1-3] · '
)
update public.assessments a set activity_slot = p.slot, term = p.slot_term, component = p.slot_component
from parsed p where a.id = p.id and p.claims = 1 and p.slot_component is not null;
