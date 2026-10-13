import {mockOfflineAccess} from './helpers/offline-access.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const baseURL=process.env.OFFLINE_TEST_URL||'http://127.0.0.1:3336';
const owner='11111111-1111-4111-8111-111111111111';
const browser=await chromium.launch();
try{
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  await mockOfflineAccess(context,owner);
  await context.addCookies([{name:'teacherco_offline_owner',value:owner,url:baseURL}]);
  await context.route('**/api/attendance/offline?*',route=>route.fulfill({json:{owner,nextOffset:null,days:['Calculus','General Mathematics'].map((subject,i)=>({owner,classId:`22222222-2222-4222-8222-22222222222${i}`,className:'Grade 1 Maya',subject,date:'2026-10-12',learners:[{id:'33333333-3333-4333-8333-333333333333',name:'Ana Cruz'}],marks:{},baseline:{},updatedAt:null}))}}));
  const page=await context.newPage();await page.goto('/offline.html');
  await page.getByRole('button',{name:'Grade 1 Maya · Calculus',exact:true}).waitFor();
  await page.getByRole('button',{name:'Grade 1 Maya · General Mathematics',exact:true}).waitFor();
  const bounds=await page.locator('main').boundingBox();assert(bounds.width<=760);assert(bounds.height<560);
  const cards=await page.locator('.class-grid .class-choice').all();assert.equal(cards.length,2);
  assert.equal(Math.round((await cards[0].boundingBox()).y),Math.round((await cards[1].boundingBox()).y));
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Grade 1 Maya · General Mathematics',exact:true}).waitFor();assert.equal(await page.locator('.class-grid .class-choice').count(),2);
  await page.evaluate(()=>document.fonts.ready);
  await mkdir('test-results/offline-layout',{recursive:true});await page.screenshot({path:'test-results/offline-layout/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/offline-layout/mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS: both subjects prepare automatically, persist offline, compact desktop grid and mobile layout without overflow');
  await context.close();
}finally{await browser.close();}
