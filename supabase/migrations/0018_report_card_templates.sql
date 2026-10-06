-- Account-level immutable source workbooks. No Section binding or cell mappings.
create function public.valid_template_metadata(value jsonb, sheets integer) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; k text; i integer:=0;
begin
  if jsonb_typeof(value) is distinct from 'object' or value - array['formatVersion','sheets'] <> '{}'::jsonb
    or value->>'formatVersion' is distinct from '1' or jsonb_typeof(value->'sheets') is distinct from 'array'
    or jsonb_array_length(value->'sheets')<>sheets or octet_length(value::text)>32768 then return false; end if;
  for s in select * from jsonb_array_elements(value->'sheets') loop
    foreach k in array array['hasImages','hasExternalReferences','hasPrintArea','hasFreezePane','truncated'] loop
      if jsonb_typeof(s->k) is distinct from 'boolean' then return false; end if;
    end loop;
    foreach k in array array['index','rowExtent','columnExtent','mergeCount','formulaCount'] loop
      if jsonb_typeof(s->k) is distinct from 'number' or (s->>k) !~ '^[0-9]+$' then return false; end if;
    end loop;
    if jsonb_typeof(s) is distinct from 'object' or s - array['name','index','state','rowExtent','columnExtent','mergeCount','formulaCount','hasImages','hasExternalReferences','hasPrintArea','hasFreezePane','truncated'] <> '{}'::jsonb
      or jsonb_typeof(s->'name') is distinct from 'string' or length(s->>'name') not between 1 and 31
      or (s->>'index')::integer is distinct from i or jsonb_typeof(s->'state') is distinct from 'string' or (s->>'state') not in ('visible','hidden','veryHidden')
      or (s->>'rowExtent')::integer not between 1 and 2000 or (s->>'columnExtent')::integer not between 1 and 128
      or (s->>'mergeCount')::integer not between 0 and 5000 or (s->>'formulaCount')::integer not between 0 and 100000
      or not(s ?& array['state','rowExtent','columnExtent','mergeCount','formulaCount','hasImages','hasExternalReferences','hasPrintArea','hasFreezePane','truncated'])
      then return false; end if;
    i:=i+1;
  end loop;
  return true;
exception when others then return false;
end $$;

create table public.report_card_templates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(name=btrim(name) and name ~ '[^[:space:]]' and length(name)<=160),
  original_filename text not null check(length(original_filename) between 1 and 255 and original_filename ~* '\.xlsx$'),
  storage_path text not null unique,
  mime_type text not null check(mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  file_size_bytes bigint not null check(file_size_bytes between 1 and 10485760),
  file_sha256 text not null check(file_sha256 ~ '^[a-f0-9]{64}$'),
  sheet_count integer not null check(sheet_count between 1 and 20),
  workbook_metadata jsonb not null check(public.valid_template_metadata(workbook_metadata,sheet_count)),
  status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(storage_path=teacher_id::text||'/'||id::text||'/source.xlsx')
);
create index report_card_templates_owner_status_idx on public.report_card_templates(teacher_id,status,created_at desc);
create unique index report_card_templates_active_hash_idx on public.report_card_templates(teacher_id,file_sha256) where status='active';

create function public.guard_report_card_template_source() returns trigger
language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-array['name','status','updated_at']) is distinct from (to_jsonb(old)-array['name','status','updated_at']) then
    raise exception 'The source workbook is immutable. Upload a new template for a different layout.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger report_card_templates_source before update on public.report_card_templates
  for each row execute function public.guard_report_card_template_source();
create trigger report_card_templates_updated_at before update on public.report_card_templates
  for each row execute function public.set_updated_at();
alter table public.report_card_templates enable row level security;
create policy template_owner on public.report_card_templates for all to authenticated
  using(teacher_id=(select auth.uid())) with check(teacher_id=(select auth.uid()));
create policy template_active_access on public.report_card_templates as restrictive for all to authenticated
  using((select public.has_active_access())) with check((select public.has_active_access()));
revoke all on public.report_card_templates from public,anon,authenticated;
grant select,insert,delete on public.report_card_templates to authenticated;
grant update(name,status) on public.report_card_templates to authenticated;
grant all on public.report_card_templates to service_role;
revoke all on function public.guard_report_card_template_source() from public,anon,authenticated;
revoke all on function public.valid_template_metadata(jsonb,integer) from public,anon;
grant execute on function public.valid_template_metadata(jsonb,integer) to authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-card-templates','report-card-templates',false,10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream']);

-- Upload to a fresh server-issued path; no overwrites, moves or post-registration
-- replacement, even if the original object is removed. Metadata precedes viewing.
create policy template_source_read on storage.objects for select to authenticated
  using(bucket_id='report-card-templates' and (storage.foldername(name))[1]=auth.uid()::text);
create policy template_source_insert on storage.objects for insert to authenticated
  with check(bucket_id='report-card-templates' and name ~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}/source\.xlsx$')
    and not exists(select 1 from public.report_card_templates t where t.storage_path=storage.objects.name));
create policy template_source_delete on storage.objects for delete to authenticated
  using(bucket_id='report-card-templates' and (storage.foldername(name))[1]=auth.uid()::text);
create policy template_source_no_updates on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'report-card-templates') with check(bucket_id<>'report-card-templates');
-- Existing restrictive active teacher storage access policy also covers this bucket.
