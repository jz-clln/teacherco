// Real page/component UI, local synthetic reads and disabled server actions.
import { createServer } from "vite";
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const output = "test-results/design-system";
await mkdir(output, { recursive: true });
const css = (await Promise.all((await readdir(".next/static/css")).map(f => readFile(`.next/static/css/${f}`, "utf8")))).join("\n");
const fonts = [...css.matchAll(/@font-face\{font-family:Poppins;[^}]+\}/g)].map(m => m[0]).join("\n");
const fixture = '/tests/browser-fixtures/design-system-data.ts';
const modules = {
  "next/link": 'import React from "react"; export default function Link({children,href,prefetch,replace,scroll,...props}){return React.createElement("a",{...props,href},children)}; export const useLinkStatus=()=>({pending:false});',
  "next/image": 'import React from "react"; export default function Image({priority,fill,unoptimized,...props}){return React.createElement("img",props)}',
  "next/navigation": `export const usePathname=()=>{const s=new URLSearchParams(location.search).get('screen')??'overview';return ['overview','learners','assessments','records'].includes(s)?'/classes/class'+(s==='overview'?'':'/'+s):'/'+s}; export const useRouter=()=>({refresh(){window.__refreshed=true}});export const redirect=()=>{throw Error('Unexpected redirect')};export const notFound=()=>{throw Error('Unexpected missing fixture')};`,
  "@/lib/supabase/server": `export {createClient,getCurrentUser} from '${fixture}';`,
  "@/features/classes/overview-data": `import {classroom,learners} from '${fixture}';export const ownedClass=async()=>({classroom});export const classRoster=async()=>learners;`,
  "@/features/exams/queries": `import {assessments,folders} from '${fixture}';export const getAssessmentsOverview=async()=>assessments;export const getCheckFolders=async()=>folders;`,
  "@/features/ask/queries": `import {classes,state} from '${fixture}';export const getAskClassOptions=async()=>({classes,error:state==='error'});`,
  "@/features/grading/queries": `export const getGradingClassSettings=async()=>[];`,
};
const server = await createServer({
  configFile: false, esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } },
  server: { host: "127.0.0.1", port: 3192, strictPort: true },
  plugins: [{ name: "design-fixture", enforce: "pre",
    async resolveId(id, importer) {
      if(id.startsWith('\0fixture:'))return id;
      const normalized=id.replaceAll('\\','/');
      const key=Object.keys(modules).find(k=>id===k || (k.startsWith('@/') && normalized.endsWith('/src/'+k.slice(2))));
      if(key)return `\0fixture:${key}`;
      // Stub every server action module at its boundary; no imports of auth/database credentials.
      if(/(?:^|[/.-])actions(?:\.ts)?$/.test(id)) {
        const file=(path.isAbsolute(id)?id:path.resolve(path.dirname(importer??''),id)).replace(/\.ts$/,'')+'.ts';
        const source=await readFile(file,'utf8');
        const names=[...source.matchAll(/export\s+async\s+function\s+(\w+)/g)].map(m=>m[1]);
        const actionKey=`actions-${Buffer.from(file).toString('hex')}`;
        modules[actionKey]=names.map(n=>n==='updateClassDetails'?`export async function ${n}(input){window.__savedClass=input;return {ok:true}}`:`export async function ${n}(){return {error:'Fixture: action disabled'}}`).join(';');
        return `\0fixture:${actionKey}`;
      }
    },
    load(id) { if(id.startsWith('\0fixture:'))return modules[id.slice(9)]; },
    configureServer(vite) { vite.middlewares.use(async (req,res,next)=>{
      if(req.url?.startsWith('/_next/static/media/')){try{res.setHeader('Content-Type','font/woff2');res.end(await readFile(path.join('.next/static/media',path.basename(req.url))));}catch{res.statusCode=404;res.end();}return;}
      if(req.url?.split('?')[0]!=='/')return next();
      res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}:root{--font-brand:Poppins}body{font-family:Poppins,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/tests/browser-fixtures/design-system.tsx"></script></body></html>`));
    }); },
  }],
});
await server.listen();let browser;
try {
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  page.on('console',m=>{if(m.type()==='error')console.error(m.text())});
  page.on('response',r=>{if(r.status()>=400)console.error(r.status(),r.url())});
  for(const width of [320,360,390,430,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    for(const screen of ['today','classes','overview','learners','assessments','records','check','reports','ask','settings']){
      await page.goto(`http://127.0.0.1:3192/?screen=${screen}&long=1`);await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);
      const overflow=await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && !e.closest('.tc-tabs,[class*="overflow-x-auto"]')).slice(0,4).map(e=>e.outerHTML.slice(0,160)));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${screen} ${width}px overflow: ${overflow.join(',')}`);
      assert.ok(await page.locator('main h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=28));
      const morph=await page.evaluate(()=>[...document.querySelectorAll('header,nav,.tc-group,.teacherco-card')].some(e=>getComputedStyle(e).backdropFilter!=='none'));
      assert.equal(morph,false,`${screen}: unexpected backdrop filter`);
      if(width<768){assert.equal(await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link').count(),5);}
      await page.screenshot({path:`${output}/${screen}-${width}.png`,fullPage:true});
    }
    console.log(`${width}px: all 10 screens, long names, typography, solid surfaces, overflow passed`);
  }
  await page.setViewportSize({width:320,height:900});await page.goto('http://127.0.0.1:3192/?screen=overview');
  for(const label of ['Take attendance','Sync','Import','Export']){const el=page.getByRole('link',{name:label,exact:true});const b=await el.boundingBox();assert.ok(b.height>=44 && b.width>=44,`${label} touch target`);}
  const more=page.getByRole('button',{name:'More',exact:true});await more.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');assert.equal(await page.getByRole('link',{name:'Grading settings'}).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await more.evaluate(e=>e===document.activeElement),true);
  await page.getByRole('button',{name:'Account',exact:true}).click();const group=page.getByRole('group',{name:'Account actions'});assert.equal(await group.getByRole('link',{name:'Settings'}).getAttribute('href'),'/settings');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByLabel('School name',{exact:true}).fill('Updated school');await page.getByRole('button',{name:'Save changes'}).click();await page.waitForFunction(()=>window.__savedClass?.schoolName==='Updated school'&&window.__refreshed);
  for(const state of ['empty','unchanged','loading','error']){await page.goto(`http://127.0.0.1:3192/?screen=overview&state=${state}`);await page.locator('main h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/overview-${state}.png`,fullPage:true});}
  for(const screen of ['today','classes','learners','assessments','check','reports','ask','settings']){
    await page.goto(`http://127.0.0.1:3192/?screen=${screen}&state=empty`);await page.locator('main h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${screen}: empty-state overflow`);await page.screenshot({path:`${output}/${screen}-empty.png`,fullPage:true});
  }
  for(const screen of ['today','ask']){await page.goto(`http://127.0.0.1:3192/?screen=${screen}&state=error`);await page.locator('main h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1:3192/?screen=overview&long=1');await page.locator('main h1').waitFor();await page.evaluate(()=>document.documentElement.style.fontSize='20px');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'large-text overflow');
  const button=page.getByRole('button',{name:'Account',exact:true});assert.equal(await button.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await button.click();assert.equal(await page.getByRole('group',{name:'Account actions'}).evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.screenshot({path:`${output}/large-text-reduced-motion.png`,fullPage:true});
  assert.deepEqual(errors,[]);console.log('Visible utilities, menu keyboard, edit dialog, states, large text, reduced motion and browser runtime checks passed.');
}finally{await browser?.close();await server.close();}
