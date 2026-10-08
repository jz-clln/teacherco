import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ParsedWorkbook } from '@/features/report-card-templates/workbook';
import { parseAddress } from '@/features/report-card-templates/model';
import { structuralInput,workbookCells } from './structure';
import { formatSchema,type GradeFormat,type Incoming } from './grades';
import {periodCode} from './labels';
export function formatFingerprint(workbook:ParsedWorkbook){const structure=structuralInput(workbook);return createHash('sha256').update(JSON.stringify(structure.sheets.map(s=>({columns:s.columns,labels:s.labels.filter(l=>parseAddress(l.address).row<=20).map(l=>({...l,label:l.label.replace(/^(term|quarter|semester) [1-8]$/,'$1 #')}))})))).digest('hex');}
export function detectGradeFormat(workbook:ParsedWorkbook):GradeFormat|null{
  for(const sheet of structuralInput(workbook).sheets){const index=Number(sheet.id.slice(6));const names=sheet.labels.filter(l=>['name','learner name','student name'].includes(l.label));
    for(const name of names){const at=parseAddress(name.address),grades=sheet.labels.filter(l=>(['grade','grades','final grade','final rating'].includes(l.label)||periodCode(l.label)!==null)&&parseAddress(l.address).row===at.row);
      const uuid=sheet.labels.find(l=>l.label==='learner uuid'&&parseAddress(l.address).row===at.row);
      if(grades.length&&grades.length<=8&&sheet.rows>at.row)return {sheet:index,headerRow:at.row,nameColumn:at.column,gradeColumn:parseAddress(grades[0].address).column,...(grades.length>1?{gradeColumns:grades.map(g=>parseAddress(g.address).column)}:{}),uuidColumn:uuid?parseAddress(uuid.address).column:null,startRow:at.row+1,endRow:sheet.rows};
    }
  }return null;
}
export function extractGrades(workbook:ParsedWorkbook,input:unknown):Incoming[]{
  const f=formatSchema.parse(input),sheet=workbook.metadata.sheets[f.sheet];if(!sheet||f.endRow>sheet.rowExtent||Math.max(f.gradeColumn,f.nameColumn,f.uuidColumn??0)>sheet.columnExtent||f.endRow-f.startRow>=500)throw new Error('Choose up to 500 rows within the worksheet.');
  const cells=workbookCells(workbook,f.sheet),rows:Incoming[]=[];
  if(cells.some(c=>c.row===f.headerRow&&[f.nameColumn,f.uuidColumn,f.gradeColumn].includes(c.column)&&c.displayValue.trim().toLowerCase()==='lrn'))throw new Error('LRN cannot be used for learner matching or grades.');
  for(let row=f.startRow;row<=f.endRow;row++){const cell=(col:number)=>cells.find(c=>c.row===row&&c.column===col),name=cell(f.nameColumn)?.displayValue.trim()??'',gradeCell=cell(f.gradeColumn);if(!name&&!gradeCell?.displayValue)continue;
    const numeric=gradeCell?workbook.numericValue(f.sheet,gradeCell.address):null;
    const raw=numeric!==null?String(numeric):gradeCell?.type==='formula'?gradeCell.cachedValue??'':gradeCell?.displayValue??'';
    const valid=/^\d+(?:\.\d+)?$/.test(raw.trim())&&Number(raw)>=0&&Number(raw)<=100;
    const uuid=f.uuidColumn?cell(f.uuidColumn)?.displayValue??null:null;
    rows.push({row,name,uuid,grade:valid?Number(raw):null,missing:!raw.trim()&&gradeCell?.type!=='formula',invalid:(!name&&!z.uuid().safeParse(uuid).success)||/^\d{12}$/.test(name)||gradeCell?.type==='date'||!!gradeCell?.displayValue.includes('%')||!valid});
  }return rows;
}
