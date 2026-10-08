import {ownedSection} from '@/features/sections/data';
import {generationOptions} from '@/features/report-card-generation/data';
import {GenerationWorkspace} from '@/features/report-card-generation/workspace';
import {loadCompatibility,reviewReadiness} from '@/features/report-card-generation/actions';
import Link from 'next/link';
export default async function ReportCardsPage({params}:{params:Promise<{sectionId:string}>}){
  const {sectionId}=await params,{section}=await ownedSection(sectionId);
  if(section.status!=='active')return <p className="text-sm text-[#6B7280]">This Section is archived. Reactivate it before configuring or generating report cards.</p>;
  const options=await generationOptions(sectionId);
  let initial;
  if(options.templates.length===1){const templateId=options.templates[0].id,loaded=await loadCompatibility({sectionId,templateId});if(loaded.ok){const ready=loaded.data.profile?await reviewReadiness({sectionId,templateId}):null;initial={templateId,config:loaded.data,review:ready?.ok?ready.data:null};}}
  return <><Link className="tc-button tc-quiet" href={`/sections/${sectionId}/inbox`}>Grade Inbox</Link><GenerationWorkspace {...options} initial={initial}/></>;
}
