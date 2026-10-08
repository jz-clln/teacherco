import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import JSZip from 'jszip';
import {templateAccess,originalBytes,sourcePath,TemplateError,type TemplateContext} from '@/features/report-card-templates/data';
import {prepareWriter} from './writer';
import {verifyProfile,valuesForLearner,safeFilename,MAX_BULK_LEARNERS,MAX_ARCHIVE_INPUT_BYTES,MAX_SOURCE_BYTES,MAX_WORKBOOK_BYTES,MAX_OUTPUT_BYTES,ephemeralLrnSchema,learnerBatches,type GenerationSnapshot} from './model';

export const identity=z.object({sectionId:z.uuid(),templateId:z.uuid()}).strict();
export const digest=(s:GenerationSnapshot)=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
export async function snapshot(context:TemplateContext,sectionId:string,templateId:string){
  const {data,error}=await context.supabase.rpc('report_card_generation_snapshot',{p_section:sectionId,p_template:templateId});
  if(error)throw new TemplateError('Report card data is temporarily unavailable. Please retry.');
  if(!data)throw new TemplateError('Choose an active Section and an active template with a reviewed mapping.',403);
  const s=data as GenerationSnapshot;
  if(s.section.id!==sectionId||s.template.id!==templateId||s.section.teacher_id!==context.user.id||s.template.teacher_id!==context.user.id||s.mapping.teacher_id!==context.user.id||s.mapping.template_id!==templateId||s.section.status!=='active'||s.template.status!=='active'||s.mapping.status!=='reviewed'||s.template.storage_path!==sourcePath(context.user.id,templateId))throw new TemplateError('This report card configuration is unavailable.',403);
  if(s.learners.length>500)throw new TemplateError('Report card readiness currently supports up to 500 active learners per Section.');
  if(s.subjects.length>500||s.entries.length>30000)throw new TemplateError('This Section exceeds the initial readiness limit of 500 subjects or 30,000 saved grade cells.');
  return s;
}
export async function loadGeneration(input:unknown){
  const p=identity.safeParse(input);if(!p.success)throw new TemplateError('Choose a Section and template.');
  const context=await templateAccess(),s=await snapshot(context,p.data.sectionId,p.data.templateId);verifyProfile(s);
  if(s.template.file_size_bytes>MAX_SOURCE_BYTES)throw new TemplateError('This workbook exceeds the supported 10 MiB generation size.');
  const bytes=await originalBytes(context,s.template),writer=await prepareWriter(bytes,s.mapping.mapping_definition,s.template.file_sha256);
  return {context,s,writer};
}
export async function generationOptions(sectionId:string){
  const context=await templateAccess(),templates:{id:string;name:string}[]=[];
  for(let offset=0;;offset+=100){const {data,error}=await context.supabase.from('report_card_templates').select('id,name,report_card_template_mappings!inner(status)').eq('teacher_id',context.user.id).eq('status','active').eq('report_card_template_mappings.status','reviewed').order('name').order('id').range(offset,offset+99);if(error||!data)throw new TemplateError('Could not load reviewed templates.');templates.push(...data.map(t=>({id:t.id,name:t.name})));if(data.length<100)break;}
  return {sectionId,templates};
}
export const generationRequest=identity.extend({profileId:z.uuid(),profileRevision:z.number().int().positive(),digest:z.string().regex(/^[a-f0-9]{64}$/),learnerId:z.union([z.uuid(),z.literal('all')]),confirmed:z.literal(true),replaceFormulas:z.boolean(),batchStart:z.number().int().nonnegative().optional(),lrns:ephemeralLrnSchema.optional()}).strict();
export async function generateDownload(input:unknown){
  const checked=generationRequest.safeParse(input);if(!checked.success)throw new TemplateError('Review readiness and confirm the Grade Book before generation.');
  const p=checked.data,{context,s,writer}=await loadGeneration({sectionId:p.sectionId,templateId:p.templateId});
  const profile=verifyProfile(s);
  if(profile.id!==p.profileId||profile.revision!==p.profileRevision||digest(s)!==p.digest)throw new TemplateError('Section data or configuration changed. Review readiness again.',409);
  const batch=learnerBatches(s.learners.length,s.template.file_size_bytes).find(b=>b.start===(p.batchStart??0));
  if(p.learnerId==='all'&&s.learners.length>(batch?.count??0)&&p.batchStart===undefined)throw new TemplateError('Choose an explicit learner batch before generating this Section.');
  if(p.learnerId==='all'&&!batch)throw new TemplateError('Review the learner batches again.');
  const learners=p.learnerId==='all'?s.learners.slice(batch!.start,batch!.start+batch!.count):s.learners.filter(l=>l.id===p.learnerId);
  if(p.lrns&&(!writer.definition.fields.lrn||Object.keys(p.lrns).some(id=>!learners.some(l=>l.id===id))))throw new TemplateError('Temporary LRN inputs must belong to the selected active learners and a mapped LRN field.');
  if(!learners.length)throw new TemplateError('Select an active Section learner.');
  if(learners.length>MAX_BULK_LEARNERS)throw new TemplateError(`Bulk generation supports up to ${MAX_BULK_LEARNERS} active learners. Generate individual cards for larger Sections.`);
  if(writer.formulaTargets.length&&!p.replaceFormulas)throw new TemplateError('Confirm replacement of mapped Excel formulas before generation.');
  const archive=p.learnerId==='all'?new JSZip():null;let result:Buffer=Buffer.alloc(0),total=0;
  for(const [index,learner]of learners.entries()){
    const bytes=await writer.write(valuesForLearner(s,writer.definition,learner,p.lrns),p.replaceFormulas);total+=bytes.length;
    if(bytes.length>MAX_WORKBOOK_BYTES||total>MAX_ARCHIVE_INPUT_BYTES)throw new TemplateError('This export exceeds the initial download limit. Use a smaller template or generate individual cards.');
    if(archive)archive.file(`${String(index+1).padStart(3,'0')}-${safeFilename(learner.display_name)}-Report-Card.xlsx`,bytes);else result=Buffer.from(bytes);
  }
  if(archive)result=await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  if(result.length>MAX_OUTPUT_BYTES)throw new TemplateError('This download exceeds 50 MiB. Generate a smaller batch or an individual card.');
  // Detect edits made during the export, including account/roster/mapping changes.
  const current=await templateAccess();if(current.user.id!==context.user.id||digest(await snapshot(current,p.sectionId,p.templateId))!==p.digest)throw new TemplateError('Data changed during generation. Review readiness again.',409);
  return {bytes:result,context,revalidate:async()=>{const fresh=await templateAccess();if(fresh.user.id!==context.user.id||digest(await snapshot(fresh,p.sectionId,p.templateId))!==p.digest)throw new TemplateError('The Grade Book or report-card configuration changed after review. Review again before generating.',409);},filename:archive?`${safeFilename(s.section.name)}-Report-Cards${s.learners.length>learners.length?`-${batch!.start+1}-${batch!.start+batch!.count}`:''}.zip`:`${safeFilename(learners[0].display_name)}-Report-Card.xlsx`,mime:archive?'application/zip':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
}
