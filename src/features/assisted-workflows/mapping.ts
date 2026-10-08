import { z } from 'zod';
import { FIELD_KEYS, PERIOD_KEYS, OUTPUT_KEYS, emptyDefinition, validateDefinition, type MappingDefinition, type WorkbookStructure } from '@/features/report-card-mappings/model';
import { columnLetter, parseAddress } from '@/features/report-card-templates/model';
import type { SafeStructure } from './structure';

const location=z.object({sheet:z.string(),address:z.string()}).strict();
export const proposalSchema=z.object({
  fields:z.array(z.object({key:z.enum(FIELD_KEYS),location,confidence:z.number().min(0).max(1)}).strict()).max(10),
  periods:z.array(z.object({key:z.enum(PERIOD_KEYS),label:z.string().max(60)}).strict()).max(8),
  tables:z.array(z.object({sheet:z.string(),subjectColumn:z.number().int().min(1).max(128),startRow:z.number().int().min(1).max(2000),endRow:z.number().int().min(1).max(2000),outputs:z.array(z.object({key:z.enum(OUTPUT_KEYS),column:z.number().int().min(1).max(128)}).strict()).max(10),confidence:z.number().min(0).max(1)}).strict()).max(5),
}).strict();
export type Proposal=z.infer<typeof proposalSchema>;
const aliases:Record<string,typeof FIELD_KEYS[number]>={'name of learner':'learner_name','name of student':'learner_name','class adviser':'adviser_name','homeroom adviser':'adviser_name','name of school':'school_name','learner name':'learner_name','student name':'learner_name',name:'learner_name','grade level':'grade_level',section:'section_name','school year':'school_year',adviser:'adviser_name','school name':'school_name','school id':'school_id',lrn:'lrn','general average':'final_average'};
export function fallbackMapping(input:SafeStructure):Proposal{
  const result:Proposal={fields:[],periods:[],tables:[]};
  for(const sheet of input.sheets){
    for(const cell of sheet.labels){const key=aliases[cell.label];if(key){const at=parseAddress(cell.address);const merge=sheet.merges.find(m=>m.split(':')[0]===cell.address);const col=merge?parseAddress(merge.split(':')[1]).column+1:at.column+1;if(col<=sheet.columns&&!result.fields.some(f=>f.key===key))result.fields.push({key,location:{sheet:sheet.id,address:`${columnLetter(col)}${at.row}`},confidence:input.sheets.flatMap(s=>s.labels).filter(l=>aliases[l.label]===key).length===1&&!sheet.cells?.some(c=>c.address===`${columnLetter(col)}${at.row}`&&c.type!=='blank')?0.98:0.5});}}
    const headers=sheet.labels.filter(l=>['learning areas','learning area','subjects','subject'].includes(l.label));
    for(const header of headers){const at=parseAddress(header.address),outputs:Proposal['tables'][number]['outputs']=[];const periods:Proposal['periods']=[];
      for(const c of sheet.labels.filter(l=>parseAddress(l.address).row===at.row)){const m=/^(quarter|term|semester) ([1-8])$/.exec(c.label);if(m){const key=PERIOD_KEYS[Number(m[2])-1];periods.push({key,label:c.label.replace(/^./,s=>s.toUpperCase())});outputs.push({key,column:parseAddress(c.address).column});}else if(['final grade','final rating','remarks'].includes(c.label))outputs.push({key:c.label==='remarks'?'remarks':'final_grade',column:parseAddress(c.address).column});}
      const subjectRows=sheet.labels.filter(l=>parseAddress(l.address).column===at.column&&parseAddress(l.address).row>at.row&&!aliases[l.label]&&!['average','remarks','final grade'].includes(l.label)).map(l=>parseAddress(l.address).row);
      if(outputs.length&&subjectRows.length){result.periods=periods;result.tables.push({sheet:sheet.id,subjectColumn:at.column,startRow:Math.min(...subjectRows),endRow:Math.max(...subjectRows),outputs,confidence:0.5});}
    }
  }
  return result;
}
export function expandProposal(input:unknown,hash:string,workbook:WorkbookStructure,structure:SafeStructure):MappingDefinition{
  const p=proposalSchema.parse(input),def=emptyDefinition(hash);
  const sheet=(id:string)=>{const index=structure.sheets.findIndex(s=>s.id===id);if(index<0)throw new Error('Unknown worksheet');return workbook.metadata.sheets[index].name;};
  for(const f of p.fields){if(def.fields[f.key])throw new Error('Duplicate field');def.fields[f.key]={sheet:sheet(f.location.sheet),address:f.location.address};}
  def.periods=p.periods;
  for(const t of p.tables){if(t.endRow<t.startRow||t.endRow-t.startRow>=60||new Set(t.outputs.map(o=>o.key)).size!==t.outputs.length)throw new Error('Invalid grade table');
    for(let row=t.startRow;row<=t.endRow;row++){const address=`${columnLetter(t.subjectColumn)}${row}`,label=structure.sheets.find(s=>s.id===t.sheet)?.labels.find(l=>l.address===address)?.label??`Subject ${row-t.startRow+1}`;
      def.subjects.push({key:crypto.randomUUID(),label,labelLocation:{sheet:sheet(t.sheet),address},outputs:Object.fromEntries(t.outputs.map(o=>[o.key,{sheet:sheet(t.sheet),address:`${columnLetter(o.column)}${row}`}]))});}
  }
  return validateDefinition(def,hash,workbook);
}
