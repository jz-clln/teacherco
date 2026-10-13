import {mockOfflineAccess} from './helpers/offline-access.mjs';
// Production browser test with synthetic records and mocked cloud APIs only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const baseURL=process.env.OFFLINE_TEST_URL||'http://127.0.0.1:3336';
const owner='11111111-1111-4111-8111-111111111111';
const browser=await chromium.launch();
try{
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900},acceptDownloads:true});
  await mockOfflineAccess(context,owner);
  await context.addCookies([{name:'teacherco_offline_owner',value:owner,url:baseURL}]);
  const cloud={},calls=[],errors=[];let conflict=false;
  await context.route('**/api/offline/records?*',route=>{
    const table=new URL(route.request().url()).searchParams.get('table');return route.fulfill({json:{owner,rows:cloud[table]??[],nextOffset:null}});
  });
  await context.route('**/api/offline/records',route=>{
    const op=route.request().postDataJSON();calls.push(op);
    if(conflict)return route.fulfill({status:409,json:{error:'This record changed online.',current:{...op.row,name:'Online name'}}});
    cloud[op.table]=[...(cloud[op.table]??[]).filter(r=>r.id!==op.row.id),op.row];
    return route.fulfill({json:{row:op.row}});
  });
  await context.route('**/api/attendance/offline?*',route=>route.fulfill({json:{owner,days:[],nextOffset:null}}));
  await context.route('**/api/attendance/sync',route=>{
    const payload=route.request().postDataJSON();assert(cloud.classes.some(c=>c.id===payload.classId));assert(cloud.class_enrollments.length);
    return route.fulfill({json:{ok:true,marks:payload.marks,updatedAt:new Date().toISOString()}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
  console.log('Opening workspace');await page.goto('/offline-workspace.html');
  await page.waitForFunction(async owner=>(await (await import('/offline-records.js')).readRecords(owner)).preparedAt,owner);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  console.log('Prepared. Going offline');await context.setOffline(true);
  await page.goto('/classes'); // Any uncached private navigation opens the public offline workspace.
  await page.getByRole('heading',{name:'Offline workspace',exact:true}).waitFor();
  await page.getByRole('button',{name:'Create class',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Maya');await page.getByLabel('Subject',{exact:true}).fill('Calculus');
  await page.getByLabel('Grade level').fill('1');await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.getByRole('button',{name:/Calculus.*Maya/}).click();
  await page.getByRole('button',{name:'Add learner',exact:true}).click();
  await page.getByLabel('First name').fill('Ana');await page.getByLabel('Last name').fill('Cruz');await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.getByRole('button',{name:'Add activity',exact:true}).click();
  await page.getByLabel('Activity title').fill('Term 1 Written Work');await page.getByLabel('Highest possible score').fill('20');
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.getByLabel('Ana Cruz',{exact:true}).fill('18');await page.getByRole('button',{name:'Save scores on device'}).click();
  await page.waitForFunction(async owner=>(await (await import('/offline-records.js')).readRecords(owner)).queue.length===5,owner);
  assert.equal(calls.length,0);
  await page.reload();await page.getByRole('button',{name:/Calculus.*Maya/}).click();
  assert.equal(await page.getByLabel('Ana Cruz',{exact:true}).inputValue(),'18');
  await page.getByRole('button',{name:'Section Grade Book',exact:true}).click();
  await page.getByRole('button',{name:'Create Section',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Advisory Maya');await page.getByLabel('Grade level').fill('1');
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.getByRole('button',{name:/Advisory Maya.*Grade/}).click();
  await page.getByRole('button',{name:'Enroll',exact:true}).click();
  await page.getByRole('button',{name:'Add subject',exact:true}).click();await page.getByLabel('Subject name').fill('Calculus');
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.getByRole('button',{name:'Add period',exact:true}).click();await page.getByLabel('Period label').fill('Term 1');
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.getByLabel('Ana Cruz Term 1',{exact:true}).fill('89');await page.getByRole('button',{name:'Save grades on device',exact:true}).click();
  await page.waitForFunction(async owner=>(await (await import('/offline-records.js')).readRecords(owner)).queue.length===10,owner);
  await page.reload();await page.getByRole('button',{name:'Section Grade Book',exact:true}).click();
  await page.getByRole('button',{name:/Advisory Maya.*Grade/}).click();assert.equal(await page.getByLabel('Ana Cruz Term 1',{exact:true}).inputValue(),'89');
  await page.getByRole('button',{name:'Classes',exact:true}).click();await page.getByRole('button',{name:/Calculus.*Maya/}).click();
  await page.getByRole('button',{name:'Take attendance',exact:true}).click();
  try{await page.waitForURL('**/offline.html?*');}catch(e){console.error('Attendance navigation',page.url(),await page.locator('#status').textContent());throw e;}
  await page.getByLabel('Ana Cruz').selectOption('absent');await page.getByRole('button',{name:'Save attendance on device'}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Saved on device'));
  await page.goto('/offline-workspace.html');
  await context.setOffline(false);
  await page.evaluate(async owner=>{const api=await import('/offline-records.js');await api.syncRecords(owner);await (await import('/offline-attendance.js')).syncAttendance(owner);},owner);
  assert.deepEqual(calls.slice(0,5).map(c=>c.table),['classes','learners','class_enrollments','assessments','submissions']);
  assert.equal(cloud.submissions[0].score,18);assert.equal(cloud.section_grade_entries[0].grade,89);
  assert.equal(await page.evaluate(async owner=>(await (await import('/offline-attendance.js')).listDays(owner)).filter(d=>d.pending).length,owner),0);
  // A stale tab cannot replace a newer local edit. Refresh cannot erase queued work.
  await context.setOffline(true);
  await page.evaluate(async owner=>{
    const api=await import('/offline-records.js'),state=await api.readRecords(owner),before=state.rows.classes[0];
    await api.saveRecords(owner,[{table:'classes',before,row:{...before,name:'Device name'}}]);
    let rejected=false;try{await api.saveRecords(owner,[{table:'classes',before,row:{...before,name:'Stale tab'}}]);}catch{rejected=true;}
    if(!rejected)throw new Error('Stale tab was accepted');await api.clearRecords(owner);
    if(!(await api.readRecords(owner)).queue.length)throw new Error('Cache clear erased pending work');
  },owner);
  conflict=true;await context.setOffline(false);
  await page.evaluate(async owner=>{await (await import('/offline-records.js')).syncRecords(owner);},owner);
  await page.getByRole('button',{name:'Sync & backup',exact:true}).click();
  await page.getByRole('heading',{name:'Review a change'}).waitFor();
  await page.getByText('Online name',{exact:true}).waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup'}).click();assert.match((await download).suggestedFilename(),/TeacherCo-offline/);
  await mkdir('test-results/offline-workspace',{recursive:true});
  await page.screenshot({path:'test-results/offline-workspace/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/offline-workspace/mobile.png',fullPage:true});
  await context.addCookies([{name:'teacherco_offline_owner',value:'44444444-4444-4444-8444-444444444444',url:baseURL}]);
  await context.setOffline(true);await page.reload();assert.equal(await page.getByText('Ana Cruz',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: offline navigation, create/edit/reload, scores, dependent attendance sync, conflicts, stale-tab protection, backups, account isolation and mobile layout');
  await context.close();
}finally{await browser.close();}
