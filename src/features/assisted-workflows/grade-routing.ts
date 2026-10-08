import 'server-only';
import {z} from 'zod';
import type {ParsedWorkbook} from '@/features/report-card-templates/workbook';
import {columnLetter} from '@/features/report-card-templates/model';
import {formatSchema,type GradeFormat} from './grades';
import {detectGradeFormat,extractGrades} from './grade-files';
import {normalize,safeLabel,structuralInput,workbookCells} from './structure';
import {filenamePeriods,periodCode,periodLabel,subjectKey,uniquePeriod} from './labels';
import {interpretationProvider,confidenceProvider} from './provider';
const layoutProposal=z.object({sheet:z.number().int().min(0).max(19),headerRow:z.number().int().min(1).max(100),nameColumn:z.number().int().min(1).max(128),gradeColumn:z.number().int().min(1).max(128),gradeColumns:z.array(z.number().int().min(1).max(128)).min(1).max(8),uuidColumn:z.number().int().min(1).max(128).nullable(),startRow:z.number().int().min(2).max(2000),endRow:z.number().int().min(2).max(2000)}).strict();
export const semanticGradeSchema=z.object({format:layoutProposal.nullable(),subject:z.string().max(120).nullable(),columns:z.array(z.object({column:z.number().int().min(1).max(128),period:z.string().max(60).nullable()}).strict()).max(8)}).strict();
type Selection={format:GradeFormat|null;subjectId:string|null;periodId:string|null;periodBindings?:Record<string,string>};
export async function routeGradeFile(workbook:ParsedWorkbook,filename:string,remembered:unknown,p:Selection,subjects:{id:string;name:string}[],periods:{id:string;label:string}[],allowAI=true){
  const saved=formatSchema.safeParse(remembered),structure=structuralInput(workbook);
  let format=p.format??(saved.success?{...saved.data,endRow:workbook.metadata.sheets[saved.data.sheet]?.rowExtent??saved.data.endRow}:detectGradeFormat(workbook));
  let source=p.format?'manual':saved.success?'remembered':'local';
  const validFormat=(candidate:GradeFormat)=>{for(const column of candidate.gradeColumns??[candidate.gradeColumn])extractGrades(workbook,{...candidate,gradeColumn:column});};
  if(format)try{validFormat(format);}catch{if(p.format)throw new Error('Invalid layout');format=null;source='manual';}
  if(!format&&saved.success){const detected=detectGradeFormat(workbook);if(detected)try{validFormat(detected);format=detected;source='local';}catch{/* Ask for a bounded layout instead of silently truncating rows. */}}
  const labels=structure.sheets.flatMap(s=>s.labels.map(l=>l.label)),fileText=` ${normalize(filename.replace(/\.xlsx$/i,''))} `;
  const subjectCandidates=subjects.filter(s=>labels.some(l=>subjectKey(l)===subjectKey(s.name))||fileText.includes(` ${normalize(s.name)} `)||fileText.split(' ').some(word=>subjectKey(word)===subjectKey(s.name)));
  let subjectId=p.subjectId??(subjectCandidates.length===1?subjectCandidates[0].id:null);
  const bindings:Record<string,string>={...p.periodBindings},reviewColumns:number[]=[];
  function inferColumns(){if(!format)return;const cells=workbookCells(workbook,format.sheet),columns=format.gradeColumns??[format.gradeColumn];
    for(const column of columns){if(columns.length===1&&p.periodId){bindings[column]=p.periodId;continue;}if(bindings[column])continue;
      const header=cells.find(c=>c.row===format!.headerRow&&c.column===column)?.displayValue??'';
      let found=uniquePeriod(header,periods);
      const codes=[...new Set([...filenamePeriods(filename),...labels.flatMap(l=>{const code=periodCode(l);return code===null?[]:[code];})])];
      if(!found&&columns.length===1&&periodCode(header)===null&&codes.length===1)found=uniquePeriod(periodLabel(codes[0]),periods);
      const hint=format.periodHints?.find(h=>h.column===column);if(!found&&hint&&['','grade','grades','final grade','final rating'].includes(normalize(header))&&(columns.length>1||!codes.length))found=uniquePeriod(periodLabel(hint.code),periods);
      if(found)bindings[column]=found;
    }
  }
  inferColumns();
  const unresolved=()=>!format||!subjectId||(format.gradeColumns??[format.gradeColumn]).some(c=>!bindings[c]);
  // Neither provider is even constructed on the recognized path. Approval-time
  // validation also never performs model inference.
  if(allowAI&&unresolved()){
    const provider=interpretationProvider();if(provider)try{
      const choices={subjects:subjects.map(s=>safeLabel(s.name)).filter(Boolean),periods:periods.map(p=>safeLabel(p.label)).filter(Boolean)};
      const proposal=await provider.propose(structure,'Interpret unresolved grade layout/subject/period labels. Never return grades or learner records. Use sheet_N indices. Available safe labels: '+JSON.stringify(choices),semanticGradeSchema);
      if(!format&&proposal.format){const candidate=formatSchema.parse(proposal.format);for(const column of candidate.gradeColumns??[candidate.gradeColumn])extractGrades(workbook,{...candidate,gradeColumn:column});format=candidate;source='review';inferColumns();}
      const router=confidenceProvider();
      if(format){for(const c of proposal.columns){if(!(format.gradeColumns??[format.gradeColumn]).includes(c.column)||bindings[c.column]||!c.period)continue;const target=uniquePeriod(c.period,periods);if(!target)continue;const route=await router.decide({valid:true,score:1,evidence:true,structure,candidate:{field:`period: ${safeLabel(c.period)??'unrecognized'}`,sheet:`sheet_${format.sheet}`,address:`${columnLetter(c.column)}${format.headerRow}`}});if(route.choice!=='reject'){bindings[c.column]=target;if(route.choice!=='accept')reviewColumns.push(c.column);}}
        if(!subjectId&&proposal.subject){const matched=subjects.filter(s=>subjectKey(s.name)===subjectKey(proposal.subject!));if(matched.length===1){const route=await router.decide({valid:true,score:1,evidence:true,structure,candidate:{field:`subject: ${safeLabel(proposal.subject)??'unrecognized'}`,sheet:`sheet_${format.sheet}`,address:`${columnLetter(format.nameColumn)}${format.headerRow}`}});if(route.choice!=='reject'){subjectId=matched[0].id;if(route.choice!=='accept')source='review';}}}
      }
    }catch{/* The local result and manual controls remain available. */}
  }
  if(reviewColumns.length)source='review';
  const columns=format?.gradeColumns??(format?[format.gradeColumn]:[]);
  for(const key of Object.keys(bindings))if(!columns.includes(Number(key)))delete bindings[key];
  if(subjectId&&!subjects.some(s=>s.id===subjectId)||Object.values(bindings).some(id=>!periods.some(p=>p.id===id)))throw new Error('Choose active destinations.');
  // Two source columns must never silently write to the same period.
  const duplicates=new Set(Object.values(bindings).filter((id,i,all)=>all.indexOf(id)!==i));for(const column of columns)if(duplicates.has(bindings[column]))delete bindings[column];
  return {format,subjectId,periodId:columns.length===1?bindings[columns[0]]??null:null,periodBindings:bindings,source};
}
