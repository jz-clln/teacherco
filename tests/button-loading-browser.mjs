// Real button/form components with delayed local actions. No account or data mutations.
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = 'test-results/button-loading';
await mkdir(output, { recursive: true });
const css = (await Promise.all((await readdir('.next/static/css')).map(file => readFile(`.next/static/css/${file}`, 'utf8')))).join('\n');
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PendingSubmit} from '/src/components/ui/pending-submit.tsx';
import {DataControls} from '/src/features/settings/data-controls.tsx';
function App(){return <main style={{padding:32,maxWidth:640}}>
  <form action={async()=>{await new Promise(resolve=>{window.finishSignIn=resolve})}}>
    <PendingSubmit pendingLabel="Signing in...">Sign in</PendingSubmit>
  </form>
  <DataControls classes={[]} retentionMode="keep"/>
</main>}
createRoot(document.getElementById('root')).render(<App/>);`;
const actions = `export const removeStoredFiles=async()=>{await new Promise(resolve=>{window.finishWorking=resolve});return {error:'Test finished without changing data'}};export const deleteAllData=removeStoredFiles;export const deleteClass=removeStoredFiles;export const updateRetention=removeStoredFiles;`;
const server = await createServer({
  configFile: false, esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } },
  server: { host: '127.0.0.1', port: 3195, strictPort: true },
  plugins: [{ name: 'button-loading-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if(id === '/button-fixture.tsx') return '\0button-fixture';
      const normalized=id.replaceAll('\\','/');
      if(normalized.endsWith('/features/settings/actions') || normalized.endsWith('/features/settings/actions.ts') || (id==='./actions' && importer?.replaceAll('\\','/').includes('/features/settings/'))) return '\0button-actions';
      if(normalized.endsWith('/lib/offline/cache')) return '\0button-offline';
    },
    load(id) {
      if(id==='\0button-fixture') return entry;
      if(id==='\0button-actions') return actions;
      if(id==='\0button-offline') return 'export const clearAllOfflineData=async()=>{};export const clearOfflineClass=async()=>{};';
    },
    configureServer(vite) { vite.middlewares.use(async(req,res,next)=>{
      if(req.url!=='/')return next();
      res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/',`<html><head><style>${css}</style></head><body><div id="root"></div><script type="module" src="/button-fixture.tsx"></script></body></html>`));
    }); },
  }],
});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto('http://127.0.0.1:3195');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const signIn=page.getByRole('button',{name:'Signing in...',exact:true});
  await expect(signIn).toBeDisabled();await expect(signIn.locator('img,.tc-loading-spinner')).toHaveCount(0);await expect(signIn).toHaveCSS('opacity','0.5');
  await page.getByRole('button',{name:'Remove stored files',exact:true}).click();
  await page.getByRole('button',{name:'Yes, remove files',exact:true}).click();
  const working=page.getByRole('button',{name:/^Working/});
  await expect(working).toBeDisabled();await expect(working.locator('img,.tc-loading-spinner')).toHaveCount(0);await expect(working).toHaveCSS('opacity','0.5');
  await page.screenshot({path:`${output}/pending-buttons.png`,fullPage:true});
  await page.evaluate(()=>{window.finishSignIn();window.finishWorking();});
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Yes, remove files',exact:true})).toBeEnabled();
  console.log('PASS: Signing in and Working buttons have no logo, become lighter, block repeat clicks, and recover after completion.');
} finally {await browser?.close();await server.close();}
