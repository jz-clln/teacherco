import { GenerationCompatibility } from '@/features/report-card-generation/compatibility';
import { notFound } from 'next/navigation';
import { templateAccess,ownedTemplate,TemplateError } from '@/features/report-card-templates/data';
import { readMapping } from '@/features/report-card-mappings/data';
import { ManualHandoff } from '@/features/assisted-workflows/manual-handoff';
export const metadata={title:'Map report card template'};
export default async function MappingPage({params}:{params:Promise<{templateId:string}>}){
  const {templateId}=await params,context=await templateAccess();
  const template=await ownedTemplate(context,templateId).catch(error=>{if(error instanceof TemplateError&&error.status===404)notFound();throw error;});
  const mapping=await readMapping(context,template.id);
  return <ManualHandoff template={template} initial={mapping} compatibility={<GenerationCompatibility context={context} template={template}/>}/>;
}
