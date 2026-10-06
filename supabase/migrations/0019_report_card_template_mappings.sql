-- One current, Section-independent mapping. Only revision-checked RPCs mutate it.
create table public.report_card_template_mappings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null unique references public.report_card_templates(id) on delete cascade,
  mapping_definition jsonb not null check(octet_length(mapping_definition::text)<=131072),
  revision integer not null check(revision>0),
  status text not null check(status in ('draft','reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_card_template_mappings_owner_idx on public.report_card_template_mappings(teacher_id);
alter table public.report_card_template_mappings enable row level security;
create policy mapping_owner on public.report_card_template_mappings for select to authenticated
  using(teacher_id=(select auth.uid()) and exists(select 1 from public.report_card_templates t where t.id=template_id and t.teacher_id=(select auth.uid())));
create policy mapping_active_access on public.report_card_template_mappings as restrictive for all to authenticated
  using((select public.has_active_access())) with check((select public.has_active_access()));
revoke all on public.report_card_template_mappings from public,anon,authenticated;
grant select on public.report_card_template_mappings to authenticated;
grant all on public.report_card_template_mappings to service_role;

create function public.mapping_location_rect(loc jsonb, metadata jsonb) returns integer[]
language plpgsql immutable set search_path='' as $$
declare parts text[]; endpoint text; hits text[]; bounds jsonb; coords integer[]:='{}'; col integer; i integer;
begin
  if jsonb_typeof(loc) is distinct from 'object' or loc-array['sheet','address']<>'{}'
    or jsonb_typeof(loc->'sheet') is distinct from 'string' or jsonb_typeof(loc->'address') is distinct from 'string'
    or (loc->>'address') !~ '^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$' then raise exception 'Invalid mapping location'; end if;
  select s into bounds from jsonb_array_elements(metadata->'sheets') s where s->>'name'=loc->>'sheet';
  if bounds is null then raise exception 'Mapping worksheet does not exist'; end if;
  parts:=string_to_array(loc->>'address',':'); if array_length(parts,1)=1 then parts:=array[parts[1],parts[1]]; end if;
  foreach endpoint in array parts loop
    hits:=regexp_match(endpoint,'^([A-Z]+)([0-9]+)$'); col:=0;
    for i in 1..length(hits[1]) loop col:=col*26+ascii(substr(hits[1],i,1))-64; end loop;
    if (hits[2])::integer>(bounds->>'rowExtent')::integer or col>(bounds->>'columnExtent')::integer then raise exception 'Mapping outside supported bounds'; end if;
    coords:=coords||array[(hits[2])::integer,col];
  end loop;
  if coords[1]>coords[3] or coords[2]>coords[4] then raise exception 'Invalid mapping range'; end if;
  return coords;
end $$;

create function public.validate_template_mapping(def jsonb, metadata jsonb, source_hash text) returns void
language plpgsql immutable set search_path='' as $$
declare item jsonb; pair record; loc jsonb; prior jsonb; targets jsonb:='[]'; period_keys text[]:='{}'; subject_keys text[]:='{}'; rect integer[]; other integer[];
begin
  if def is null or jsonb_typeof(def) is distinct from 'object' or octet_length(def::text)>131072
    or def-array['formatVersion','templateSha256','fields','periods','subjects']<>'{}'
    or def->'formatVersion' is distinct from '1'::jsonb or def->>'templateSha256' is distinct from source_hash
    or jsonb_typeof(def->'fields') is distinct from 'object' or jsonb_typeof(def->'periods') is distinct from 'array'
    or jsonb_typeof(def->'subjects') is distinct from 'array' then raise exception 'Invalid mapping definition or source SHA'; end if;
  if jsonb_array_length(def->'periods')>8 or jsonb_array_length(def->'subjects')>60 then raise exception 'Mapping limit exceeded'; end if;
  for pair in select * from jsonb_each(def->'fields') loop
    if pair.key not in ('learner_name','grade_level','section_name','school_year','adviser_name','school_name','school_id','lrn','final_average','general_remarks') then raise exception 'Unknown field mapping'; end if;
    targets:=targets||jsonb_build_array(pair.value);
  end loop;
  for item in select * from jsonb_array_elements(def->'periods') loop
    if jsonb_typeof(item) is distinct from 'object' or item-array['key','label']<>'{}'
      or jsonb_typeof(item->'key') is distinct from 'string' or item->>'key' !~ '^period_[1-8]$'
      or jsonb_typeof(item->'label') is distinct from 'string' or length(btrim(item->>'label')) not between 1 and 120
      or item->>'key'=any(period_keys) then raise exception 'Invalid or duplicate period'; end if;
    period_keys:=array_append(period_keys,item->>'key');
  end loop;
  for item in select * from jsonb_array_elements(def->'subjects') loop
    if jsonb_typeof(item) is distinct from 'object' or item-array['key','label','labelLocation','outputs']<>'{}'
      or jsonb_typeof(item->'key') is distinct from 'string' or item->>'key' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof(item->'label') is distinct from 'string' or length(btrim(item->>'label')) not between 1 and 120
      or jsonb_typeof(item->'outputs') is distinct from 'object' or item->>'key'=any(subject_keys) then raise exception 'Invalid or duplicate subject mapping'; end if;
    subject_keys:=array_append(subject_keys,item->>'key');
    if item ? 'labelLocation' then targets:=targets||jsonb_build_array(item->'labelLocation'); end if;
    for pair in select * from jsonb_each(item->'outputs') loop
      if pair.key not in ('final_grade','remarks') and not(pair.key=any(period_keys)) then raise exception 'Undefined period output'; end if;
      targets:=targets||jsonb_build_array(pair.value);
    end loop;
  end loop;
  for loc in select * from jsonb_array_elements(targets) loop
    rect:=public.mapping_location_rect(loc,metadata);
  end loop;
  -- At most 670 targets; pair comparisons preserve ranges without enumerating cells.
  for i in 0..jsonb_array_length(targets)-1 loop
    loc:=targets->i;rect:=public.mapping_location_rect(loc,metadata);
    for j in 0..i-1 loop
      prior:=targets->j;
      if prior->>'sheet'=loc->>'sheet' then
        other:=public.mapping_location_rect(prior,metadata);
        if rect[1]<=other[3] and rect[3]>=other[1] and rect[2]<=other[4] and rect[4]>=other[2] then raise exception 'Conflicting overlapping mapping locations'; end if;
      end if;
    end loop;
  end loop;
end $$;

create function public.guard_template_mapping() returns trigger language plpgsql set search_path='' as $$
declare source public.report_card_templates;
begin
  select * into source from public.report_card_templates where id=new.template_id;
  if source.id is null or new.teacher_id<>source.teacher_id then raise exception 'Mapping owner does not match template'; end if;
  perform public.validate_template_mapping(new.mapping_definition,source.workbook_metadata,source.file_sha256);
  if tg_op='UPDATE' then
    if new.id<>old.id or new.template_id<>old.template_id or new.teacher_id<>old.teacher_id or new.created_at<>old.created_at or new.revision<>old.revision+1 then raise exception 'Invalid mapping identity or revision'; end if;
  elsif new.revision<>1 then raise exception 'Initial mapping revision must be 1'; end if;
  new.updated_at:=now();return new;
end $$;
create trigger template_mapping_guard before insert or update on public.report_card_template_mappings for each row execute function public.guard_template_mapping();

create function public.save_report_card_mapping(p_template uuid,p_definition jsonb,p_expected_id uuid,p_revision integer,p_status text)
returns public.report_card_template_mappings language plpgsql security definer set search_path='' as $$
declare source public.report_card_templates; current_mapping public.report_card_template_mappings; saved public.report_card_template_mappings;
begin
  if not public.has_active_access() then raise exception 'Active verified access required' using errcode='42501'; end if;
  select * into source from public.report_card_templates where id=p_template and teacher_id=auth.uid() for update;
  if source.id is null then raise exception 'Template not found' using errcode='42501'; end if;
  if source.status<>'active' then raise exception 'Reactivate this template before editing its mapping'; end if;
  if p_revision is null or p_revision<0 or p_status is null or p_status not in ('draft','reviewed') then raise exception 'Invalid mapping revision or status'; end if;
  select * into current_mapping from public.report_card_template_mappings where template_id=p_template for update;
  if current_mapping.id is distinct from p_expected_id or coalesce(current_mapping.revision,0)<>p_revision then raise exception 'This mapping changed. Reopen it before saving.' using errcode='PT409'; end if;
  if current_mapping.id is null then
    insert into public.report_card_template_mappings(teacher_id,template_id,mapping_definition,revision,status)
      values(auth.uid(),p_template,p_definition,1,p_status) returning * into saved;
  else
    update public.report_card_template_mappings set mapping_definition=p_definition,revision=revision+1,status=p_status where id=current_mapping.id returning * into saved;
  end if;
  return saved;
end $$;

create function public.reset_report_card_mapping(p_template uuid,p_expected_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare source public.report_card_templates; current_mapping public.report_card_template_mappings;
begin
  if not public.has_active_access() then raise exception 'Active verified access required' using errcode='42501'; end if;
  select * into source from public.report_card_templates where id=p_template and teacher_id=auth.uid() for update;
  if source.id is null then raise exception 'Template not found' using errcode='42501'; end if;
  if source.status<>'active' then raise exception 'Reactivate this template before resetting its mapping'; end if;
  select * into current_mapping from public.report_card_template_mappings where template_id=p_template for update;
  if p_revision is null or current_mapping.id is distinct from p_expected_id or coalesce(current_mapping.revision,0)<>p_revision then raise exception 'This mapping changed. Reopen it before resetting.' using errcode='PT409'; end if;
  delete from public.report_card_template_mappings where template_id=p_template;
end $$;
revoke all on function public.mapping_location_rect(jsonb,jsonb),public.validate_template_mapping(jsonb,jsonb,text),public.guard_template_mapping() from public,anon,authenticated;
revoke all on function public.save_report_card_mapping(uuid,jsonb,uuid,integer,text),public.reset_report_card_mapping(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_report_card_mapping(uuid,jsonb,uuid,integer,text),public.reset_report_card_mapping(uuid,uuid,integer) to authenticated;
