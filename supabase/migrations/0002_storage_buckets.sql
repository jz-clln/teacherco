-- Private TeacherCo storage buckets.
insert into storage.buckets (id, name, public)
values
  ('teacher-records', 'teacher-records', false),
  ('assessment-images', 'assessment-images', false),
  ('generated-reports', 'generated-reports', false)
on conflict (id) do nothing;

-- Object paths must begin with the authenticated teacher id:
-- {auth.uid()}/{class_id}/...
create policy "teacher records own path"
on storage.objects for all to authenticated
using (bucket_id = 'teacher-records' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'teacher-records' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "assessment images own path"
on storage.objects for all to authenticated
using (bucket_id = 'assessment-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'assessment-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "generated reports own path"
on storage.objects for all to authenticated
using (bucket_id = 'generated-reports' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'generated-reports' and (storage.foldername(name))[1] = auth.uid()::text);
