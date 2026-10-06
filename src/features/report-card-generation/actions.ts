'use server';
import {z} from 'zod';
import {templateAccess,TemplateError} from '@/features/report-card-templates/data';
import {WorkbookError} from '@/features/report-card-templates/package';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {originalBytes} from '@/features/report-card-templates/data';
import {validateDefinition} from '@/features/report-card-mappings/model';
import {identity,snapshot,loadGeneration,digest} from './data';
import {bindingsSchema,validateBindings,valuesForLearner,verifyProfile,type GenerationProfile} from './model';

function failure(error:unknown){return {ok:false as const,error:error instanceof Error&&(error instanceof TemplateError||error instanceof WorkbookError||error.constructor===Error)?error.message:'Could not complete this action. Please retry.'};}
export async function loadCompatibility(input:unknown){try{const p=identity.parse(input),c=await templateAccess(),s=await snapshot(c,p.sectionId,p.templateId);return {ok:true as const,data:{definition:s.mapping.mapping_definition,mappingId:s.mapping.id,mappingRevision:s.mapping.revision,sha:s.template.file_sha256,profile:s.profile,periods:s.periods,subjects:s.subjects}};}catch(e){return failure(e);}}
export async function saveCompatibility(input:unknown){try{
  const p=identity.extend({mappingId:z.uuid(),mappingRevision:z.number().int().positive(),sha:z.string().regex(/^[a-f0-9]{64}$/),expectedId:z.uuid().nullable(),revision:z.number().int().nonnegative(),bindings:bindingsSchema,confirmed:z.literal(true)}).strict().parse(input);
  const c=await templateAccess(),s=await snapshot(c,p.sectionId,p.templateId);
  if(s.mapping.id!==p.mappingId||s.mapping.revision!==p.mappingRevision||s.template.file_sha256!==p.sha)throw new Error('The template changed. Reload compatibility before saving.');
  const structure=await parseWorkbook(await originalBytes(c,s.template)),definition=validateDefinition(s.mapping.mapping_definition,p.sha,structure),bindings=validateBindings(p.bindings,definition,s.periods,s.subjects);
  const {data,error}=await c.supabase.rpc('save_generation_profile',{p_section:p.sectionId,p_template:p.templateId,p_mapping:p.mappingId,p_mapping_revision:p.mappingRevision,p_sha:p.sha,p_bindings:bindings,p_expected_id:p.expectedId,p_revision:p.revision});
  if(error)throw new TemplateError(error.code==='PT409'?'Compatibility changed in another session. Reload before saving.':'Could not save compatibility. Check access and reload before retrying.');
  return {ok:true as const,data:data as GenerationProfile};
}catch(e){return failure(e);}}
export async function reviewReadiness(input:unknown){try{
  const p=identity.extend({learnerId:z.uuid().optional()}).strict().parse(input),{s,writer}=await loadGeneration({sectionId:p.sectionId,templateId:p.templateId}),profile=verifyProfile(s);
  const learners=s.learners.map(l=>{const missing=valuesForLearner(s,writer.definition,l).filter(v=>v.value===null);return {...l,missingCount:missing.length,warnings:missing.slice(0,12).map(v=>`${v.label} missing`)};});
  const learner=p.learnerId?s.learners.find(l=>l.id===p.learnerId):s.learners[0];if(p.learnerId&&!learner)throw new Error('This learner is no longer active in the Section.');
  return {ok:true as const,data:{digest:digest(s),profileId:profile.id,profileRevision:profile.revision,learners,complete:learners.filter(l=>!l.missingCount).length,missing:learners.filter(l=>l.missingCount>0).length,learnerId:learner?.id??'',values:learner?valuesForLearner(s,writer.definition,learner):[],formulaTargets:writer.formulaTargets,periodCount:writer.definition.periods.length,subjectCount:writer.definition.subjects.length}};
}catch(e){return failure(e);}}
