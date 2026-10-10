import {chooseOption} from './helpers/custom-select-browser.mjs';
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
  const languageClass=randomUUID(),mathSubject=randomUUID(),languageSubject=randomUUID(),termId=randomUUID();
  await checked(admin.from('classes').insert({id:languageClass,teacher_id:teacher.id,section_id:sid,name:'Language class',subject:'Language',grade_level:'Grade 8',school_year:'2026-2027'}),'language class');
  await checked(admin.from('class_enrollments').insert([ana,ben].map(learner_id=>({class_id:languageClass,learner_id}))),'language roster');
  await checked(admin.from('teacher_term_grades').insert([ana,ben].map(learner_id=>({class_id:languageClass,learner_id,term:1,term_grade:92}))),'language grades');
  await checked(auth.rpc('save_section_gradebook_setup',{p_section:sid,p_periods:[{id:termId,key:'period_1',label:'Term 1',position:1,status:'active'}],p_subjects:[{id:mathSubject,name:'Mathematics',code:null,category:null,position:1,status:'active'},{id:languageSubject,name:'Language',code:null,category:null,position:2,status:'active'},{id:randomUUID(),name:'Science',code:null,category:null,position:3,status:'active'}],p_expected:[]}),'gradebook setup');
  await page.goto(`${base}/sections/${sid}/grades`);await expect(page.getByRole('heading',{name:'Grade Book',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Subject',exact:true})).toHaveCount(0);
  async function importGrades(classId,subjectName){
    await page.getByRole('button',{name:'Import / Refresh from Class',exact:true}).click();
    await chooseOption(page.getByRole('combobox',{name:'Linked class',exact:true}),classId);
    await expect(page.getByRole('status')).toContainText(`${subjectName} / Term 1`);
    await chooseOption(page.getByRole('combobox',{name:'Grade source',exact:true}),'printed');
    await page.getByRole('button',{name:'Review grades',exact:true}).click();
    await page.getByRole('button',{name:'Import 2 grades',exact:true}).click();
    const dialog=page.getByRole('dialog');await expect(dialog).toContainText(`${subjectName} / Term 1`);
    await dialog.getByRole('button',{name:'Import grades',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Grade Book',exact:true})).toBeVisible({timeout:30000});
  }
  await importGrades(cid,'Mathematics');
  const mathBefore=await checked(auth.from('section_grade_entries').select('*').eq('section_subject_id',mathSubject).order('learner_id'),'first subject grades');
  await importGrades(languageClass,'Language');
  const mathAfter=await checked(auth.from('section_grade_entries').select('*').eq('section_subject_id',mathSubject).order('learner_id'),'preserved first subject');
  assert.deepEqual(mathAfter,mathBefore,'second subject import must not change first subject grades or timestamps');
  const language=await checked(auth.from('section_grade_entries').select('*').eq('section_subject_id',languageSubject),'second subject grades');assert.equal(language.length,2);assert.ok(language.every(e=>Number(e.grade)===92));
  await expect(page.getByRole('rowheader',{name:'Science',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Show more subjects for Ana Cruz',exact:true}).click();
  await expect(page.getByRole('rowheader',{name:'Science',exact:true})).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Search learners',exact:true}).fill('Ben');
  await expect(page.getByRole('rowheader',{name:'Ana Cruz',exact:true})).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search learners',exact:true}).fill('');
  await expect(page.getByRole('button',{name:'Show fewer subjects for Ana Cruz',exact:true})).toHaveAttribute('aria-expanded','true');
  assert.equal(await page.locator(`#learner-grades-${ana}`).evaluate(e=>getComputedStyle(e).borderTopWidth),'2px');
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.screenshot({path:`${output}/search-layout-${width}.png`,fullPage:true});if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)))console.log(await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,classes:e.className,width:e.getBoundingClientRect().width}))})));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await expect(page.getByRole('columnheader',{name:'Subject',exact:true})).toBeVisible();await page.screenshot({path:`${output}/all-subjects-${width}.png`,fullPage:true});}
  assert.deepEqual(await snapshot(),before);assert.equal(errors.length,0);
  console.log('PASS: sequential subject imports preserve the first subject exactly; destination matching, confirmation, learner-by-subject display, responsive layout and unchanged class records.');
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
