'use server';
import { templateAccess, ownedTemplate, originalBytes, TemplateError } from '@/features/report-card-templates/data';
import { parseWorkbook } from '@/features/report-card-templates/workbook';
import { columnLetter } from '@/features/report-card-templates/model';
import { structuralInput } from './structure';
import { interpretationProvider, confidenceProvider } from './provider';
import { proposalSchema, fallbackMapping, expandProposal } from './mapping';
import { FIELD_KEYS,validateDefinition } from '@/features/report-card-mappings/model';
import { readMapping } from '@/features/report-card-mappings/data';

export async function analyzeTemplate(templateId:string){
  try{
    const context=await templateAccess(),template=await ownedTemplate(context,templateId);
    if(template.status!=='active')throw new TemplateError('Reactivate this template first.');
    const workbook=await parseWorkbook(await originalBytes(context,template)),structure=structuralInput(workbook);
    const saved=await readMapping(context,templateId);
    if(saved?.status==='reviewed')try{return {ok:true as const,data:{definition:validateDefinition(saved.mapping_definition,template.file_sha256,workbook),proposal:{fields:[],periods:[],tables:[]},issues:[],source:'remembered' as const}};}catch{/* Invalid or stale structures still require validation and review. */}
    let proposal=fallbackMapping(structure),source:'ai'|'local'='local';
    let validLocal=true;try{expandProposal(proposal,template.file_sha256,workbook,structure);}catch{validLocal=false;}
    const hasTableHeader=structure.sheets.some(s=>s.labels.some(l=>['subjects','subject','learning areas','learning area','quarterly rating'].includes(l.label)));
    const ambiguous=!validLocal||hasTableHeader&&!proposal.tables.length||!proposal.fields.length&&!proposal.tables.length;
    if(ambiguous&&structure.sheets.some(s=>s.labels.length)){const provider=interpretationProvider();if(provider)try{const proposed=await provider.propose(structure,'Propose blank report-card output cells and grade table columns. Sheet IDs must match input. Do not map label cells as output fields. Use existing period_1 through period_8 slots. Confidence is only a review hint.',proposalSchema);expandProposal(proposed,template.file_sha256,workbook,structure);proposal=proposed;source='ai';}catch{/* Local suggestions and manual editing remain available. */}}
    let definition;
    try{definition=expandProposal(proposal,template.file_sha256,workbook,structure);}catch{proposal={fields:[],periods:[],tables:[]};definition=expandProposal(proposal,template.file_sha256,workbook,structure);}
    const issues:string[]=[];
    const routing=source==='ai'?confidenceProvider():null;
    const decisions=await Promise.all(proposal.fields.map(f=>routing?routing.decide({valid:true,score:f.confidence,evidence:true,structure,candidate:{field:f.key,sheet:f.location.sheet,address:f.location.address}}):Promise.resolve({choice:f.confidence>=0.95?'accept':'review'})));
    if(routing){
      const tables=await Promise.all(proposal.tables.map(t=>routing.decide({valid:true,score:t.confidence,evidence:true,structure,candidate:{field:`grade table: subject column ${t.subjectColumn}, rows ${t.startRow}-${t.endRow}, outputs ${JSON.stringify(t.outputs)}`,sheet:t.sheet,address:`${columnLetter(t.subjectColumn)}${t.startRow}`}})));
      if(tables.some(t=>t.choice==='reject')){proposal={...proposal,tables:proposal.tables.filter((_,index)=>tables[index].choice!=='reject')};definition=expandProposal(proposal,template.file_sha256,workbook,structure);}
    }
    for(const [index,f] of proposal.fields.entries()){if(decisions[index].choice==='reject'){delete definition.fields[f.key];}else if(decisions[index].choice!=='accept')issues.push(`field:${f.key}`);}
    // Table extent/subject labels always need one grouped approval.
    if(proposal.tables.length)issues.push('table');
    for(const key of FIELD_KEYS.filter(k=>['learner_name','grade_level','section_name','school_year'].includes(k)))if(!definition.fields[key])issues.push(`missing:${key}`);
    if(!definition.subjects.length)issues.push('missing:table');
    return {ok:true as const,data:{definition,proposal,issues,source}};
  }catch(error){return {ok:false as const,error:error instanceof TemplateError?error.message:'Could not analyze this workbook. Edit manually or retry.'};}
}
