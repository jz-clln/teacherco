import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ownedTemplate, templateAccess, TemplateError } from '@/features/report-card-templates/data';
import { TemplateManagement } from '@/features/report-card-templates/management';
import { TemplateViewer } from '@/features/report-card-templates/viewer';
import { MappingLink } from '@/features/report-card-mappings/link';
export const metadata={title:'Workbook preview'};
export default async function TemplatePage({params}:{params:Promise<{templateId:string}>}){
  const {templateId}=await params,context=await templateAccess();
  const template=await ownedTemplate(context,templateId).catch(error=>{if(error instanceof TemplateError&&error.status===404)notFound();throw error;});
  return <div className="min-w-0 space-y-5"><Link href="/report-cards/templates" className="inline-flex min-h-11 items-center text-sm text-[#4F6F52]">Back to templates</Link><div><h1 className="break-words text-2xl font-semibold">{template.name}</h1><p className="mt-2 break-words text-sm text-[#606861]">{template.original_filename} · {template.status==='archived'?'Archived · ':''}Read-only preview</p></div><MappingLink id={template.id}/><TemplateManagement template={template}/><TemplateViewer id={template.id} metadata={template.workbook_metadata}/></div>;
}
