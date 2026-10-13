import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const baseURL=process.env.OFFLINE_TEST_URL||'http://127.0.0.1:3336';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const browser=await chromium.launch();
try{
  // The attendance shell loads the record module without running automatic record preparation.
  const context=await browser.newContext({baseURL,serviceWorkers:'block'});
  await context.addCookies([{name:'teacherco_offline_owner',value:owner,url:baseURL}]);
  await context.route('**/api/attendance/offline?*',route=>route.fulfill({json:{owner,days:[],nextOffset:null}}));
  const cloud={classes:[{id,teacher_id:owner,name:'Original',subject:'Math',grade_level:'1',school_year:'2026',status:'active'}]};
  let holdGet,holdPost,getStarted,postStarted;
  await context.route('**/api/offline/records?*',async route=>{
    const table=new URL(route.request().url()).searchParams.get('table'),snapshot=structuredClone(cloud[table]??[]);
    if(table==='classes'&&holdGet){getStarted();await holdGet;holdGet=null;}
    await route.fulfill({json:{owner,rows:snapshot,nextOffset:null}});
  });
  let fail=false;
  await context.route('**/api/offline/records',async route=>{
    if(fail){await route.abort();return;}
    const op=route.request().postDataJSON();
    if(holdPost){postStarted();await holdPost;holdPost=null;}
    cloud[op.table]=[...(cloud[op.table]??[]).filter(row=>row.id!==op.row.id),op.row];
    await route.fulfill({json:{row:op.row}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto('/offline.html');
  await page.evaluate(async owner=>{await (await import('/offline-records.js')).prepareRecords(owner,true);},owner);
  let releaseGet;
  holdGet=new Promise(resolve=>{releaseGet=resolve;});const getReady=new Promise(resolve=>{getStarted=resolve;});
  await page.evaluate(owner=>{window.pendingRefresh=import('/offline-records.js').then(api=>api.prepareRecords(owner,true));},owner);
  await getReady;
  await page.evaluate(async owner=>{const api=await import('/offline-records.js'),before=(await api.readRecords(owner)).rows.classes[0];await api.saveRecords(owner,[{table:'classes',before,row:{...before,name:'Newer local name'}}]);await api.syncRecords(owner);},owner);
  releaseGet();await page.evaluate(()=>window.pendingRefresh);
  assert.equal(await page.evaluate(async owner=>(await (await import('/offline-records.js')).readRecords(owner)).rows.classes[0].name,owner),'Newer local name');
  // A second edit made while the first request is uploading must also reach the server.
  let releasePost;
  holdPost=new Promise(resolve=>{releasePost=resolve;});const postReady=new Promise(resolve=>{postStarted=resolve;});
  await page.evaluate(async owner=>{const api=await import('/offline-records.js'),before=(await api.readRecords(owner)).rows.classes[0];await api.saveRecords(owner,[{table:'classes',before,row:{...before,name:'First edit'}}]);window.pendingSync=api.syncRecords(owner);},owner);
  await postReady;
  await page.evaluate(async owner=>{const api=await import('/offline-records.js'),before=(await api.readRecords(owner)).rows.classes[0];await api.saveRecords(owner,[{table:'classes',before,row:{...before,name:'Second edit'}}]);},owner);
  releasePost();await page.evaluate(()=>window.pendingSync);assert.equal(cloud.classes[0].name,'Second edit');
  // Failed requests, cache clearing and backup/restore all retain queued changes.
  fail=true;
  await page.evaluate(async owner=>{const api=await import('/offline-records.js'),before=(await api.readRecords(owner)).rows.classes[0];await api.saveRecords(owner,[{table:'classes',before,row:{...before,name:'Waiting to sync'}}]);await api.syncRecords(owner);await api.clearRecords(owner);},owner);
  const backup=await page.evaluate(async owner=>JSON.parse(await (await import('/offline-records.js')).exportRecords(owner)),owner);
  assert.equal(backup.queue.length,1);
  assert.equal(await page.evaluate(async({owner,backup})=>{try{await (await import('/offline-records.js')).restoreRecords(owner,backup);return false;}catch{return true;}},{owner,backup}),true);
  await page.evaluate(async({owner,backup})=>{const api=await import('/offline-records.js');await api.clearRecords(owner,true);await api.restoreRecords(owner,backup);},{owner,backup});
  await page.reload();assert.equal(await page.evaluate(async owner=>(await (await import('/offline-records.js')).readRecords(owner)).rows.classes[0].name,owner),'Waiting to sync');
  assert.equal(await page.evaluate(async({owner,backup})=>{try{await (await import('/offline-records.js')).restoreRecords(owner,{...backup,owner:'44444444-4444-4444-8444-444444444444'});return false;}catch{return true;}},{owner,backup}),true);
  console.log('PASS: refresh/upload races, newer edits during sync, failed upload retention, backup restore and account validation');
  await context.close();
}finally{await browser.close();}
