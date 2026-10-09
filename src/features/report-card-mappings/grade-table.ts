import {parseAddress} from '@/features/report-card-templates/model';
import {PERIOD_KEYS,type MappingDefinition} from './model';
import {periodCode,periodLabel} from '@/features/assisted-workflows/labels';

export type GradeColumn={label:string;column:string};
export function findGradeHeaders(labels:{address:string;label:string}[]):GradeColumn[][]{
  const rows=new Map<string,{number:number;column:string;label:string}[]>();
  for(const cell of labels){
    const code=periodCode(cell.label),match=code===null?null:/^(term|quarter)\s*([1-8])$/i.exec(periodLabel(code));if(!match)continue;
    const at=parseAddress(cell.address),key=`${at.row}:${match[1].toLowerCase()}`;
    const group=rows.get(key)??[];group.push({number:Number(match[2]),column:cell.address.replace(/\d+$/,''),label:`${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`});rows.set(key,group);
  }
  return [...rows.values()].filter(g=>g.length>=2&&new Set(g.map(c=>c.number)).size===g.length).map(g=>g.sort((a,b)=>a.number-b.number).map(({column,label})=>({column,label})));
}

// Only builds a draft. The server's existing review normalizes merged cells,
// verifies ownership/revision/source hash and rejects overlaps before applying.
export function gradeTableDraft(definition:MappingDefinition,sheet:string,columns:GradeColumn[],rowsText:string,startRow:number,subjectColumn=''):MappingDefinition{
  if(!sheet||!columns.length||columns.length>8)throw new Error('Choose a worksheet and grading columns.');
  const clean=columns.map(c=>({...c,column:c.column.trim().toUpperCase()}));
  subjectColumn=subjectColumn.trim().toUpperCase();
  if(subjectColumn&&(!/^[A-Z]{1,3}$/.test(subjectColumn)||clean.some(c=>c.column===subjectColumn)))throw new Error('Choose a separate column for the subject names.');
  if(clean.some(c=>!c.label.trim()||! /^[A-Z]{1,3}$/.test(c.column))||new Set(clean.map(c=>c.column)).size!==clean.length)throw new Error('Enter a different Excel column for each period, such as G, H and I.');
  const lines=rowsText.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!lines.length||lines.length>60)throw new Error('Enter between 1 and 60 subjects.');
  const next=structuredClone(definition),usedRows=new Set<number>(),usedNames=new Set<string>();
  const periods=clean.map(c=>{
    const matches=next.periods.filter(p=>p.label.toLowerCase()===c.label.toLowerCase()||(periodCode(c.label)!==null&&periodCode(p.label)===periodCode(c.label)));
    if(matches.length>1)throw new Error(`Resolve duplicate periods for ${c.label} first.`);
    const existing=matches[0];if(existing)return existing;
    const key=PERIOD_KEYS.find(k=>!next.periods.some(p=>p.key===k));if(!key)throw new Error('No free period slots. Use the existing period labels or remove unused periods first.');
    const period={key,label:c.label};next.periods.push(period);return period;
  });
  for(const [index,line] of lines.entries()){
    const explicit=/^(\d+)\s*[,\t:]\s*(.+)$/.exec(line),row=explicit?Number(explicit[1]):startRow+index,label=explicit?explicit[2].trim():line;
    if(!Number.isInteger(row)||row<1||row>2000||!label||label.length>120||usedRows.has(row)||usedNames.has(label.toLowerCase()))throw new Error('Use unique subject names and rows between 1 and 2000.');
    usedRows.add(row);usedNames.add(label.toLowerCase());
    const matches=next.subjects.filter(s=>s.label.toLowerCase()===label.toLowerCase());if(matches.length>1)throw new Error(`Rename duplicate subjects named ${label} first.`);
    const subject=matches[0]??{key:crypto.randomUUID(),label,outputs:{}};
    if(!matches.length)next.subjects.push(subject);
    if(subjectColumn)subject.labelLocation={sheet,address:`${subjectColumn}${row}`};
    clean.forEach((c,i)=>{subject.outputs[periods[i].key]={sheet,address:`${c.column}${row}`};});
  }
  if(next.subjects.length>60)throw new Error('Use at most 60 subjects.');
  return next;
}
