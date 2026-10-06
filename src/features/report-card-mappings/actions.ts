'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { templateAccess,ownedTemplate,originalBytes,TemplateError } from '@/features/report-card-templates/data';
import { parseWorkbook } from '@/features/report-card-templates/workbook';
import { WorkbookError } from '@/features/report-card-templates/package';
import type { TemplateResult } from '@/features/report-card-templates/model';
import { validateDefinition, mappingWarnings, type MappingDefinition, type MappingRecord } from './model';
const identity=z.object({templateId:z.uuid(),expectedId:z.uuid().nullable(),revision:z.number().int().min(0)});
async function validate(input:unknown){
  const parsed=identity.extend({definition:z.unknown()}).safeParse(input);
  if(!parsed.success)throw new TemplateError('Reopen the template and review its mapping.');
  const context=await templateAccess(),template=await ownedTemplate(context,parsed.data.templateId);
  if(template.status!=='active')throw new TemplateError('Reactivate this template before editing its mapping.');
  const workbook=await parseWorkbook(await originalBytes(context,template));
  let definition:MappingDefinition;try{definition=validateDefinition(parsed.data.definition,template.file_sha256,workbook);}catch(error){throw new TemplateError((error as Error).message);}
  return {context,template,definition,input:parsed.data};
}
function failure(error:unknown){return {ok:false as const,error:error instanceof TemplateError||error instanceof WorkbookError?error.message:'Could not complete this mapping action. Please retry.'};}
export async function reviewMapping(input:unknown):Promise<TemplateResult<{definition:MappingDefinition;warnings:string[]}>>{
  try{const {definition}=await validate(input);return {ok:true,data:{definition,warnings:mappingWarnings(definition)}};}catch(error){return failure(error);}
}
export async function saveMapping(input:unknown):Promise<TemplateResult<MappingRecord>>{
  try{
    const {context,template,definition,input:p}=await validate(input);
    const status=z.object({status:z.enum(['draft','reviewed'])}).safeParse(input);if(!status.success)throw new TemplateError('Review this mapping before saving.');
    const {data,error}=await context.supabase.rpc('save_report_card_mapping',{p_template:template.id,p_definition:definition,p_expected_id:p.expectedId,p_revision:p.revision,p_status:status.data.status});
    if(error){if(error.code==='PT409')throw new TemplateError('This mapping changed in another session. Reopen it before saving; your current edits have not been applied.');throw new TemplateError('Could not save this mapping. Check access and reload before retrying.');}
    revalidatePath(`/report-cards/templates/${template.id}/mapping`);return {ok:true,data:data as MappingRecord};
  }catch(error){return failure(error);}
}
export async function resetMapping(input:unknown):Promise<TemplateResult>{
  try{
    const parsed=identity.extend({confirmed:z.literal(true)}).safeParse(input);if(!parsed.success)throw new TemplateError('Confirm resetting this mapping first.');
    const context=await templateAccess(),p=parsed.data;await ownedTemplate(context,p.templateId);
    const {error}=await context.supabase.rpc('reset_report_card_mapping',{p_template:p.templateId,p_expected_id:p.expectedId,p_revision:p.revision});
    if(error)throw new TemplateError(error.code==='PT409'?'This mapping changed in another session. Reopen it before resetting.':'Could not reset this mapping. Check access and try again.');
    revalidatePath(`/report-cards/templates/${p.templateId}/mapping`);return {ok:true,data:undefined};
  }catch(error){return failure(error);}
}
