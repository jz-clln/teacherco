import 'server-only';
import {originalBytes,type TemplateContext} from '@/features/report-card-templates/data';
import type {Template} from '@/features/report-card-templates/model';
import {readMapping} from '@/features/report-card-mappings/data';
import {assignments,emptyDefinition} from '@/features/report-card-mappings/model';
import {prepareWriter} from './writer';
export async function GenerationCompatibility({context,template}:{context:TemplateContext;template:Template}){
  const mapping=await readMapping(context,template.id);let error='',formulas=0;
  try{const bytes=await originalBytes(context,template),writer=await prepareWriter(bytes,mapping?.mapping_definition??emptyDefinition(template.file_sha256),template.file_sha256,true);formulas=writer.formulaTargets.length;if(mapping?.status==='reviewed'&&!assignments(mapping.mapping_definition).length)error='Assign at least one output location before generating.';}catch{error='This workbook or its current mapping needs attention before generation. Check worksheet coordinates, unsupported formula targets, and source availability.';}
  return <section aria-label="Generation compatibility" className="space-y-2 text-sm"><p className="font-medium">{error?'Needs attention':mapping?.status==='reviewed'?'Mapping reviewed':'Ready to map'}</p>{error&&<p className="text-amber-800">{error}</p>}{formulas>0&&<p className="text-amber-800">{formulas} mapped formulas need confirmation.</p>}<details><summary className="flex cursor-pointer items-center text-xs text-[#606861]">File details</summary><p className="py-2 text-xs text-[#606861]">10 MiB limit · Original preserved · Private temporary downloads. Use only information you are authorized to handle.</p></details></section>;
}
