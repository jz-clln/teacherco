'use server';
import {templateAccess,ownedTemplate,originalBytes,TemplateError} from '@/features/report-card-templates/data';
import {parseWorkbook} from '@/features/report-card-templates/workbook';
import {structuralInput} from '@/features/assisted-workflows/structure';
import {findGradeHeaders} from './grade-table';
import {analyzeTemplate} from '@/features/assisted-workflows/mapping-actions';

export async function detectGradeColumns(templateId:string,sheetName:string){
  try{
    const context=await templateAccess(),template=await ownedTemplate(context,templateId);
    const workbook=await parseWorkbook(await originalBytes(context,template)),index=workbook.metadata.sheets.findIndex(s=>s.name===sheetName);
    if(index<0)throw new TemplateError('Choose an available worksheet.');
    const groups=findGradeHeaders(structuralInput(workbook).sheets[index].labels);
    if(groups.length===1)return {ok:true as const,columns:groups[0]};
    if(!groups.length){
      // Reuse the cost-first pipeline only when local header recognition is ambiguous.
      const analysis=await analyzeTemplate(templateId);
      if(analysis.ok){
        const def=analysis.data.definition,subjects=def.subjects.filter(s=>def.periods.every(p=>s.outputs[p.key]?.sheet===sheetName));
        if(subjects.length&&def.periods.length){
          const columns=def.periods.map(p=>({label:p.label,column:subjects[0].outputs[p.key]!.address.split(':')[0].replace(/\d+$/,'')}));
          if(subjects.every(s=>def.periods.every((p,i)=>s.outputs[p.key]!.address.split(':')[0].replace(/\d+$/,'')===columns[i].column)))return {ok:true as const,columns};
        }
      }
    }
    return {ok:false as const,error:groups.length?'Several term tables were found. Choose the columns for the table you want below.':'No clear term or quarter headers found. Enter the grade columns below.'};
  }catch(error){return {ok:false as const,error:error instanceof TemplateError?error.message:'Could not read grade columns. Retry or enter them below.'};}
}
