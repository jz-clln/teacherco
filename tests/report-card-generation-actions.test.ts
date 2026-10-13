// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
const mock=vi.hoisted(()=>({access:vi.fn(),bytes:vi.fn(),rpc:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/features/report-card-templates/data',()=>({templateAccess:mock.access,originalBytes:mock.bytes,sourcePath:(owner:string,id:string)=>`${owner}/${id}/source.xlsx`,TemplateError:class extends Error{constructor(message:string,public status=400){super(message);}}}));
import {generateDownload,digest} from '@/features/report-card-generation/data';
import {previewReportCard,reviewReadiness,saveCompatibility,loadCompatibility} from '@/features/report-card-generation/actions';
import {verifyProfile,valuesForLearner,safeFilename,type GenerationSnapshot} from '@/features/report-card-generation/model';
import {mappingWorkbook,mappingDefinition} from './helpers/mapping-fixture';
import {suggestPeriodBindings} from '@/features/assisted-workflows/bindings';
import {prepareOfflineReport} from '@/features/report-card-generation/offline-package';
import {reportValues,filledPrintSheets,generateOfflineWorkbook} from '@/features/report-card-generation/offline-report';
import type {OfflineRecords} from '../public/offline-records.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {POST as prepareOfflineRoute} from '@/app/api/offline/report-cards/route';
let s:GenerationSnapshot,bytes:Buffer;
it('connects generic periods and previews each bound subject name with its own term grades',async()=>{
  const def=s.mapping.mapping_definition;
  def.periods.forEach((p,i)=>{p.label=`Period ${i+1}`;});
  const otherId=randomUUID(),otherKey=randomUUID();
  s.subjects[0].name='Calculus';s.subjects.push({id:otherId,name:'Language',code:null,category:null,position:2,status:'active'});
  def.subjects.push({key:otherKey,label:'Language row',labelLocation:{sheet:'Front page',address:'B16'},outputs:{period_1:{sheet:'Front page',address:'D16'},period_2:{sheet:'Front page',address:'E16'},period_3:{sheet:'Front page',address:'F16'}}});
  s.profile!.bindings.subjectBindings[otherKey]=otherId;
  const r=await saveCompatibility({sectionId:s.section.id,templateId:s.template.id,mappingId:s.mapping.id,mappingRevision:1,sha:s.template.file_sha256,expectedId:s.profile!.id,revision:1,confirmed:true,bindings:{periodBindings:{},subjectBindings:s.profile!.bindings.subjectBindings}});
  expect(r.ok).toBe(true);
  const saved=mock.rpc.mock.calls.find(([name])=>name==='save_generation_profile')![1].p_bindings;
  expect(saved.periodBindings).toEqual(suggestPeriodBindings(def,s.periods));s.profile!.bindings=saved;
  for(const [i,p] of s.periods.entries())s.entries.push({...s.entries[0],section_subject_id:otherId,period_id:p.id,grade:[81,92,0][i]});
  const result=await previewReportCard({sectionId:s.section.id,templateId:s.template.id,learnerId:s.learners[0].id,digest:digest(s)});
  expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.error);
  const cell=(address:string)=>result.data.preview.cells.find(c=>c.address===address)?.displayValue;
  expect(cell('B15')).toBe('Calculus');expect(cell('D15')).toBe('0');expect(cell('E15')??'').toBe('');
  expect(cell('B16')).toBe('Language');expect(['D16','E16','F16'].map(cell)).toEqual(['81','92','0']);
});
beforeEach(async()=>{vi.resetAllMocks();bytes=await mappingWorkbook();const hash=createHash('sha256').update(bytes).digest('hex'),def=mappingDefinition(hash),teacher=randomUUID(),section=randomUUID(),template=randomUUID(),mapping=randomUUID(),subject=randomUUID(),learner=randomUUID(),periods=def.periods.map((p,i)=>({id:randomUUID(),key:p.key,label:p.label,position:i+1,status:'active'}));
  s={section:{id:section,teacher_id:teacher,name:'Grade 8 Rizal',grade_level:'Grade 8',school_year:'2026-2027',school_name:null,school_id:null,is_adviser:false,status:'active'},template:{id:template,teacher_id:teacher,file_sha256:hash,file_size_bytes:bytes.length,status:'active',storage_path:`${teacher}/${template}/source.xlsx`},mapping:{id:mapping,teacher_id:teacher,template_id:template,mapping_definition:def,revision:1,status:'reviewed'},profile:{id:randomUUID(),teacher_id:teacher,section_id:section,template_id:template,mapping_id:mapping,mapping_revision:1,template_sha256:hash,revision:1,bindings:{periodBindings:Object.fromEntries(periods.map(p=>[p.key,p.id])),subjectBindings:{[def.subjects[0].key]:subject}}},periods,subjects:[{id:subject,name:'Mathematics',position:1,status:'active'}],learners:[{id:learner,display_name:'José <李>'},{id:randomUUID(),display_name:'Ana Santos'}],entries:[{learner_id:learner,section_subject_id:subject,period_id:periods[0].id,grade:0}],adviserName:null} as GenerationSnapshot;
  mock.access.mockResolvedValue({user:{id:teacher},supabase:{rpc:mock.rpc}});mock.bytes.mockResolvedValue(bytes);mock.rpc.mockImplementation(async(name:string)=>({data:name==='report_card_generation_snapshot'?structuredClone(s):s.profile}));
});
function request(learnerId=s.learners[0].id){return {sectionId:s.section.id,templateId:s.template.id,profileId:s.profile!.id,profileRevision:1,digest:digest(s),learnerId,confirmed:true,replaceFormulas:false};}
it.each([['Grade 1','1'],['Grade 12','12'],['7','7'],['Kindergarten','Kindergarten']])('writes grade level %s as %s without changing the Section',async(source,expected)=>{
  s.section.grade_level=source;s.mapping.mapping_definition.fields.grade_level={sheet:'Front page',address:'A4'};
  const preview=await previewReportCard({sectionId:s.section.id,templateId:s.template.id,learnerId:s.learners[0].id,digest:digest(s),print:true});expect(preview.ok).toBe(true);if(!preview.ok)throw new Error(preview.error);
  expect(preview.data.preview.cells.find(c=>c.address==='A4')?.displayValue).toBe(expected);
  expect(preview.data.printSheets[0].cells.find(c=>c.address==='A4')?.displayValue).toBe(expected);
  const output=await generateDownload(request()),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(output.bytes as never);expect(workbook.worksheets[0].getCell('A4').value).toBe(expected);expect(s.section.grade_level).toBe(source);
});
it('uses all four bound quarters and keeps other subjects and learners separate',()=>{
  const d=s.mapping.mapping_definition,key=d.subjects[0].key;
  d.periods.push({key:'period_4',label:'Quarter 4'});
  const fourth={...s.periods[0],id:randomUUID(),label:'Quarter 4',position:4};s.periods.push(fourth);s.profile!.bindings.periodBindings.period_4=fourth.id;
  d.subjects[0].outputs.final_grade={sheet:'Front page',address:'H15'};
  d.subjects[0].outputs.remarks={sheet:'Front page',address:'I15'};
  const entry=s.entries[0];s.entries=s.periods.map((p,i)=>({...entry,period_id:p.id,grade:[70,80,90,100][i]}));
  s.entries.push({...entry,learner_id:s.learners[1].id,grade:1},{...entry,section_subject_id:randomUUID(),grade:2});
  const values=valuesForLearner(s,d,s.learners[0]);expect(values.find(v=>v.id===`subject:${key}:final_grade`)?.value).toBe(85);expect(values.find(v=>v.id===`subject:${key}:remarks`)?.value).toBe('Passed');
});
it.each([[79,86,98,88,'Passed'],[74,74,74,74,'Failed'],[0,0,0,0,'Failed']])('fills subject final and remarks in preview and download for %s/%s/%s',async(a,b,c,final,remarks)=>{
  const d=s.mapping.mapping_definition;
  d.subjects[0].outputs.final_grade={sheet:'Front page',address:'H15'};
  d.subjects[0].outputs.remarks={sheet:'Front page',address:'I15'};
  const entry=s.entries[0];s.entries=s.periods.map((p,i)=>({...entry,period_id:p.id,grade:[a,b,c][i] as number}));
  const before=structuredClone(s.entries);
  const preview=await previewReportCard({sectionId:s.section.id,templateId:s.template.id,learnerId:s.learners[0].id,digest:digest(s),print:true});
  expect(preview.ok).toBe(true);if(!preview.ok)throw new Error(preview.error);
  expect(preview.data.preview.cells.find(c=>c.address==='H15')?.displayValue).toBe(String(final));
  expect(preview.data.printSheets).toHaveLength(1);expect(preview.data.preview.cells.find(c=>c.address==='H15')?.style).toMatchObject({align:'center',vertical:'middle'});expect(preview.data.printSheets[0].cells.find(c=>c.address==='H15')?.style).toMatchObject({align:'center',vertical:'middle'});
  expect(preview.data.preview.cells.find(c=>c.address==='I15')?.displayValue).toBe(remarks);
  const result=await generateDownload(request()),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(result.bytes as never);
  expect(workbook.worksheets[0].getCell('H15').value).toBe(final);expect(workbook.worksheets[0].getCell('I15').value).toBe(remarks);
  expect(s.entries).toEqual(before);
  s.entries.pop();const incomplete=valuesForLearner(s,d,s.learners[0]);
  expect(incomplete.find(v=>v.id.endsWith(':final_grade'))?.value).toBeNull();expect(incomplete.find(v=>v.id.endsWith(':remarks'))?.value).toBeNull();
});
it('readiness shows exact values and missing counts without writes; single XLSX and one ZIP open successfully',async()=>{const r=await reviewReadiness({sectionId:s.section.id,templateId:s.template.id});expect(r.ok&&r.data.missing).toBe(2);expect(r.ok&&r.data.values.find(v=>v.id.endsWith('period_1'))?.value).toBe(0);expect(mock.rpc.mock.calls.every(c=>c[0]==='report_card_generation_snapshot')).toBe(true);const single=await generateDownload(request()),w=new ExcelJS.Workbook();await w.xlsx.load(single.bytes as never);expect(w.worksheets[0].getCell('C8').value).toBe('José <李>');expect(single.filename).toBe('José-李-Report-Card.xlsx');const bulk=await generateDownload(request('all')),zip=await JSZip.loadAsync(bulk.bytes);expect(Object.keys(zip.files)).toHaveLength(2);expect(bulk.mime).toBe('application/zip');expect(createHash('sha256').update(bytes).digest('hex')).toBe(s.template.file_sha256);expect(mock.rpc.mock.calls.every(c=>c[0]==='report_card_generation_snapshot')).toBe(true);});
it.each(['mapping','profile','source','period','subject','archived','draft','foreign','learner','digest'])('rejects stale or unauthorized %s at generation',async kind=>{const p=request();if(kind==='mapping')s.mapping.revision++;if(kind==='profile')s.profile!.revision++;if(kind==='source')s.template.file_sha256='b'.repeat(64);if(kind==='period')s.periods=[];if(kind==='subject')s.subjects=[];if(kind==='archived')s.section.status='archived';if(kind==='draft')s.mapping.status='draft';if(kind==='foreign')s.template.teacher_id=randomUUID();if(kind==='learner')s.learners=[];if(kind==='digest')p.digest='a'.repeat(64);await expect(generateDownload(p)).rejects.toThrow();});
it('requires fresh source bytes, rejects injected manual/LRN payloads and limits bulk before generation',async()=>{mock.bytes.mockRejectedValueOnce(new Error('source mismatch'));await expect(generateDownload(request())).rejects.toThrow(/source mismatch/);await expect(generateDownload({...request(),lrn:'123456789012'})).rejects.toThrow(/Review/);s.learners=Array.from({length:51},()=>({id:randomUUID(),display_name:'Fixture'}));await expect(generateDownload(request('all'))).rejects.toThrow(/batch/);});
it('rejects data edits during export before returning bytes',async()=>{const p=request();let reads=0;mock.rpc.mockImplementation(async()=>{if(++reads===2)s.learners[0].display_name='Changed';return {data:structuredClone(s)};});await expect(generateDownload(p)).rejects.toThrow(/during generation/);});
it('compatibility requires explicit confirmation and exact mapping/profile identities, never auto-matches',async()=>{const input={sectionId:s.section.id,templateId:s.template.id,mappingId:s.mapping.id,mappingRevision:s.mapping.revision,sha:s.template.file_sha256,expectedId:s.profile!.id,revision:1,bindings:s.profile!.bindings,confirmed:true};expect(await saveCompatibility({...input,confirmed:false})).toMatchObject({ok:false});expect(await saveCompatibility({...input,bindings:{periodBindings:{},subjectBindings:{}}})).toMatchObject({ok:false});expect(await saveCompatibility({...input,mappingRevision:2})).toMatchObject({ok:false});expect(await saveCompatibility({...input,lrn:'123456789012'})).toMatchObject({ok:false});expect(await saveCompatibility(input)).toMatchObject({ok:true});expect(mock.rpc).toHaveBeenCalledWith('save_generation_profile',expect.objectContaining({p_expected_id:s.profile!.id,p_revision:1,p_bindings:s.profile!.bindings}));});
it('keeps incomplete subject results and unavailable scalar fields blank; adviser requires Section designation',()=>{const d=s.mapping.mapping_definition;d.fields.lrn={sheet:'Front page',address:'A3'};d.fields.final_average={sheet:'Front page',address:'A4'};d.fields.general_remarks={sheet:'Front page',address:'A5'};d.fields.adviser_name={sheet:'Front page',address:'A6'};d.subjects[0].outputs.final_grade={sheet:'Front page',address:'H15'};d.subjects[0].outputs.remarks={sheet:'Front page',address:'I15'};s.adviserName='Owner';const values=valuesForLearner(s,d,s.learners[0]);for(const suffix of ['lrn','final_average','general_remarks','adviser_name','final_grade','remarks'])expect(values.find(v=>v.id.endsWith(suffix))?.value).toBeNull();expect(()=>verifyProfile({...s,profile:null})).toThrow(/Configure/);expect(safeFilename('../../CON/<name>')).not.toMatch(/[\\/<>]/);});
it('returns saved bindings only, with no automatic same-name selections for a new profile',async()=>{s.profile=null;expect(await loadCompatibility({sectionId:s.section.id,templateId:s.template.id})).toMatchObject({ok:true,data:{profile:null}});});
it('writes optional LRN only to the selected workbook and never sends it to database RPCs or filenames',async()=>{s.mapping.mapping_definition.fields.lrn={sheet:'Front page',address:'A3'};const marker='001234567890',r=await generateDownload({...request(),lrns:{[s.learners[0].id]:marker}}),w=new ExcelJS.Workbook();await w.xlsx.load(r.bytes as never);expect(w.worksheets[0].getCell('A3').value).toBe(marker);expect(r.filename).not.toContain(marker);expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(marker);expect(JSON.stringify(s.profile)).not.toContain(marker);await expect(generateDownload({...request(),lrns:{[randomUUID()]:marker}})).rejects.toThrow(/selected active/);});
it('requires explicit batches and can generate the final learner beyond the first 50',async()=>{s.learners=Array.from({length:51},(_,i)=>({id:randomUUID(),display_name:`Synthetic ${i+1}`}));const r=await generateDownload({...request('all'),batchStart:50}),zip=await JSZip.loadAsync(r.bytes);expect(Object.keys(zip.files)).toEqual(['001-Synthetic-51-Report-Card.xlsx']);expect(r.filename).toContain('51-51');await expect(generateDownload({...request('all'),batchStart:49})).rejects.toThrow(/batches/);});

it('previews filled cells without source writes and rejects stale or foreign learner requests',async()=>{
 const p={sectionId:s.section.id,templateId:s.template.id,learnerId:s.learners[0].id,digest:digest(s)},before=Buffer.from(bytes);
 const r=await previewReportCard(p);expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.error);
 expect(r.data.preview.cells.find(c=>c.address==='C8')?.displayValue).toBe(s.learners[0].display_name);
 expect(r.data.preview.cells.find(c=>c.address==='D15')?.displayValue).toBe('0');expect(bytes.equals(before)).toBe(true);
 expect(mock.rpc.mock.calls.every(c=>c[0]==='report_card_generation_snapshot')).toBe(true);
 expect(await previewReportCard({...p,digest:'f'.repeat(64)})).toMatchObject({ok:false});
 expect(await previewReportCard({...p,learnerId:randomUUID()})).toMatchObject({ok:false});
});

it('prepares a private offline template and generates with unsynced grades while retaining source formats and images',async()=>{
  const w=new ExcelJS.Workbook();await w.xlsx.load(bytes as never);const sheet=w.worksheets[0];
  sheet.getCell('D15').font={name:'Bookman Old Style',size:11,italic:true};sheet.getCell('D15').numFmt='0.00';
  sheet.getCell('D15').border={bottom:{style:'double'}};sheet.getCell('D15').value={formula:'1+1',result:2};
  sheet.getColumn(4).width=17;sheet.getRow(15).height=24;
  const logo=w.addImage({base64:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZAAAAABJRU5ErkJggg==',extension:'png'});sheet.addImage(logo,'A2:B4');
  bytes=Buffer.from(await w.xlsx.writeBuffer());const hash=createHash('sha256').update(bytes).digest('hex');
  s.template.file_sha256=hash;s.template.file_size_bytes=bytes.length;s.template.name='Offline fixture';s.mapping.mapping_definition.templateSha256=hash;s.profile!.template_sha256=hash;
  const def=s.mapping.mapping_definition;def.fields.grade_level={sheet:'Front page',address:'A5'};def.subjects[0].outputs.final_grade={sheet:'Front page',address:'H15'};def.subjects[0].outputs.remarks={sheet:'Front page',address:'I15'};
  mock.bytes.mockResolvedValue(bytes);
  const pack=await prepareOfflineReport(s.section.id,s.template.id);
  expect(pack.snapshot.learners).toEqual([]);expect(pack.snapshot.entries).toEqual([]);expect(pack.formulaTargets).not.toHaveLength(0);
  const section_id=s.section.id,teacher_id=s.section.teacher_id;
  const records={version:1,owner:teacher_id,preparedAt:new Date().toISOString(),queue:[],rows:{sections:[s.section],learners:s.learners,section_enrollments:s.learners.map(l=>({id:randomUUID(),teacher_id,section_id,learner_id:l.id,status:'active'})),section_subjects:s.subjects.map(row=>({...row,section_id,teacher_id})),section_grade_periods:s.periods.map(row=>({...row,section_id,teacher_id})),section_grade_entries:s.periods.map((p,i)=>({id:randomUUID(),teacher_id,section_id,learner_id:s.learners[0].id,section_subject_id:s.subjects[0].id,period_id:p.id,grade:[79,86,98][i],source_type:'manual'}))}} as unknown as OfflineRecords;
  const values=reportValues(pack,records,s.learners[0].id);
  expect(values.find(v=>v.id.endsWith(':final_grade'))?.value).toBe(88);expect(values.find(v=>v.id.endsWith(':remarks'))?.value).toBe('Passed');
  expect(()=>filledPrintSheets(pack,values)).toThrow(/formulas/);
  const previews=filledPrintSheets(pack,values,true),grade=previews.flatMap(p=>p.cells).find(c=>c.address==='D15');expect(grade?.displayValue).toBe('79.00');
  await expect(generateOfflineWorkbook(pack,values)).rejects.toThrow(/formulas/);
  const output=await generateOfflineWorkbook(pack,values,true),result=new ExcelJS.Workbook();await result.xlsx.load(output as never);
  const cell=result.worksheets[0].getCell('D15');expect(cell.value).toBe(79);expect(cell.font.name).toBe('Bookman Old Style');expect(cell.numFmt).toBe('0.00');expect(cell.alignment.horizontal).toBe('center');expect(cell.border.bottom?.style).toBe('double');expect(result.worksheets[0].getImages()).toHaveLength(1);expect(result.worksheets[0].getCell('A5').value).toBe('8');
  const originalZip=await JSZip.loadAsync(bytes),outputZip=await JSZip.loadAsync(output);for(const path of Object.keys(originalZip.files).filter(p=>p.startsWith('xl/media/'))){expect(await outputZip.file(path)?.async('base64')).toBe(await originalZip.file(path)?.async('base64'));}
  expect(()=>reportValues(pack,{...records,owner:randomUUID()},s.learners[0].id)).toThrow(/account/);
  await expect(generateOfflineWorkbook({...pack,workbookHash:'0'.repeat(64)},values,true)).rejects.toThrow(/damaged/);
  await mkdir('test-results/offline-report',{recursive:true});await writeFile('test-results/offline-report/fixture.json',JSON.stringify({pack,records}));
  records.rows.section_grade_entries.pop();expect(reportValues(pack,records,s.learners[0].id).find(v=>v.id.endsWith(':final_grade'))?.value).toBeNull();
});


it('requires owned configuration and a same-origin request for offline preparation, and never caches its response',async()=>{
 const payload={sectionId:s.section.id,templateId:s.template.id};
 const request=(origin:string,body:unknown=payload)=>new Request('https://teacher.example/api/offline/report-cards',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 expect((await prepareOfflineRoute(request('https://other.example'))).status).toBe(403);expect(mock.access).not.toHaveBeenCalled();
 expect((await prepareOfflineRoute(request('https://teacher.example',{...payload,owner:randomUUID()}))).status).toBe(400);
 const response=await prepareOfflineRoute(request('https://teacher.example'));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect((await response.json()).owner).toBe(s.section.teacher_id);
 s.template.teacher_id=randomUUID();expect((await prepareOfflineRoute(request('https://teacher.example'))).status).toBe(403);
});
it('rejects changes during offline template preparation',async()=>{
 let calls=0;mock.rpc.mockImplementation(async()=>{if(++calls===2)s.mapping.revision++;return {data:structuredClone(s)};});
 await expect(prepareOfflineReport(s.section.id,s.template.id)).rejects.toThrow(/changed/);
});
