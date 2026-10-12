// Run against a production server. Uses synthetic local records and a mocked sync API.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const baseURL=process.env.OFFLINE_TEST_URL||'http://127.0.0.1:3336';
const owner='11111111-1111-4111-8111-111111111111',classId='22222222-2222-4222-8222-222222222222',learner='33333333-3333-4333-8333-333333333333';
const browser=await chromium.launch();
try{
  const context=await browser.newContext({baseURL});
  await context.addCookies([{name:'teacherco_offline_owner',value:owner,url:baseURL}]);
  await context.route('**/api/attendance/offline?*',route=>route.fulfill({json:{owner,days:[],nextOffset:null}}));
  let calls=0,serverMarks={},fail=false;
  await context.route('**/api/attendance/sync',async route=>{
    calls++;if(fail){await route.abort();return;}
    const payload=route.request().postDataJSON();assert.equal(payload.owner,owner);
    serverMarks={...serverMarks,...payload.marks};await route.fulfill({json:{ok:true,marks:serverMarks,updatedAt:new Date().toISOString()}});
  });
  const page=await context.newPage();
  await page.goto('/offline.html');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(async({owner,classId,learner})=>{
    const api=await import('/offline-attendance.js');
    await api.cacheDay({owner,classId,className:'Maya',subject:'Calculus',date:'2026-01-01',learners:[{id:learner,name:'Ana Cruz'}],marks:{},baseline:{},updatedAt:null});
  },{owner,classId,learner});
  await context.setOffline(true);
  await page.goto('/classes/'+classId+'/attendance');
  const offlineFonts=await page.evaluate(async()=>{
    await document.fonts.ready;
    return {body:getComputedStyle(document.body).fontFamily,button:getComputedStyle(document.querySelector('button')).fontFamily,loaded:await Promise.all([400,600,700].map(async weight=>(await document.fonts.load(`${weight} 16px Poppins`)).length>0))};
  });
  assert.match(offlineFonts.body,/Poppins/);assert.match(offlineFonts.button,/Poppins/);assert.deepEqual(offlineFonts.loaded,[true,true,true]);
  await page.getByRole('button',{name:'Maya · Calculus',exact:true}).click();
  await page.getByLabel('Ana Cruz').selectOption('absent');
  await page.getByRole('button',{name:'Save attendance on device'}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Saved on device'));
  assert.equal(calls,0);
  await page.reload();
  await page.getByRole('button',{name:'Maya · Calculus',exact:true}).click();
  assert.equal(await page.getByLabel('Ana Cruz').inputValue(),'absent');
  await context.setOffline(false);
  await page.evaluate(async owner=>{await (await import('/offline-attendance.js')).syncAttendance(owner);},owner);
  assert.equal(serverMarks[learner],'absent');
  assert.equal(await page.evaluate(async owner=>(await (await import('/offline-attendance.js')).listDays(owner)).filter(d=>d.pending).length,owner),0);
  // Failed uploads survive reload; refreshing server data cannot replace pending marks.
  fail=true;
  await page.evaluate(async owner=>{const api=await import('/offline-attendance.js'),day=(await api.listDays(owner)).find(d=>Object.keys(d.marks).length);await api.queueDay(day,Object.fromEntries(day.learners.map(l=>[l.id,'late'])));await api.syncAttendance(owner);await api.cacheDay({...day,marks:{},baseline:{}});},owner);
  assert.equal(await page.evaluate(async({owner,learner})=>(await (await import('/offline-attendance.js')).listDays(owner)).find(d=>d.pending).marks[learner],{owner,learner}),'late');
  // Clearing cached classes preserves queued attendance.
  await page.evaluate(async owner=>{await (await import('/offline-attendance.js')).clearDays(owner);},owner);
  assert.equal(await page.evaluate(async owner=>(await (await import('/offline-attendance.js')).listDays(owner)).length,owner),1);
  // A different signed-in account cannot upload the original teacher's queue.
  await context.addCookies([{name:'teacherco_offline_owner',value:'44444444-4444-4444-8444-444444444444',url:baseURL}]);
  const before=calls;
  await page.evaluate(async owner=>{await (await import('/offline-attendance.js')).syncAttendance(owner);},owner);assert.equal(calls,before);
  await page.reload();assert.equal(await page.getByRole('button',{name:'Maya · Calculus',exact:true}).count(),0);
  await context.addCookies([{name:'teacherco_offline_owner',value:owner,url:baseURL}]);
  await context.unroute('**/api/attendance/sync');
  let release,started;
  const reached=new Promise(resolve=>{started=resolve;});
  const delayed=new Promise(resolve=>{release=resolve;});
  await context.route('**/api/attendance/sync',async route=>{
    const payload=route.request().postDataJSON();started();await delayed;
    await route.fulfill({json:{ok:true,marks:payload.marks,updatedAt:new Date().toISOString()}});
  });
  await page.evaluate(owner=>{import('/offline-attendance.js').then(api=>{window.testSync=api.syncAttendance(owner);});},owner);
  await reached;
  await page.evaluate(async owner=>{const api=await import('/offline-attendance.js'),day=(await api.listDays(owner))[0];await api.queueDay(day,Object.fromEntries(day.learners.map(l=>[l.id,'excused'])));},owner);
  release();await page.evaluate(()=>window.testSync);
  const inflight=await page.evaluate(async owner=>(await (await import('/offline-attendance.js')).listDays(owner))[0],owner);
  assert.equal(inflight.pending,true);assert.equal(inflight.marks[learner],'excused');assert.equal(inflight.baseline[learner],'late');
  await context.unroute('**/api/attendance/sync');
  await context.route('**/api/attendance/sync',route=>route.fulfill({status:409,json:{ok:false,error:'Attendance changed online.'}}));
  await page.evaluate(async owner=>{await (await import('/offline-attendance.js')).syncAttendance(owner);},owner);
  const conflict=await page.evaluate(async owner=>(await (await import('/offline-attendance.js')).listDays(owner))[0],owner);
  assert.equal(conflict.pending,true);assert.equal(conflict.error,'Attendance changed online.');assert.equal(conflict.marks[learner],'excused');
  console.log('PASS: offline navigation, reload persistence, automatic sync, retry retention, cache clearing and account isolation');
  console.log('PASS: edits during an upload stay queued; conflicting online marks preserve the device copy');
  await context.close();
}finally{await browser.close();}
