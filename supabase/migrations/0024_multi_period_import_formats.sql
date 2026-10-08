-- Extend the existing numeric format metadata; no parallel import system.
create function public.valid_grade_import_format(d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; x jsonb;
begin
  if jsonb_typeof(d)<>'object' or octet_length(d::text)>4096
    or d-array['sheet','headerRow','nameColumn','gradeColumn','gradeColumns','periodHints','uuidColumn','startRow','endRow']<>'{}'::jsonb
    or not d ?& array['sheet','headerRow','nameColumn','gradeColumn','uuidColumn','startRow','endRow'] then return false; end if;
  foreach k in array array['sheet','headerRow','nameColumn','gradeColumn','startRow','endRow'] loop
    if jsonb_typeof(d->k)<>'number' or (d->>k)::numeric<>trunc((d->>k)::numeric) then return false; end if;
  end loop;
  if (d->>'sheet')::int not between 0 and 19 or (d->>'headerRow')::int not between 1 and 100
    or (d->>'nameColumn')::int not between 1 and 128 or (d->>'gradeColumn')::int not between 1 and 128
    or (d->>'startRow')::int not between 2 and 2000 or (d->>'endRow')::int not between 2 and 2000 then return false; end if;
  if d->'uuidColumn'<>'null'::jsonb and (jsonb_typeof(d->'uuidColumn')<>'number' or (d->>'uuidColumn')::int not between 1 and 128) then return false; end if;
  if d ? 'gradeColumns' then
    if jsonb_typeof(d->'gradeColumns')<>'array' or jsonb_array_length(d->'gradeColumns') not between 1 and 8 then return false; end if;
    for x in select * from jsonb_array_elements(d->'gradeColumns') loop
      if jsonb_typeof(x)<>'number' or x::text::numeric<>trunc(x::text::numeric) or x::text::int not between 1 and 128 then return false; end if;
    end loop;
  end if;
  if d ? 'periodHints' then
    if jsonb_typeof(d->'periodHints')<>'array' or jsonb_array_length(d->'periodHints')>8 then return false; end if;
    for x in select * from jsonb_array_elements(d->'periodHints') loop
      if jsonb_typeof(x)<>'object' or x-array['column','code']<>'{}'::jsonb or not x ?& array['column','code']
        or jsonb_typeof(x->'column')<>'number' or (x->>'column')::int not between 1 and 128
        or jsonb_typeof(x->'code')<>'number' or (x->>'code')::int not between 1 and 32 then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end $$;
revoke all on function public.valid_grade_import_format(jsonb) from public,anon;
grant execute on function public.valid_grade_import_format(jsonb) to authenticated,service_role;
alter table public.grade_import_formats drop constraint grade_import_formats_definition_check;
alter table public.grade_import_formats add constraint grade_import_formats_definition_check check(public.valid_grade_import_format(definition));

-- One workbook's reviewed periods commit together. Existing per-cell stale,
-- roster, owner and grade checks remain inside the existing saver.
create function public.import_external_grade_columns(p_section uuid,p_subject uuid,p_sha text,p_groups jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare g jsonb;
begin
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) not between 1 and 8 then raise exception 'Choose reviewed periods.'; end if;
  if (select count(distinct x->>'periodId') from jsonb_array_elements(p_groups)x)<>jsonb_array_length(p_groups) then raise exception 'Duplicate destination period.'; end if;
  for g in select * from jsonb_array_elements(p_groups) loop
    perform public.import_external_section_grades(p_section,p_subject,(g->>'periodId')::uuid,g->'rows',p_sha);
  end loop;
end $$;
revoke all on function public.import_external_grade_columns(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.import_external_grade_columns(uuid,uuid,text,jsonb) to authenticated;
