import Link from 'next/link';
import { notFound } from 'next/navigation';
import { templateAccess,ownedTemplate,TemplateError } from '@/features/report-card-templates/data';
import { readMapping } from '@/features/report-card-mappings/data';
import { MappingWorkspace } from '@/features/report-card-mappings/workspace';
export const metadata={title:'Map report card template'};
export default async function MappingPage({params}:{params:Promise<{templateId:string}>}){
  const {templateId}=await params,context=await templateAccess();
  const template=await ownedTemplate(context,templateId).catch(error=>{if(error instanceof TemplateError&&error.status===404)notFound();throw error;});
  const mapping=await readMapping(context,template.id);
  return <div className="min-w-0 space-y-5"><Link className="inline-flex min-h-11 items-center text-sm text-[#4F6F52]" href={`/report-cards/templates/${template.id}`}>Back to workbook</Link><div><h1 className="break-words text-2xl font-semibold">Map {template.name}</h1><p className="mt-2 text-sm leading-6 text-[#606861]">Choose what each location means. Your original workbook stays unchanged. Save your progress explicitly to continue later.</p></div><MappingWorkspace template={template} initial={mapping}/></div>;
}
