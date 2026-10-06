import 'server-only';
import { TemplateError, type TemplateContext } from '@/features/report-card-templates/data';
import type { MappingRecord } from './model';
export async function readMapping(context:TemplateContext,templateId:string){
  const {data,error}=await context.supabase.from('report_card_template_mappings').select('*').eq('template_id',templateId).eq('teacher_id',context.user.id).maybeSingle();
  if(error)throw new TemplateError('Could not load this mapping. Please retry.',503);
  return data as MappingRecord|null;
}
