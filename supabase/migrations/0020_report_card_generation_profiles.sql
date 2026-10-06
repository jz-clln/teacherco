create table public.report_card_generation_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  template_id uuid not null references public.report_card_templates(id) on delete cascade,
  mapping_id uuid not null references public.report_card_template_mappings(id) on delete cascade,
  mapping_revision integer not null check(mapping_revision>0),
  template_sha256 text not null check(template_sha256 ~ '^[a-f0-9]{64}$'),
  bindings jsonb not null check(octet_length(bindings::text)<=16384),
  revision integer not null check(revision>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(section_id,template_id)
);
create index generation_profiles_owner_idx on public.report_card_generation_profiles(teacher_id);
alter table public.report_card_generation_profiles enable row level security;
create policy generation_profile_owner on public.report_card_generation_profiles for select to authenticated using(teacher_id=(select auth.uid()));
create policy generation_profile_active on public.report_card_generation_profiles as restrictive for all to authenticated using((select public.has_active_access())) with check((select public.has_active_access()));
revoke all on public.report_card_generation_profiles from public,anon,authenticated;
grant select on public.report_card_generation_profiles to authenticated;
grant all on public.report_card_generation_profiles to service_role;

create function public.guard_generation_profile() returns trigger language plpgsql set search_path='' as $$
declare section public.sections; template public.report_card_templates; mapping public.report_card_template_mappings; pair record; expected integer;
begin
  select * into section from public.sections where id=new.section_id;
  select * into template from public.report_card_templates where id=new.template_id;
  select * into mapping from public.report_card_template_mappings where id=new.mapping_id;
  if section.id is null or template.id is null or mapping.id is null or section.teacher_id<>new.teacher_id or template.teacher_id<>new.teacher_id or mapping.teacher_id<>new.teacher_id or mapping.template_id<>template.id then raise exception 'Owned Section, template and mapping required'; end if;
  if section.status<>'active' or template.status<>'active' or mapping.status<>'reviewed' then raise exception 'Active Section/template and reviewed mapping required'; end if;
  if new.mapping_revision<>mapping.revision or new.template_sha256<>template.file_sha256 then raise exception 'Mapping or source changed. Configure again.' using errcode='PT409'; end if;
  if jsonb_typeof(new.bindings) is distinct from 'object' or new.bindings-array['periodBindings','subjectBindings']<>'{}' or jsonb_typeof(new.bindings->'periodBindings') is distinct from 'object' or jsonb_typeof(new.bindings->'subjectBindings') is distinct from 'object' then raise exception 'Invalid compatibility bindings'; end if;
  select count(*) into expected from jsonb_each(new.bindings->'periodBindings');
  if expected<>jsonb_array_length(mapping.mapping_definition->'periods') then raise exception 'Bind every template period'; end if;
  for pair in select * from jsonb_each(new.bindings->'periodBindings') loop
    if jsonb_typeof(pair.value) is distinct from 'string' or not exists(select 1 from jsonb_array_elements(mapping.mapping_definition->'periods') p where p->>'key'=pair.key) or not exists(select 1 from public.section_grade_periods p where p.id::text=pair.value#>>'{}' and p.section_id=section.id and p.teacher_id=new.teacher_id and p.status='active') then raise exception 'Invalid Section period binding'; end if;
  end loop;
  select count(*) into expected from jsonb_each(new.bindings->'subjectBindings');
  if expected<>jsonb_array_length(mapping.mapping_definition->'subjects') then raise exception 'Bind every template subject'; end if;
  for pair in select * from jsonb_each(new.bindings->'subjectBindings') loop
    if jsonb_typeof(pair.value) is distinct from 'string' or not exists(select 1 from jsonb_array_elements(mapping.mapping_definition->'subjects') s where s->>'key'=pair.key) or not exists(select 1 from public.section_subjects s where s.id::text=pair.value#>>'{}' and s.section_id=section.id and s.teacher_id=new.teacher_id and s.status='active') then raise exception 'Invalid Section subject binding'; end if;
  end loop;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.teacher_id<>old.teacher_id or new.section_id<>old.section_id or new.template_id<>old.template_id or new.created_at<>old.created_at or new.revision<>old.revision+1 then raise exception 'Invalid profile identity or revision'; end if;
  elsif new.revision<>1 then raise exception 'Initial profile revision must be 1'; end if;
  new.updated_at:=now();return new;
end $$;
create trigger generation_profile_guard before insert or update on public.report_card_generation_profiles for each row execute function public.guard_generation_profile();

create function public.save_generation_profile(p_section uuid,p_template uuid,p_mapping uuid,p_mapping_revision integer,p_sha text,p_bindings jsonb,p_expected_id uuid,p_revision integer)
returns public.report_card_generation_profiles language plpgsql security definer set search_path='' as $$
declare current_profile public.report_card_generation_profiles; saved public.report_card_generation_profiles;
begin
  if not public.has_active_access() then raise exception 'Active verified access required' using errcode='42501'; end if;
  perform 1 from public.sections where id=p_section and teacher_id=auth.uid() and status='active' for update;
  if not found then raise exception 'Active owned Section required' using errcode='42501'; end if;
  perform 1 from public.report_card_templates where id=p_template and teacher_id=auth.uid() and status='active' for update;
  if not found then raise exception 'Active owned template required' using errcode='42501'; end if;
  select * into current_profile from public.report_card_generation_profiles where section_id=p_section and template_id=p_template for update;
  if p_revision is null or current_profile.id is distinct from p_expected_id or coalesce(current_profile.revision,0)<>p_revision then raise exception 'Compatibility changed. Reopen it before saving.' using errcode='PT409'; end if;
  if current_profile.id is null then
    insert into public.report_card_generation_profiles(teacher_id,section_id,template_id,mapping_id,mapping_revision,template_sha256,bindings,revision) values(auth.uid(),p_section,p_template,p_mapping,p_mapping_revision,p_sha,p_bindings,1) returning * into saved;
  else
    update public.report_card_generation_profiles set mapping_id=p_mapping,mapping_revision=p_mapping_revision,template_sha256=p_sha,bindings=p_bindings,revision=revision+1 where id=current_profile.id returning * into saved;
  end if;
  return saved;
end $$;

-- A single SQL statement produces a consistent, read-only snapshot. No grades,
-- learner values, LRN or generated files are written to a generation profile.
create function public.report_card_generation_snapshot(p_section uuid,p_template uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'section',to_jsonb(s),'template',to_jsonb(t),'mapping',to_jsonb(m),'profile',to_jsonb(g),
    'adviserName',case when s.is_adviser then (select nullif(btrim(p.full_name),'') from public.profiles p where p.id=auth.uid()) else null end,
    'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.position,p.id) from public.section_grade_periods p where p.section_id=s.id and p.teacher_id=auth.uid() and p.status='active'),'[]'),
    'subjects',coalesce((select jsonb_agg(to_jsonb(q) order by q.position,q.id) from (select * from public.section_subjects q where q.section_id=s.id and q.teacher_id=auth.uid() and q.status='active' order by q.position,q.id limit 501) q),'[]'),
    'learners',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'display_name',l.display_name) order by l.display_name,l.id) from (select l.id,l.display_name from public.section_enrollments e join public.learners l on l.id=e.learner_id where e.section_id=s.id and e.teacher_id=auth.uid() and l.teacher_id=auth.uid() and e.status='active' order by l.display_name,l.id limit 501) l),'[]'),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('learner_id',e.learner_id,'section_subject_id',e.section_subject_id,'period_id',e.period_id,'grade',e.grade,'updated_at',e.updated_at) order by e.id) from (select e.* from public.section_grade_entries e where e.section_id=s.id and e.teacher_id=auth.uid() and exists(select 1 from public.section_enrollments en where en.section_id=s.id and en.learner_id=e.learner_id and en.status='active') order by e.id limit 30001) e),'[]')
  ) from public.sections s join public.report_card_templates t on t.id=p_template and t.teacher_id=auth.uid() and t.status='active'
  join public.report_card_template_mappings m on m.template_id=t.id and m.teacher_id=auth.uid() and m.status='reviewed'
  left join public.report_card_generation_profiles g on g.section_id=s.id and g.template_id=t.id and g.teacher_id=auth.uid()
  where s.id=p_section and s.teacher_id=auth.uid() and s.status='active' and public.has_active_access();
$$;
revoke all on function public.guard_generation_profile() from public,anon,authenticated;
revoke all on function public.save_generation_profile(uuid,uuid,uuid,integer,text,jsonb,uuid,integer),public.report_card_generation_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_generation_profile(uuid,uuid,uuid,integer,text,jsonb,uuid,integer),public.report_card_generation_snapshot(uuid,uuid) to authenticated;
