'use server';
import {z} from 'zod';
import {suggestPeriodBindings} from '@/features/assisted-workflows/bindings';
import {templateAccess,TemplateError} from '@/features/report-card-templates/data';
import {WorkbookError} from '@/features/report-card-templates/package';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {originalBytes} from '@/features/report-card-templates/data';
import {validateDefinition} from '@/features/report-card-mappings/model';
import {identity,snapshot,loadGeneration,digest} from './data';
import {prepareWriter} from './writer';
import {bindingsSchema,validateBindings,valuesForLearner,verifyProfile,learnerBatches,outputStatus,type GenerationProfile} from './model';
import { ephemeralLrnSchema, MAX_WORKBOOK_BYTES } from './model';
import { MAX_ROWS, MAX_COLUMNS } from '@/features/report-card-templates/model';

export async function previewReportCard(input:unknown){try{
  const p=identity.extend({learnerId:z.uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),lrns:ephemeralLrnSchema.optional(),sheet:z.number().int().min(0).max(19).default(0),row:z.number().int().min(1).max(MAX_ROWS).default(1),column:z.number().int().min(1).max(MAX_COLUMNS).default(1)}).strict().parse(input);
  const {context,s,writer}=await loadGeneration({sectionId:p.sectionId,templateId:p.templateId});
  if(digest(s)!==p.digest)throw new Error('Report card data changed. Preview report cards again.');
  const learner=s.learners.find(l=>l.id===p.learnerId);
  if(!learner)throw new Error('Choose an active Section learner.');
  if(p.lrns&&(!writer.definition.fields.lrn||Object.keys(p.lrns).some(id=>id!==learner.id)))throw new Error('Temporary LRNs must belong to the preview learner and a mapped LRN field.');
  // Read-only simulation: download formula replacement still needs consent.
  const bytes=await writer.write(valuesForLearner(s,writer.definition,learner,p.lrns),true);
  if(bytes.length>MAX_WORKBOOK_BYTES)throw new Error('This workbook is too large to preview.');
  const workbook=await parseWorkbook(bytes);
  let preview=workbook.sheet(p.sheet,p.row,p.column,true);
  for(let rows=30;rows>=1&&Buffer.byteLength(JSON.stringify(preview),'utf8')>2*1024*1024;rows=Math.floor(rows/2))preview=workbook.sheet(p.sheet,p.row,1,true,rows);
  if(Buffer.byteLength(JSON.stringify(preview),'utf8')>2*1024*1024)throw new Error('This worksheet is too detailed to preview.');
  const fresh=await templateAccess();
  if(fresh.user.id!==context.user.id||digest(await snapshot(fresh,p.sectionId,p.templateId))!==p.digest)throw new Error('Report card data changed. Preview report cards again.');
  return {ok:true as const,data:{metadata:workbook.metadata,preview}};
}catch(e){return failure(e);}}

function failure(error:unknown){return {ok:false as const,error:error instanceof Error&&(error instanceof TemplateError||error instanceof WorkbookError||error.constructor===Error)?error.message:'Could not complete this action. Please retry.'};}
export async function loadCompatibility(input:unknown){try{const p=identity.parse(input),c=await templateAccess(),s=await snapshot(c,p.sectionId,p.templateId);await prepareWriter(await originalBytes(c,s.template),s.mapping.mapping_definition,s.template.file_sha256);return {ok:true as const,data:{definition:s.mapping.mapping_definition,mappingId:s.mapping.id,mappingRevision:s.mapping.revision,sha:s.template.file_sha256,profile:s.profile,periods:s.periods,subjects:s.subjects}};}catch(e){return failure(e);}}
export async function saveCompatibility(input:unknown){try{
  const p=identity.extend({mappingId:z.uuid(),mappingRevision:z.number().int().positive(),sha:z.string().regex(/^[a-f0-9]{64}$/),expectedId:z.uuid().nullable(),revision:z.number().int().nonnegative(),bindings:bindingsSchema,confirmed:z.literal(true)}).strict().parse(input);
  const c=await templateAccess(),s=await snapshot(c,p.sectionId,p.templateId);
  if(s.mapping.id!==p.mappingId||s.mapping.revision!==p.mappingRevision||s.template.file_sha256!==p.sha)throw new Error('The template changed. Reload compatibility before saving.');
  const structure=await parseWorkbook(await originalBytes(c,s.template)),definition=validateDefinition(s.mapping.mapping_definition,p.sha,structure),bindings=validateBindings({...p.bindings,periodBindings:{...suggestPeriodBindings(definition,s.periods),...p.bindings.periodBindings}},definition,s.periods,s.subjects);
  const {data,error}=await c.supabase.rpc('save_generation_profile',{p_section:p.sectionId,p_template:p.templateId,p_mapping:p.mappingId,p_mapping_revision:p.mappingRevision,p_sha:p.sha,p_bindings:bindings,p_expected_id:p.expectedId,p_revision:p.revision});
  if(error)throw new TemplateError(error.code==='PT409'?'Compatibility changed in another session. Reload before saving.':'Could not save compatibility. Check access and reload before retrying.');
  return {ok:true as const,data:data as GenerationProfile};
}catch(e){return failure(e);}}
export async function reviewReadiness(input:unknown){try{
  const p=identity.extend({learnerId:z.uuid().optional()}).strict().parse(input),{s,writer}=await loadGeneration({sectionId:p.sectionId,templateId:p.templateId}),profile=verifyProfile(s);
  const learners=s.learners.map(l=>{const values=valuesForLearner(s,writer.definition,l),missing=values.filter(v=>v.value===null);return {...l,missingCount:missing.length,warnings:missing.slice(0,12).map(v=>`${v.label}: ${outputStatus(v).toLowerCase()}`)};});
  const learner=p.learnerId?s.learners.find(l=>l.id===p.learnerId):s.learners[0];if(p.learnerId&&!learner)throw new Error('This learner is no longer active in the Section.');
  return {ok:true as const,data:{digest:digest(s),profileId:profile.id,profileRevision:profile.revision,learners,complete:learners.filter(l=>!l.missingCount).length,missing:learners.filter(l=>l.missingCount>0).length,learnerId:learner?.id??'',values:learner?valuesForLearner(s,writer.definition,learner):[],formulaTargets:writer.formulaTargets,periodCount:writer.definition.periods.length,subjectCount:writer.definition.subjects.length,lrnMapped:!!writer.definition.fields.lrn,batches:learnerBatches(s.learners.length,s.template.file_size_bytes),statuses:learner?valuesForLearner(s,writer.definition,learner).map(v=>({id:v.id,status:outputStatus(v)})):[]}};
}catch(e){return failure(e);}}
