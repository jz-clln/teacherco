import {chooseOption} from './helpers/custom-select-browser.mjs';
// Opt-in production browser + remote smoke. Synthetic blank workbooks, temporary accounts.
import {strict as assert} from 'node:assert';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,mkdirSync} from 'node:fs';
import nextEnv from '@next/env';
import ExcelJS from 'exceljs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium,expect} from '@playwright/test';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0];
assert.equal(ref,process.env.TEMPLATE_TEST_PROJECT_REF);assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
const base=process.env.TEMPLATE_TEST_BASE_URL??'http://127.0.0.1:3328',bucket='report-card-templates',output='test-results/report-card-templates';mkdirSync(output,{recursive:true});
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),users=[];let browser;
async function checked(p,label){const r=await p;assert.ok(!r.error,`${label}: ${r.error?.code??r.error?.message??'failed'}`);return r.data;}
async function user(role='teacher'){const email=`template-${randomUUID()}@teacherco-test.invalid`,password=randomBytes(32).toString('base64url'),data=await checked(admin.auth.admin.createUser({email,password,email_confirm:true}),'create fixture');users.push(data.user.id);await checked(admin.from('profiles').update({access_status:'active',onboarding_completed:true,role}).eq('id',data.user.id),'profile');return {id:data.user.id,email,password};}
try{
  const teacher=await user(),other=await user('admin'),jar=new Map();
  const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar.values()],setAll:cookies=>{for(const c of cookies)jar.set(c.name,c);}}});
  await checked(auth.auth.signInWithPassword({email:teacher.email,password:teacher.password}),'sign in');
  const otherAuth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});await checked(otherAuth.auth.signInWithPassword({email:other.email,password:other.password}),'other sign in');
  const workbook=new ExcelJS.Workbook(),front=workbook.addWorksheet('Front page');workbook.addWorksheet('Back page');workbook.addWorksheet('Lookup',{state:'veryHidden'});
  front.mergeCells('C8:F8');front.getCell('C8').value='Blank report card';front.getCell('C8').font={bold:true,size:16,color:{argb:'FF1A4D2E'}};front.getCell('C8').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0EA'}};front.getCell('A1').value='<script>window.__bad=1</script>';front.getCell('B2').value={formula:'SUM(1,2)',result:3};front.getCell('A5').value={text:'Inert hyperlink',hyperlink:'https://example.invalid/never-fetch'};front.getCell('H40').value='End of layout';
  const bytes=Buffer.from(await workbook.xlsx.writeBuffer()),hash=createHash('sha256').update(bytes).digest('hex');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([...jar.values()].map(c=>({name:c.name,value:c.value,url:base,sameSite:'Lax'})));
  const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('example.invalid'))external.push(r.url());});
  async function widths(name){for(const width of [320,360,390,430,768,1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} page overflow at ${width}`);await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});}await page.setViewportSize({width:390,height:844});}
  async function upload(){await page.goto(`${base}/report-cards/templates/new`);await page.getByLabel('Template name',{exact:true}).fill('School blank layout');await page.getByLabel('Excel workbook',{exact:true}).setInputFiles({name:'blank.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});await page.getByRole('button',{name:'Upload template',exact:true}).click();}
  await page.goto(`${base}/report-cards/templates`);await expect(page.getByText('Your templates will appear here')).toBeVisible();await widths('empty-list');
  await page.goto(`${base}/report-cards/templates/new`);await widths('upload');await upload();await expect(page.getByRole('heading',{name:'School blank layout',exact:true})).toBeVisible({timeout:30000});await page.goto(base+'/report-cards/templates/'+new URL(page.url()).pathname.split('/')[3]);await expect(page.getByRole('region',{name:'Front page worksheet'})).toBeVisible({timeout:30000});
  const id=new URL(page.url()).pathname.split('/')[3],path=`${teacher.id}/${id}/source.xlsx`;
  async function original(){const blob=await checked(auth.storage.from(bucket).download(path,{cacheNonce:randomUUID()}),'download original');assert.equal(createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'),hash);}
  const row=await checked(auth.from('report_card_templates').select('*').eq('id',id).single(),'template');assert.equal(row.file_sha256,hash);assert.equal(JSON.stringify(row.workbook_metadata).includes('Blank report card'),false);await original();
  await page.getByRole('button',{name:'C8, merged C8:F8: Blank report card',exact:true}).click();await expect(page.getByRole('complementary',{name:'Cell inspector'})).toContainText('Merged range: C8:F8');await widths('viewer');
  await page.getByRole('button',{name:'B2: 3',exact:true}).click();await expect(page.getByRole('complementary',{name:'Cell inspector'})).toContainText('SUM(1,2)');
  await chooseOption(page.getByLabel('Worksheet',{exact:true}),'2');await expect(page.getByRole('region',{name:'Lookup worksheet'})).toBeVisible({timeout:30000});await chooseOption(page.getByLabel('Worksheet',{exact:true}),'0');await page.goto(base+'/report-cards/templates/'+new URL(page.url()).pathname.split('/')[3]);await expect(page.getByRole('region',{name:'Front page worksheet'})).toBeVisible({timeout:30000});assert.equal(await page.evaluate(()=>window.__bad),undefined);assert.deepEqual(external,[]);
  await page.getByText('More template actions',{exact:true}).click();await page.getByRole('button',{name:'Rename',exact:true}).click();await page.getByLabel('Template name',{exact:true}).fill('Renamed layout');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.getByRole('heading',{name:'Renamed layout',exact:true})).toBeVisible();await original();
  async function lifecycle(label){const menu=page.locator('details').filter({has:page.getByText('More template actions',{exact:true})});if(!await menu.evaluate(el=>el.open))await page.getByText('More template actions',{exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:label,exact:true}).click();await expect(dialog).not.toBeVisible({timeout:20000});}
  await lifecycle('Archive template');await expect(page.getByText(/Archived · Read-only preview/)).toBeVisible();await page.reload();await lifecycle('Reactivate template');await original();
  const download=await context.request.get(`${base}/api/report-card-templates/${id}/download`,{maxRedirects:0});assert.equal(download.status(),302);const downloaded=await context.request.get(download.headers().location);assert.equal(createHash('sha256').update(await downloaded.body()).digest('hex'),hash);
  await upload();await expect(page.getByRole('link',{name:'View existing template',exact:true})).toBeVisible({timeout:30000});assert.equal((await checked(auth.from('report_card_templates').select('id'),'duplicate count')).length,1);await widths('duplicate');
  assert.equal((await checked(otherAuth.from('report_card_templates').select('id').eq('id',id),'other admin read')).length,0);assert.ok((await otherAuth.storage.from(bucket).download(path,{cacheNonce:randomUUID()})).error);assert.ok((await auth.storage.from(bucket).upload(path,bytes,{upsert:true})).error);assert.ok((await auth.from('report_card_templates').update({file_sha256:'b'.repeat(64)}).eq('id',id)).error);
  for(const state of ['pending','suspended']){await checked(admin.from('profiles').update({access_status:state}).eq('id',teacher.id),'set status');assert.equal((await checked(auth.from('report_card_templates').select('id'),'inactive rows')).length,0);assert.ok((await auth.storage.from(bucket).download(path,{cacheNonce:randomUUID()})).error);}
  await checked(admin.from('profiles').update({access_status:'active'}).eq('id',teacher.id),'restore');
  await page.goto(`${base}/report-cards/templates/${id}`);await expect(page.getByRole('heading',{name:'Renamed layout'})).toBeVisible();await lifecycle('Delete template');await expect(page.getByText('Your templates will appear here')).toBeVisible({timeout:25000});assert.ok((await auth.storage.from(bucket).download(path,{cacheNonce:randomUUID()})).error);assert.equal((await checked(auth.from('report_card_templates').select('id'),'deleted count')).length,0);
  assert.deepEqual(errors,[]);console.log('PASS: upload, SHA-256 original bytes, merge selection, formulas, hidden sheets, inert text/links, rename/archive/reactivate/download, duplicate cleanup, owner/admin/status isolation, overwrite denial, delete, four surfaces at seven widths.');
}finally{
  await browser?.close();
  for(const id of users.reverse()){
    const folders=await checked(admin.storage.from(bucket).list(id,{limit:1000}),'cleanup list');
    for(const folder of folders){const objects=await checked(admin.storage.from(bucket).list(`${id}/${folder.name}`,{limit:1000}),'cleanup objects');if(objects.length)await checked(admin.storage.from(bucket).remove(objects.map(o=>`${id}/${folder.name}/${o.name}`)),'cleanup storage');}
    let error;for(let n=0;n<3;n++){const result=await admin.auth.admin.deleteUser(id);error=result.error;if(!error)break;}assert.ok(!error,'Temporary account cleanup failed');
  }
  console.log('Temporary template accounts and storage fixtures removed.');
}
