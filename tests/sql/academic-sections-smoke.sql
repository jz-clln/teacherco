-- Run ONLY on the explicitly verified target after 0016. Every fixture rolls back.
begin;
set local statement_timeout = '30s';
create temporary table section_test_ids as select gen_random_uuid() teacher,
  gen_random_uuid() other_teacher, gen_random_uuid() section, gen_random_uuid() class,
  gen_random_uuid() unlinked_class, gen_random_uuid() learner, gen_random_uuid() other_learner;
grant select on section_test_ids to authenticated, anon, service_role;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Smoke failed: %', label; end if; end $$;
create function pg_temp.must_fail(sql text, expected_state text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Unexpected error state % (wanted %)', sqlstate, expected_state;
  end;
  raise exception 'Expected rejection did not occur: %', expected_state;
end $$;

select pg_temp.check_true((select count(*)=2 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('sections','section_enrollments') and c.relrowsecurity), 'RLS enabled');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select teacher, teacher::text || '@teacherco-test.invalid', now(), '{}'::jsonb from section_test_ids
union all select other_teacher, other_teacher::text || '@teacherco-test.invalid', now(), '{}'::jsonb from section_test_ids;
update public.profiles set access_status='active' where id in (select teacher from section_test_ids union select other_teacher from section_test_ids);
insert into public.sections(id,teacher_id,name,grade_level,school_year,school_id)
select section,teacher,'Temporary smoke Section','Grade 8','2026-2027','123' from section_test_ids;
insert into public.classes(id,teacher_id,name,subject,grade_level,school_year,school_id,section_id)
select class,teacher,'Temporary smoke class','Math','Grade 8','2026-2027','123',section from section_test_ids
union all select unlinked_class,teacher,'Temporary unlinked class','English','Grade 8','2026-2027','123',null from section_test_ids;
insert into public.learners(id,teacher_id,first_name,last_name,display_name)
select learner,teacher,'Ana','Cruz','Ana Cruz' from section_test_ids
union all select other_learner,other_teacher,'Other','Learner','Other Learner' from section_test_ids;
insert into public.section_enrollments(teacher_id,section_id,learner_id)
select teacher,section,learner from section_test_ids;
insert into public.class_enrollments(class_id,learner_id) select class,learner from section_test_ids;
set constraints all immediate;

select set_config('request.jwt.claim.sub',teacher::text,true) from section_test_ids;
set local role authenticated;
select pg_temp.check_true((select count(*)=1 from public.sections where id=(select section from section_test_ids)), 'active owner Section');
select pg_temp.check_true((select count(*)=1 from public.section_enrollments where section_id=(select section from section_test_ids)), 'active owner roster');
-- Same projection as current class overview; null Section links remain valid.
select pg_temp.check_true((select count(*)=2 from (select id,name,subject,grade_level,school_year,benchmark,school_name,school_id,adviser,section
  from public.classes where teacher_id=(select teacher from section_test_ids)) c), 'existing class query');
select pg_temp.check_true((select section_id is null from public.classes where id=(select unlinked_class from section_test_ids)), 'unlinked class');
select pg_temp.must_fail('delete from public.section_enrollments', '42501');
select pg_temp.must_fail('update public.classes set grade_level=''Grade 9'' where id=(select class from section_test_ids)', '23514');
select pg_temp.must_fail('update public.sections set school_year=''2027-2028'' where id=(select section from section_test_ids)', '23514');
select pg_temp.must_fail('update public.sections set school_id=''999'' where id=(select section from section_test_ids)', '23514');
select pg_temp.must_fail('delete from public.sections where id=(select section from section_test_ids)', '23503');
select pg_temp.must_fail('delete from public.learners where id=(select learner from section_test_ids)', '23503');
select pg_temp.must_fail('insert into public.section_enrollments(teacher_id,section_id,learner_id) select teacher,section,other_learner from section_test_ids', '23503');
reset role;

set local role anon;
select pg_temp.must_fail('select * from public.sections', '42501');
select pg_temp.must_fail('select * from public.section_enrollments', '42501');
reset role;

update public.profiles set role='admin' where id=(select other_teacher from section_test_ids);
select set_config('request.jwt.claim.sub',other_teacher::text,true) from section_test_ids;
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.sections where id=(select section from section_test_ids)), 'no admin ownership bypass');
select pg_temp.check_true((select count(*)=0 from public.section_enrollments where section_id=(select section from section_test_ids)), 'no admin roster bypass');
reset role;

select set_config('request.jwt.claim.sub',teacher::text,true) from section_test_ids;
update public.profiles set access_status='suspended' where id=(select teacher from section_test_ids);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.sections where id=(select section from section_test_ids)), 'suspended blocked');
select pg_temp.check_true((select count(*)=0 from public.section_enrollments where section_id=(select section from section_test_ids)), 'suspended roster blocked');
select pg_temp.must_fail('insert into public.sections(teacher_id,name,grade_level,school_year) select teacher,''Forbidden'',''Grade 8'',''2026-2027'' from section_test_ids', '42501');
reset role;
update public.profiles set access_status='active' where id=(select teacher from section_test_ids);

-- Existing service-only sync RPC, with one imported activity/score and a version.
set local role service_role;
select public.apply_class_record_sync(teacher,class,gen_random_uuid(),(public.class_record_snapshot(class)->>'revision')::bigint,
  '{"filename":"temporary-smoke.xlsx"}'::jsonb,
  jsonb_build_object('changes', '[{"kind":"new_score","label":"Smoke score","before":"Blank","after":"8"}]'::jsonb,
    'learners',jsonb_build_array(jsonb_build_object('key','ana','id',learner,'first_name','Ana','last_name','Cruz')),
    'activities','[{"key":"ww1","id":null,"title":"Term 1 · Written Work 1","total":10,"term":1,"component":"written_work"}]'::jsonb,
    'scores','[{"learner":"ana","activity":"ww1","score":8,"max":10}]'::jsonb,
    'grades','[]'::jsonb,'attendance','[]'::jsonb,'termPossible',null)) from section_test_ids;
select pg_temp.check_true((select (public.class_record_snapshot(class)->'scores'->0->>'score')::numeric=8 from section_test_ids), 'sync score');
reset role;
create temporary table section_test_before as select public.class_record_snapshot(class) snapshot from section_test_ids;
update public.sections set status='archived',is_adviser=true where id=(select section from section_test_ids);
update public.section_enrollments set status='inactive' where section_id=(select section from section_test_ids);
select pg_temp.check_true((select public.class_record_snapshot(class)=(select snapshot from section_test_before) from section_test_ids), 'Section changes preserve sync snapshot/revision');
select pg_temp.check_true((select count(*)=1 from public.class_record_sync_versions where class_id=(select class from section_test_ids)), 'class-scoped history');

-- Deferred non-cascading FKs permit the intentional account cascade.
set constraints all deferred;
delete from auth.users where id in (select teacher from section_test_ids union select other_teacher from section_test_ids);
set constraints all immediate;
select pg_temp.check_true((select count(*)=0 from public.sections where id=(select section from section_test_ids)), 'account cascade');
select pg_temp.check_true((select count(*)=0 from public.section_enrollments where section_id=(select section from section_test_ids)), 'account roster cleanup');
select 'academic-sections remote smoke passed; all fixtures rolled back' result;
rollback;
