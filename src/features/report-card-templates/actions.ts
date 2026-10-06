'use server';
import { randomUUID, createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { templateAccess, ownedTemplate, originalBytes, sourcePath, TemplateError, type TemplateContext } from './data';
import { parseWorkbook } from './workbook';
import { WorkbookError } from './package';
import { TEMPLATE_BUCKET, XLSX_MIME, fileValidation, MAX_ROWS, MAX_COLUMNS, type TemplateResult } from './model';
const BASE='/report-cards/templates';
async function result<T>(work:(context:TemplateContext)=>Promise<T>):Promise<TemplateResult<T>>{
  try{return {ok:true,data:await work(await templateAccess())};}
  catch(error){return {ok:false,error:error instanceof TemplateError||error instanceof WorkbookError?error.message:'Could not complete this template action. Please try again.'};}
}
const fileSchema=z.object({filename:z.string().min(1).max(255),size:z.number().int().positive(),mime:z.string().max(160)});
async function unregisteredCleanup(context:TemplateContext,id:string){
  // A failed/uncertain metadata read must never authorize source deletion.
  const {data,error}=await context.supabase.from('report_card_templates').select('id').eq('id',id).eq('teacher_id',context.user.id).maybeSingle();
  if(error||data)return false;
  const removed=await context.supabase.storage.from(TEMPLATE_BUCKET).remove([sourcePath(context.user.id,id)]);return !removed.error;
}
export async function prepareTemplateUpload(input:unknown){return result(async context=>{
  const p=fileSchema.safeParse(input);if(!p.success)throw new TemplateError('Choose an Excel .xlsx workbook no larger than 10 MB.');
  const error=fileValidation(p.data.filename,p.data.size,p.data.mime);if(error)throw new TemplateError(error);
  const id=randomUUID();return {id,path:sourcePath(context.user.id,id)};
});}
export async function cancelTemplateUpload(input:unknown){return result(async context=>{
  const id=z.uuid().safeParse(input);if(!id.success)throw new TemplateError('This upload was not found.');
  if(!await unregisteredCleanup(context,id.data))throw new TemplateError('This upload is already saved or could not be cleaned up. Refresh the template list before retrying.');
});}
export async function finishTemplateUpload(input:unknown):Promise<TemplateResult<{id:string}>>{
  const response=await result(async context=>{
    const parsed=z.object({id:z.uuid(),name:z.string().trim().min(1).max(160),filename:z.string().min(1).max(255)}).safeParse(input);
    if(!parsed.success)throw new TemplateError('Enter a template name and choose an Excel .xlsx workbook.');
    const p=parsed.data,path=sourcePath(context.user.id,p.id);
    const registered=await context.supabase.from('report_card_templates').select('id').eq('id',p.id).eq('teacher_id',context.user.id).maybeSingle();
    if(registered.error)throw new TemplateError('Could not verify this upload. Try again.');
    if(registered.data)return {id:p.id};
    const {data:file,error}=await context.supabase.storage.from(TEMPLATE_BUCKET).download(path,{cacheNonce:randomUUID()});
    if(error||!file)throw new TemplateError('The upload could not be read. Check your connection and retry the upload.');
    let bytes:Buffer,metadata:Awaited<ReturnType<typeof parseWorkbook>>['metadata'];
    try{
      const validation=fileValidation(p.filename,file.size,file.type);if(validation)throw new WorkbookError(validation);
      bytes=Buffer.from(await file.arrayBuffer());metadata=(await parseWorkbook(bytes)).metadata;
    }catch(error){if(!await unregisteredCleanup(context,p.id))throw new TemplateError(`${error instanceof WorkbookError?error.message:'The workbook could not be validated.'} Temporary-file cleanup could not be confirmed. Retry or cancel this upload.`);throw error;}
    const hash=createHash('sha256').update(bytes).digest('hex');
    const duplicate=async()=>{
      const {data,error}=await context.supabase.from('report_card_templates').select('id,name').eq('teacher_id',context.user.id).eq('file_sha256',hash).eq('status','active').maybeSingle();
      if(error)throw new TemplateError('Could not check for an existing template. Retry this upload.');return data as {id:string;name:string}|null;
    };
    const existing=await duplicate();
    if(existing){if(!await unregisteredCleanup(context,p.id))throw new TemplateError('An identical workbook exists, but temporary-file cleanup could not finish. Retry or cancel this upload.');return {id:existing.id,duplicate:existing};}
    const inserted=await context.supabase.from('report_card_templates').insert({id:p.id,teacher_id:context.user.id,name:p.name,original_filename:p.filename,storage_path:path,mime_type:XLSX_MIME,file_size_bytes:bytes.length,file_sha256:hash,sheet_count:metadata.sheets.length,workbook_metadata:metadata});
    if(inserted.error){
      const recovered=await context.supabase.from('report_card_templates').select('id').eq('id',p.id).eq('teacher_id',context.user.id).maybeSingle();
      if(recovered.data)return {id:p.id};
      if(recovered.error)throw new TemplateError('The upload result could not be confirmed. Retry to check whether it was saved.');
      const concurrent=await duplicate();const cleaned=await unregisteredCleanup(context,p.id);
      if(concurrent&&cleaned)return {id:concurrent.id,duplicate:concurrent};
      throw new TemplateError(cleaned?'Could not save the template. The temporary upload was removed. Please try again.':'Could not save the template or finish temporary-file cleanup. Retry this upload to check its status.');
    }
    revalidatePath(BASE);return {id:p.id};
  });
  if(response.ok&&'duplicate' in response.data&&response.data.duplicate){return {ok:false,error:`This workbook is already uploaded as '${response.data.duplicate.name}'.`,existing:response.data.duplicate};}
  return response;
}
export async function updateTemplate(input:unknown){return result(async context=>{
  const parsed=z.object({id:z.uuid(),name:z.string().trim().min(1).max(160).optional(),status:z.enum(['active','archived']).optional()}).safeParse(input);
  if(!parsed.success||(!parsed.data.name&&!parsed.data.status))throw new TemplateError('Enter a template name or choose a valid status.');
  const {id,...changes}=parsed.data;await ownedTemplate(context,id);
  const {data,error}=await context.supabase.from('report_card_templates').update(changes).eq('id',id).eq('teacher_id',context.user.id).select('id').maybeSingle();
  if(error?.code==='23505')throw new TemplateError('An identical workbook is already active. Archive that copy before reactivating this one.');
  if(error||!data)throw new TemplateError('Could not update this template. Refresh and try again.');
  revalidatePath(BASE);revalidatePath(`${BASE}/${id}`);
});}
export async function deleteTemplate(input:unknown){return result(async context=>{
  const id=z.uuid().safeParse(input);if(!id.success)throw new TemplateError('This template was not found.');
  let template;try{template=await ownedTemplate(context,id.data);}catch(error){if(error instanceof TemplateError&&error.status===404)return;throw error;}
  const removed=await context.supabase.storage.from(TEMPLATE_BUCKET).remove([template.storage_path]);
  if(removed.error)throw new TemplateError('Could not remove the original workbook. The template record was kept. Please retry.');
  const deleted=await context.supabase.from('report_card_templates').delete().eq('id',template.id).eq('teacher_id',context.user.id);
  if(deleted.error)throw new TemplateError('The file was removed, but its template record could not be deleted. Retry deletion to finish cleanup.');
  revalidatePath(BASE);
});}
export async function loadTemplateSheet(input:unknown){return result(async context=>{
  const parsed=z.object({id:z.uuid(),sheet:z.number().int().min(0).max(19),row:z.number().int().min(1).max(MAX_ROWS).default(1),column:z.number().int().min(1).max(MAX_COLUMNS).default(1)}).safeParse(input);
  if(!parsed.success)throw new TemplateError('Choose a worksheet and a cell inside the preview range.');
  const p=parsed.data,template=await ownedTemplate(context,p.id),bytes=await originalBytes(context,template);
  const preview=(await parseWorkbook(bytes)).sheet(p.sheet,p.row,p.column);
  if(Buffer.byteLength(JSON.stringify(preview),'utf8')>2*1024*1024)throw new TemplateError('This sheet contains too much detail for one preview. Download the original workbook to inspect it.');
  return preview;
});}
