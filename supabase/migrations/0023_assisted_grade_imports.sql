-- Reusable structure only; no raw workbooks or learner records.
create table public.grade_import_formats (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  definition jsonb not null check (jsonb_typeof(definition)='object' and octet_length(definition::text)<2048
    and definition - array['sheet','headerRow','nameColumn','gradeColumn','uuidColumn','startRow','endRow']='{}'::jsonb
    and definition ?& array['sheet','headerRow','nameColumn','gradeColumn','uuidColumn','startRow','endRow']
    and jsonb_typeof(definition->'sheet')='number' and (definition->>'sheet')::int between 0 and 19
    and jsonb_typeof(definition->'headerRow')='number' and (definition->>'headerRow')::int between 1 and 100
    and jsonb_typeof(definition->'nameColumn')='number' and (definition->>'nameColumn')::int between 1 and 128
    and jsonb_typeof(definition->'gradeColumn')='number' and (definition->>'gradeColumn')::int between 1 and 128
    and (definition->'uuidColumn'='null'::jsonb or (jsonb_typeof(definition->'uuidColumn')='number' and (definition->>'uuidColumn')::int between 1 and 128))
    and jsonb_typeof(definition->'startRow')='number' and (definition->>'startRow')::int between 2 and 2000
    and jsonb_typeof(definition->'endRow')='number' and (definition->>'endRow')::int between 2 and 2000),
  updated_at timestamptz not null default now(), unique(teacher_id,fingerprint)
);
alter table public.grade_import_formats enable row level security;
revoke all on public.grade_import_formats from anon,public;
grant select,insert,update,delete on public.grade_import_formats to authenticated;
create policy own_formats on public.grade_import_formats for all to authenticated
using (teacher_id=auth.uid() and public.has_active_access())
with check (teacher_id=auth.uid() and public.has_active_access());

-- Reuse the established grade transaction/trigger checks, then mark provenance
-- in the same transaction. No changes to official grade calculations.
create function public.import_external_section_grades(p_section uuid,p_subject uuid,p_period uuid,p_rows jsonb,p_sha text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_sha is null or p_sha !~ '^[a-f0-9]{64}$' then raise exception 'Invalid source hash.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x where x->>'grade' is null) then raise exception 'Missing grades cannot erase values.'; end if;
  perform public.save_section_grades(p_section,p_subject,p_period,p_rows);
  update public.section_grade_entries set source_type='external_import',source_class_id=null,
    source_reference='Excel import',source_snapshot=jsonb_build_object('sha256',p_sha)
    where teacher_id=auth.uid() and section_id=p_section and section_subject_id=p_subject and period_id=p_period
    and learner_id in (select (x->>'learner_id')::uuid from jsonb_array_elements(p_rows)x);
end $$;
revoke all on function public.import_external_section_grades(uuid,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.import_external_section_grades(uuid,uuid,uuid,jsonb,text) to authenticated;
