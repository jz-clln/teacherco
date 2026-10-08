'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sectionAccess,requireSection,SectionError } from '@/features/sections/action-helpers';
import { readGradebook } from '@/features/gradebook/data';
import { parseWorkbook } from '@/features/report-card-templates/workbook';
import { fileValidation } from '@/features/report-card-templates/model';
import { formatSchema,gradePreview } from './grades';
import { extractGrades,formatFingerprint } from './grade-files';
import { normalize,workbookCells } from './structure';
import { routeGradeFile } from './grade-routing';
import { periodCode } from './labels';
const selectionSchema=z.object({sectionId:z.uuid(),subjectId:z.uuid().nullable(),periodId:z.uuid().nullable(),periodBindings:z.record(z.string(),z.uuid()).default({}),format:formatSchema.nullable(),resolutions:z.record(z.string(),z.uuid()).default({}),sectionConfirmed:z.boolean().default(false)}).strict();
async function inspect(form:FormData,allowAI=true){
  const p=selectionSchema.parse(JSON.parse(String(form.get('selection')))),context=await sectionAccess(),section=await requireSection(context.supabase,context.user.id,p.sectionId);
  if(section.status!=='active')throw new SectionError('Reactivate this Section first.');
  const file=form.get('file');if(!(file instanceof File)||file.size>8*1024*1024||fileValidation(file.name,file.size,file.type))throw new SectionError('Choose an .xlsx file up to 8 MiB.');
  const bytes=Buffer.from(await file.arrayBuffer()),sha=createHash('sha256').update(bytes).digest('hex'),workbook=await parseWorkbook(bytes),fingerprint=formatFingerprint(workbook),book=await readGradebook(context.supabase,context.user.id,p.sectionId);
  const stored=await context.supabase.from('grade_import_formats').select('definition').eq('teacher_id',context.user.id).eq('fingerprint',fingerprint).maybeSingle();
  const subjects=book.subjects.filter(s=>s.status==='active'),periods=book.periods.filter(p=>p.status==='active');
  const routed=await routeGradeFile(workbook,file.name,stored.data?.definition,p,subjects,periods,allowAI);
  const {format,source,subjectId,periodId,periodBindings}=routed,columns=format?.gradeColumns??(format?[format.gradeColumn]:[]);
  const rows=columns.flatMap(column=>{const destination=periodBindings[column];if(!format||!subjectId||!destination)return [];return gradePreview(extractGrades(workbook,{...format,gradeColumn:column}),book.learners.filter(l=>l.status==='active'),book.entries,subjectId,destination,p.resolutions).map(row=>({...row,sourceRow:row.row,row:columns.length>1?column*10000+row.row:row.row,column,periodId:destination,periodLabel:periods.find(p=>p.id===destination)!.label}));});
  let sectionMismatch:string|null=null;
  if(format){const cells=workbookCells(workbook,format.sheet);for(const label of cells.filter(c=>c.row<format.startRow&&normalize(c.displayValue)==='section')){const value=cells.find(c=>c.row===label.row&&c.column===label.column+1&&c.type==='text')?.displayValue.trim();if(value&&normalize(value)!==normalize(section.name)&&normalize(value)!==normalize(`${section.grade_level} ${section.name}`))sectionMismatch=value;}}
  const selection={...p,subjectId,periodId,periodBindings,format},digest=createHash('sha256').update(JSON.stringify({sha,selection,rows,learners:book.learners,subjects,periods,sectionMismatch})).digest('hex');
  return {context,periodLabels:Object.fromEntries(periods.map(p=>[p.id,p.label])),selection,rows,digest,sha,fingerprint,source,sectionMismatch,formatAvailable:!stored.error,sheets:workbook.metadata.sheets.map(s=>({name:s.name,index:s.index,rows:s.rowExtent,columns:s.columnExtent}))};
}
export async function analyzeGradeFile(form:FormData){
  try{const {context:_,...result}=await inspect(form);void _;return {ok:true as const,data:result};}catch(error){return {ok:false as const,error:error instanceof SectionError?error.message:'Could not read this grade file. Check its layout and retry.'};}
}
export async function applyGradeFile(form:FormData){
  try{
    const checked=z.object({digest:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true),useIncoming:z.array(z.number().int()),skip:z.array(z.number().int()),remember:z.boolean()}).strict().parse(JSON.parse(String(form.get('approval'))));
    const current=await inspect(form,false),p=current.selection;
    if(current.digest!==checked.digest)throw new SectionError('The file, roster or grades changed. Analyze again before importing.');
    if(!p.format||!p.subjectId||(p.format.gradeColumns??[p.format.gradeColumn]).some(c=>!p.periodBindings[c]))throw new SectionError('Choose the file layout, subject and period.');
    if(current.sectionMismatch&&!p.sectionConfirmed)throw new SectionError('Confirm the destination Section before importing this file.');
    const selected=current.rows.filter(r=>!checked.skip.includes(r.row)&&!['unchanged','missing'].includes(r.kind));
    if(selected.some(r=>!r.learnerId||r.incoming==null||['invalid','duplicate','match'].includes(r.kind)||r.kind==='conflict'&&!checked.useIncoming.includes(r.row)))throw new SectionError('Resolve each issue or keep the current value before importing.');
    if(!selected.length)throw new SectionError('No new grades selected.');
    const groups=Object.entries(p.periodBindings).map(([column,periodId])=>({periodId,rows:selected.filter(r=>r.column===Number(column)).map(r=>({learner_id:r.learnerId,grade:r.incoming,expected_updated_at:r.current?.updated_at??null}))})).filter(g=>g.rows.length);
    const result=groups.length===1?await current.context.supabase.rpc('import_external_section_grades',{p_section:p.sectionId,p_subject:p.subjectId,p_period:groups[0].periodId,p_sha:current.sha,p_rows:groups[0].rows}):await current.context.supabase.rpc('import_external_grade_columns',{p_section:p.sectionId,p_subject:p.subjectId,p_sha:current.sha,p_groups:groups});
    if(result.error)throw new SectionError('Grades were not imported. Refresh the preview and try again.');
    let remembered=false;
    if(checked.remember){const result=await current.context.supabase.from('grade_import_formats').upsert({teacher_id:current.context.user.id,fingerprint:current.fingerprint,definition:formatSchema.parse({...p.format,periodHints:Object.entries(p.periodBindings).flatMap(([column,id])=>{const code=periodCode(current.periodLabels[id]??'');return code===null?[]:[{column:Number(column),code}];})}),updated_at:new Date().toISOString()},{onConflict:'teacher_id,fingerprint'});remembered=!result.error;}
    revalidatePath(`/sections/${p.sectionId}/grades`);revalidatePath(`/sections/${p.sectionId}/inbox`);
    return {ok:true as const,data:{count:selected.length,remembered}};
  }catch(error){return {ok:false as const,error:error instanceof SectionError?error.message:'Could not import this file. Analyze again before retrying.'};}
}
