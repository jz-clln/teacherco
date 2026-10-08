import { templateAccess,ownedTemplate } from '@/features/report-card-templates/data';
import { readMapping } from '@/features/report-card-mappings/data';
import { MappingReview } from '@/features/assisted-workflows/mapping-review';
export default async function AnalyzePage({params,searchParams}:{params:Promise<{templateId:string}>;searchParams:Promise<{auto?:string}>}){
  const {templateId}=await params,context=await templateAccess(),template=await ownedTemplate(context,templateId),mapping=await readMapping(context,templateId);
  return <MappingReview id={template.id} name={template.name} initial={mapping} auto={(await searchParams).auto==='1'}/>;
}
