import type { ParsedWorkbook } from '@/features/report-card-templates/workbook';
import { WINDOW_ROWS, WINDOW_COLUMNS,parseAddress } from '@/features/report-card-templates/model';
import {normalizeLabel,periodCode,periodLabel} from './labels';

// Only exact vocabulary tokens cross the provider boundary. Unknown labels,
// filenames, sheet names, formulas and all cell values stay in TeacherCo.
export const vocabulary = ['learner name','name','student name','grade level','section','school year','adviser','school name','school id','lrn','learning areas','subject','subjects','mathematics','math','english','science','filipino','mapeh','music','arts','physical education','health','araling panlipunan','esp','values education','language','reading','writing','filipino sa piling larangan','final grade','grade','grades','remarks','general average','average','quarter 1','quarter 2','quarter 3','quarter 4','term 1','term 2','term 3','semester 1','semester 2','learner uuid'] as const;
export const normalize = normalizeLabel;
const headings=['quarterly rating','final rating','core subjects','applied subjects','specialized subjects','parent/guardian signature','parent guardian signature','signature of parent or guardian','signature of adviser','class adviser','learner information','school information','report card','progress report','academic performance','learning area','name of learner','name of student','name of school','grade and section','grading period','grading periods','quarterly grades','first semester','second semester','homeroom adviser','parent guardian','attendance','days present','days absent','total days','technology and livelihood education','edukasyon sa pagpapakatao','ap','tle','pe','values','oral communication','general mathematics','earth and life science','physical science','reading and writing','media and information literacy','statistics and probability','personal development','understanding culture society and politics','empowerment technologies','practical research 1','practical research 2','contemporary philippine arts from the regions'];
export function safeLabel(value:string):string|null {const n=normalize(value);if(/\d{9,}|[\w.+-]+@\w|https?:|[a-f0-9]{8}-[a-f0-9-]{27,}/i.test(value))return null;const code=periodCode(n);if(code!==null)return periodLabel(code).toLowerCase();return vocabulary.find(v=>v===n)??headings.find(v=>v===n)??null;}
export type SafeStructure={sheets:{id:string;rows:number;columns:number;merges:string[];labels:{address:string;label:string}[];formulas:string[];cells:{address:string;type:string}[]}[]};
export function workbookCells(workbook:ParsedWorkbook,index:number){
  const summary=workbook.metadata.sheets[index],cells=new Map<string,ReturnType<ParsedWorkbook['sheet']>['cells'][number]>();
  for(let r=1;r<=summary.rowExtent;r+=WINDOW_ROWS)for(let c=1;c<=summary.columnExtent;c+=WINDOW_COLUMNS)
    for(const cell of workbook.sheet(index,r,c).cells)cells.set(cell.address,cell);
  return [...cells.values()];
}
export function structuralInput(workbook:ParsedWorkbook):SafeStructure{
  let labels=0,types=0;
  return {sheets:workbook.metadata.sheets.map((s,i)=>{const cells=workbookCells(workbook,i);
    // A learner may happen to be named "English" or "Science". Once a roster
    // header is identified, even allowlisted text in its identity columns is private.
    const identities=cells.filter(c=>c.type==='text'&&['name','learner name','student name','name of learner','name of student','learner uuid','lrn'].includes(normalize(c.displayValue))&&cells.some(other=>other.row===c.row&&other.column!==c.column&&(['grade','grades','final grade','final rating'].includes(normalize(other.displayValue))||periodCode(other.displayValue)!==null)));
    const identityValues=cells.filter(c=>c.type==='text'&&['name','learner name','student name','name of learner','name of student','adviser','class adviser','homeroom adviser','lrn','learner uuid'].includes(normalize(c.displayValue))&&!identities.includes(c)).map(c=>{const merge=workbook.merges[i].find(m=>m.address.split(':')[0]===c.address);return {row:c.row,column:merge?parseAddress(merge.address.split(':').at(-1)!).column+1:c.column+1};});
    return {id:`sheet_${i}`,rows:s.rowExtent,columns:s.columnExtent,merges:workbook.merges[i].map(m=>m.address),labels:cells.flatMap(c=>{const privateCell=identities.some(header=>c.column===header.column&&c.row>header.row)||identityValues.some(value=>c.row===value.row&&c.column===value.column);const label=c.type==='text'&&!privateCell?safeLabel(c.displayValue):null;return label&&labels++<1500?[{address:c.address,label}]:[];}),formulas:cells.filter(c=>c.type==='formula').map(c=>c.address).slice(0,1000),cells:cells.filter(()=>types++<5000).map(c=>({address:c.address,type:c.type}))};})};
}
