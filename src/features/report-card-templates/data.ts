import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAccessContext, requireAccess } from '@/lib/auth/access-guard';
import { TEMPLATE_BUCKET, MAX_FILE_BYTES, type Template } from './model';
export class TemplateError extends Error { constructor(message:string,public status=400){super(message);} }
export async function templateAccess(){const context=await getAccessContext();if(!context?.user.email_confirmed_at||context.profile.access_status!=='active')throw new TemplateError('Sign in with an active, verified TeacherCo account to access templates.',403);return context;}
export type TemplateContext=Awaited<ReturnType<typeof templateAccess>>;
export const sourcePath=(teacherId:string,templateId:string)=>`${teacherId}/${templateId}/source.xlsx`;
export async function ownedTemplate(context:TemplateContext,id:string){
  if(!z.uuid().safeParse(id).success)throw new TemplateError('This template was not found.',404);
  const {data,error}=await context.supabase.from('report_card_templates').select('*').eq('id',id).eq('teacher_id',context.user.id).maybeSingle();
  if(error)throw new TemplateError('Templates are temporarily unavailable. Please try again.',503);
  if(!data)throw new TemplateError('This template was not found.',404);
  const template=data as Template;
  if(template.storage_path!==sourcePath(context.user.id,id))throw new TemplateError('The source workbook is unavailable.',503);
  return template;
}
export async function listTemplates(){
  const context=await requireAccess({onboarded:true}),rows:Template[]=[];
  for(let offset=0;;offset+=100){const {data,error}=await context.supabase.from('report_card_templates').select('*').eq('teacher_id',context.user.id).order('created_at',{ascending:false}).order('id').range(offset,offset+99);if(error||!data)throw new TemplateError('Could not load templates. Please try again.',503);rows.push(...data as Template[]);if(data.length<100)return rows;}
}
export async function originalBytes(context:TemplateContext,template:Template){
  const {data,error}=await context.supabase.storage.from(TEMPLATE_BUCKET).download(template.storage_path,{cacheNonce:randomUUID()});
  if(error||!data)throw new TemplateError('The original workbook is unavailable. Please try again. If the file was removed, upload a new template.',503);
  if(data.size>MAX_FILE_BYTES||data.size!==Number(template.file_size_bytes))throw new TemplateError('The stored workbook does not match its original record. Upload it as a new template.',409);
  const bytes=Buffer.from(await data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==template.file_sha256)throw new TemplateError('The stored workbook does not match its original record. Upload it as a new template.',409);return bytes;
}
