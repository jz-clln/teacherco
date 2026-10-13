import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const baseURL=process.env.LANDING_TEST_URL||'http://127.0.0.1:3336';
const browser=await chromium.launch();
try{
 const context=await browser.newContext({baseURL,viewport:{width:1440,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'});
 await context.addInitScript(()=>{window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();event.stopImmediatePropagation();});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const install=page.getByRole('button',{name:'Install for Windows',exact:true});await install.waitFor();assert.equal(await page.getByRole('link',{name:/Download Android APK/}).count(),0);
 await install.click();await page.getByRole('dialog',{name:'Install TeacherCo on your PC'}).waitFor();assert(await page.getByRole('dialog').getByText(/Microsoft Edge or Google Chrome/).isVisible());
 await mkdir('test-results/windows-install',{recursive:true});await page.screenshot({path:'test-results/windows-install/desktop.png'});
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert(await install.evaluate(el=>el===document.activeElement));
 await page.setViewportSize({width:390,height:650});await install.click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/windows-install/narrow.png'});
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS: Windows landing CTA, platform visibility, manual install dialog, Escape/focus, and narrow layout. Native OS installation is covered by browser-provided UI, not automated here.');
}finally{await browser.close();}
