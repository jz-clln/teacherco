import {ownedSection} from '@/features/sections/data';
import {generationOptions} from '@/features/report-card-generation/data';
import {GenerationWorkspace} from '@/features/report-card-generation/workspace';
export default async function ReportCardsPage({params}:{params:Promise<{sectionId:string}>}){
  const {sectionId}=await params,{section}=await ownedSection(sectionId);
  if(section.status!=='active')return <p className="text-sm text-[#6B7280]">This Section is archived. Reactivate it before configuring or generating report cards.</p>;
  const options=await generationOptions(sectionId);return <GenerationWorkspace {...options}/>;
}
