-- Short-lived private delivery only. No output-history or learner-value table.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-card-temporary','report-card-temporary',false,52428800,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip']);

create function public.temporary_report_path_valid(p_name text,p_owner uuid,p_upload boolean default false)
returns boolean language sql stable set search_path='' as $$
  select case when p_owner is null or p_name !~ ('^[0-9]{13}/'||p_owner::text||'/[a-f0-9-]{36}\.(xlsx|zip)$') then false
  else split_part(p_name,'/',1)::bigint > extract(epoch from now())*1000
    and (not p_upload or split_part(p_name,'/',1)::bigint <= extract(epoch from now()+interval '15 minutes')*1000) end;
$$;
revoke all on function public.temporary_report_path_valid(text,uuid,boolean) from public,anon;
grant execute on function public.temporary_report_path_valid(text,uuid,boolean) to authenticated,service_role;
create policy temporary_report_insert on storage.objects for insert to authenticated
  with check(bucket_id='report-card-temporary' and public.has_active_access() and public.temporary_report_path_valid(name,auth.uid(),true));
create policy temporary_report_read on storage.objects for select to authenticated
  using(bucket_id='report-card-temporary' and public.has_active_access() and public.temporary_report_path_valid(name,auth.uid()));
create policy temporary_report_delete on storage.objects for delete to authenticated
  using(bucket_id='report-card-temporary' and public.has_active_access() and (storage.foldername(name))[2]=auth.uid()::text);
create policy temporary_report_no_overwrite on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'report-card-temporary') with check(bucket_id<>'report-card-temporary');
