// Opt-in: production UI plus real authenticated RPC/RLS smoke, temporary accounts only.
import { strict as assert } from 'node:assert';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from '@playwright/test';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0];
assert.equal(ref,process.env.GRADEBOOK_TEST_PROJECT_REF,'Verify the intended project explicitly');
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
const base=process.env.GRADEBOOK_TEST_URL??'http://127.0.0.1:3327';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const output='test-results/section-gradebook';mkdirSync(output,{recursive:true});
const users=[];let browser;
async function checked(promise,label){const r=await promise;assert.ok(!r.error,`${label}: ${r.error?.code??'failed'}`);return r.data;}
async function user(role='teacher'){
  const email=`gradebook-${randomUUID()}@teacherco-test.invalid`,password=randomBytes(32).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ok(!created.error&&created.data.user);const id=created.data.user.id;users.push(id);
  await checked(admin.from('profiles').update({access_status:'active',onboarding_completed:true,role}).eq('id',id),'profile');return {id,email,password};
}
try {
  const teacher=await user(),other=await user('admin');
  const sid=randomUUID(),cid=randomUUID(),ana=randomUUID(),ben=randomUUID(),outsider=randomUUID();
  const sections=[sid,...Array.from({length:3},()=>randomUUID())];
  await checked(admin.from('sections').insert(sections.map((id,i)=>({id,teacher_id:teacher.id,name:i?'Preset test '+i:'Rizal Afternoon — community learning group',grade_level:'Grade 8',school_year:'2026-2027',is_adviser:true}))),'sections');
  await checked(admin.from('classes').insert({id:cid,teacher_id:teacher.id,section_id:sid,name:'Mathematics class',subject:'Mathematics',grade_level:'Grade 8',school_year:'2026-2027'}),'class');
  await checked(admin.from('learners').insert([{id:ana,teacher_id:teacher.id,display_name:'Ana Cruz'},{id:ben,teacher_id:teacher.id,display_name:'Ben De los Santos with a long family name'},{id:outsider,teacher_id:teacher.id,display_name:'Ana Cruz'}]),'learners');
  await checked(admin.from('section_enrollments').insert([ana,ben].map(learner_id=>({teacher_id:teacher.id,section_id:sid,learner_id}))),'Section roster');
  await checked(admin.from('class_enrollments').insert([ana,ben,outsider].map(learner_id=>({class_id:cid,learner_id}))),'class roster');
  const assessments=['written_work','performance_task','assessment'].map((component,i)=>({id:randomUUID(),class_id:cid,title:['Term 1 Written Work','Term 1 Performance Task','Term 1 Summative Test'][i],kind:'mixed',source:'manual',term:1,component,total_points:100}));
  await checked(admin.from('assessments').insert(assessments),'assessments');
  await checked(admin.from('submissions').insert(assessments.flatMap(a=>[ana,ben,outsider].map(learner_id=>({assessment_id:a.id,learner_id,score:90,max_score:100,review_status:'confirmed'})))),'scores');
  await checked(admin.from('teacher_term_grades').insert([ana,ben,outsider].map((learner_id,i)=>({class_id:cid,learner_id,term:1,term_grade:89+i}))),'printed grades');
  await checked(admin.from('attendance_entries').insert({class_id:cid,learner_id:ana,attendance_date:'2026-10-05',status:'present'}),'attendance');
  const snapshot=()=>checked(admin.rpc('class_record_snapshot',{p_class_id:cid}),'class snapshot');let before=await snapshot();
  const jar=new Map();const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar.values()],setAll:cookies=>{for(const c of cookies)jar.set(c.name,c);}}});
  assert.ok(!(await auth.auth.signInWithPassword({email:teacher.email,password:teacher.password})).error);
  const otherAuth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});assert.ok(!(await otherAuth.auth.signInWithPassword({email:other.email,password:other.password})).error);
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([...jar.values()].map(c=>({name:c.name,value:c.value,url:base,sameSite:'Lax'})));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function visit(id=sid){const response=await page.goto(`${base}/sections/${id}/grades`,{waitUntil:'networkidle'});assert.equal(response.status(),200);await expect(page.getByText('Something went wrong')).toHaveCount(0);assert.equal(errors.length,0);}
  async function confirm(label){const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:label,exact:true}).click();await expect(dialog).not.toBeVisible({timeout:25000});}
  async function widths(name){for(const width of [320,360,390,430,768,1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${name} overflow at ${width}`);await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});}await page.setViewportSize({width:390,height:844});}
  await visit();await expect(page.getByRole('heading',{name:'Set up Grade Book',exact:true})).toBeVisible();await widths('first-setup');
  await page.getByLabel('3 Terms',{exact:true}).check();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Mathematics · Mathematics class',{exact:true}).check();await page.getByRole('button',{name:'Add selected subjects',exact:true}).click();
  await expect(page.getByLabel('Mathematics · Mathematics class — subject already listed',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Add subject manually',exact:true}).click();await page.getByLabel('Subject name',{exact:true}).nth(1).fill('English from another teacher');await page.getByLabel('Code (optional)',{exact:true}).nth(1).fill('ENG');
  await widths('manage-setup');await page.getByRole('button',{name:'Save setup',exact:true}).click();await confirm('Save setup');await expect(page.getByRole('heading',{name:'Grade Book',exact:true})).toBeVisible({timeout:20000});
  let periods=await checked(admin.from('section_grade_periods').select('*').eq('section_id',sid).order('position'),'periods');assert.equal(periods.length,3);
  const subjects=await checked(admin.from('section_subjects').select('*').eq('section_id',sid).order('position'),'subjects');assert.equal(subjects.length,2);const subject=subjects[0].id,period=periods[0].id;
  const entries=()=>checked(admin.from('section_grade_entries').select('*').eq('section_id',sid),'entries');
  await page.getByRole('button',{name:'Enter grades',exact:true}).click();await page.getByLabel('Ana Cruz grade',{exact:true}).fill('101');await page.getByRole('button',{name:'Review & save',exact:true}).click();await expect(page.locator('p[role=alert]')).toContainText('0 to 100');assert.equal((await entries()).length,0);
  await page.getByLabel('Ana Cruz grade',{exact:true}).fill('84.5');await widths('manual-entry');await page.getByRole('button',{name:'Review & save',exact:true}).click();await confirm('Save grades');await expect(page.getByRole('button',{name:'Enter grades',exact:true})).toBeVisible();
  let saved=await entries();assert.equal(saved.length,1);assert.equal(saved[0].grade,84.5);assert.equal(saved[0].source_type,'manual');assert.deepEqual(await snapshot(),before);
  async function preview(){await page.getByRole('button',{name:'Import / Refresh from Class',exact:true}).click();await page.getByLabel('Linked class',{exact:true}).selectOption(cid);await page.getByLabel('Grade source',{exact:true}).selectOption('printed');await page.getByRole('button',{name:'Review grades',exact:true}).click();await expect(page.getByRole('heading',{name:'Review changes',exact:true})).toBeVisible({timeout:25000});}
  await preview();await expect(page.getByText('Not in active Section roster',{exact:true})).toHaveCount(1);await expect(page.getByText('Printed and calculated grades differ. Using printed grade.',{exact:true})).toHaveCount(3);assert.deepEqual(await entries(),saved);await widths('import-review');
  await page.getByRole('button',{name:'Import 1 grades',exact:true}).click();await confirm('Import grades');await expect(page.getByRole('button',{name:'Enter grades',exact:true})).toBeVisible();saved=await entries();assert.equal(saved.find(e=>e.learner_id===ana).grade,84.5);assert.equal(saved.find(e=>e.learner_id===ben).grade,90);assert.equal(saved.length,2);
  await preview();await page.getByLabel('Manual value differs from class. Replace this manual value.',{exact:true}).check();await page.getByRole('button',{name:'Import 1 grades',exact:true}).click();await confirm('Import grades');await expect(page.getByRole('button',{name:'Enter grades',exact:true})).toBeVisible();saved=await entries();assert.equal(saved.find(e=>e.learner_id===ana).grade,89);assert.equal(saved.find(e=>e.learner_id===ana).source_type,'teacherco_class');assert.deepEqual(await snapshot(),before);await widths('gradebook');
  // Source changes between review and confirmation cannot slip into the reviewed write.
  await checked(admin.from('teacher_term_grades').update({term_grade:92}).eq('class_id',cid).eq('learner_id',ana),'source change');before=await snapshot();await preview();
  await checked(admin.from('teacher_term_grades').update({term_grade:93}).eq('class_id',cid).eq('learner_id',ana),'newer source change');before=await snapshot();
  await page.getByRole('button',{name:'Import 1 grades',exact:true}).click();await confirm('Import grades');await expect(page.locator('p[role=alert]')).toContainText('changed');assert.equal((await entries()).find(e=>e.learner_id===ana).grade,89);
  await page.getByRole('button',{name:'Review grades',exact:true}).click();await expect(page.getByText('Change to 93',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Import 1 grades',exact:true}).click();await confirm('Import grades');await expect(page.getByRole('button',{name:'Enter grades',exact:true})).toBeVisible();assert.deepEqual(await snapshot(),before);
  // Explicit destination mapping: class Term 1 goes into Grade Book Term 2.
  await page.getByLabel('Period for entry or import',{exact:true}).selectOption(periods[1].id);await preview();await page.getByRole('button',{name:'Import 2 grades',exact:true}).click();await confirm('Import grades');await expect(page.getByRole('button',{name:'Enter grades',exact:true})).toBeVisible();assert.equal((await entries()).filter(e=>e.period_id===periods[1].id).length,2);
  // Real RPC rollback and access checks under ordinary authenticated sessions.
  const current=(await entries()).find(e=>e.learner_id===ana&&e.period_id===period);
  const invalid=await auth.rpc('save_section_grades',{p_section:sid,p_subject:subject,p_period:period,p_rows:[{learner_id:ana,grade:80,expected_updated_at:current.updated_at},{learner_id:ben,grade:101,expected_updated_at:(await entries()).find(e=>e.learner_id===ben&&e.period_id===period).updated_at}]});assert.ok(invalid.error);assert.equal((await entries()).find(e=>e.id===current.id).grade,93);
  for(const table of ['section_grade_periods','section_subjects','section_grade_entries'])assert.equal((await checked(otherAuth.from(table).select('id').eq('section_id',sid),'other admin read')).length,0);
  assert.ok((await otherAuth.rpc('save_section_grades',{p_section:sid,p_subject:subject,p_period:period,p_rows:[{learner_id:ana,grade:1,expected_updated_at:current.updated_at}]})).error);
  for(const state of ['pending','suspended']){await checked(admin.from('profiles').update({access_status:state}).eq('id',teacher.id),'access state');for(const table of ['section_grade_periods','section_subjects','section_grade_entries'])assert.equal((await checked(auth.from(table).select('id').eq('section_id',sid),'inactive read')).length,0);assert.ok((await auth.rpc('save_section_grades',{p_section:sid,p_subject:subject,p_period:period,p_rows:[{learner_id:ana,grade:1,expected_updated_at:current.updated_at}]})).error);}
  await checked(admin.from('profiles').update({access_status:'active'}).eq('id',teacher.id),'restore access');
  const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});assert.ok((await anon.from('section_grade_entries').select('id')).error);
  // Other presets and custom labels are saved through the actual UI.
  for(const [index,preset,count] of [[1,'4 Quarters',4],[2,'Custom',2],[3,'2 Semesters',2]]){await visit(sections[index]);await page.getByLabel(preset,{exact:true}).check();await page.getByRole('button',{name:'Continue',exact:true}).click();if(preset==='Custom'){await page.getByLabel('Period 1',{exact:true}).fill('Midyear');await page.getByLabel('Period 2',{exact:true}).fill('Final');}await page.getByRole('button',{name:'Save setup',exact:true}).click();await confirm('Save setup');await expect(page.getByRole('heading',{name:'Grade Book',exact:true})).toBeVisible();assert.equal((await checked(admin.from('section_grade_periods').select('id').eq('section_id',sections[index]),'preset count')).length,count);}
  await visit();await page.getByRole('button',{name:'Manage periods & subjects',exact:true}).click();await page.getByLabel('Period 1',{exact:true}).fill('Midyear reviewed grades');await page.getByRole('button',{name:'Move Midyear reviewed grades down',exact:true}).click();await page.getByRole('button',{name:'Move English from another teacher up',exact:true}).click();await page.getByRole('button',{name:'Save setup',exact:true}).click();await confirm('Save setup');await expect(page.getByRole('heading',{name:'Grade Book',exact:true})).toBeVisible();
  periods=await checked(admin.from('section_grade_periods').select('*').eq('section_id',sid).order('position'),'reordered periods');assert.equal(periods[1].id,period);assert.equal(periods[1].label,'Midyear reviewed grades');assert.equal((await entries()).length,4);
  await checked(admin.from('section_enrollments').update({status:'inactive'}).eq('section_id',sid).eq('learner_id',ana),'inactive learner');await visit();await page.getByLabel('Subject',{exact:true}).selectOption(subject);await page.getByLabel('Show inactive learners, subjects and periods',{exact:true}).check();await expect(page.getByText('Ana Cruz · Inactive',{exact:true}).last()).toBeVisible();assert.equal((await entries()).length,4);
  await checked(admin.from('sections').update({status:'archived'}).eq('id',sid),'archive');await visit();await expect(page.getByText('This Section is archived. Its Grade Book is read-only until you reactivate it.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Enter grades',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Manage periods & subjects',exact:true})).toHaveCount(0);await widths('archived');
  assert.deepEqual(await snapshot(),before);assert.equal((await checked(admin.from('class_record_sync_versions').select('id').eq('class_id',cid),'sync history')).length,0);
  await checked(auth.from('classes').update({section_id:null}).eq('id',cid),'unlink class');assert.equal((await entries()).length,4);await checked(auth.from('classes').delete().eq('id',cid),'delete source');saved=await entries();assert.equal(saved.length,4);assert.ok(saved.every(e=>e.source_class_id===null&&e.source_snapshot?.calculation==='printed'));
  assert.equal(errors.length,0);console.log('Grade Book browser and remote smoke passed: all presets, local subjects, manual validation/save, explicit term mapping, source preview, UUID matching, manual protection, stale review, atomic rollback, RLS, archive/history, class deletion and unchanged class snapshots.');
  console.log('Six Grade Book surfaces passed 320, 360, 390, 430, 768, 1024 and 1440px overflow checks. Screenshots saved locally.');
} catch (error) {
  console.error('Grade Book smoke failed:', error.message);
  throw error;
} finally {
  await browser?.close();
  for(const id of users.reverse()){
    let error;
    for(let attempt=0;attempt<3;attempt++){const deleted=await admin.auth.admin.deleteUser(id);error=deleted.error;if(!error)break;await new Promise(resolve=>setTimeout(resolve,1000));}
    assert.ok(!error,`Cleanup failed for temporary fixture ${id}: ${error?.code??'unknown'}`);
  }
  console.log('Temporary Grade Book test accounts and fixtures removed.');
}
