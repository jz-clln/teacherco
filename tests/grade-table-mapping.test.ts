import {expect,it} from 'vitest';
import {gradeTableDraft,findGradeHeaders} from '@/features/report-card-mappings/grade-table';
import {emptyDefinition,validateDefinition,type WorkbookStructure} from '@/features/report-card-mappings/model';
import {parseMerge} from '@/features/report-card-templates/model';
import {safeLabel} from '@/features/assisted-workflows/structure';
const columns=['G','H','I'].map((column,i)=>({column,label:`Term ${i+1}`}));
it('recognizes abbreviated term and quarter headers without treating vertically stacked comments as columns',()=>{
  expect(safeLabel('T1')).toBe('term 1');
  expect(findGradeHeaders(['T1','T2','T3'].map((label,i)=>({address:`${columns[i].column}29`,label})))).toEqual([columns]);
  expect(findGradeHeaders(['Q1','Q2','Q3','Q4'].map((label,i)=>({address:`${String.fromCharCode(68+i)}12`,label})))[0]).toHaveLength(4);
  expect(findGradeHeaders([{address:'A1',label:'Term 1'},{address:'A2',label:'Term 2'}])).toEqual([]);
});
it('maps every subject once, preserves other fields, and reuses equivalent period keys',()=>{
  const base=emptyDefinition('a'.repeat(64));base.fields.learner_name={sheet:'Front',address:'A1'};base.periods=[{key:'period_4',label:'T1'}];
  const next=gradeTableDraft(base,'Front',columns,'Calculus\n32, Language',30,'C');
  expect(base.subjects).toHaveLength(0);expect(next.fields).toEqual(base.fields);expect(next.periods).toHaveLength(3);
  expect(next.subjects[0].outputs.period_4).toEqual({sheet:'Front',address:'G30'});
  expect(next.subjects[0].labelLocation).toEqual({sheet:'Front',address:'C30'});
  expect(Object.values(next.subjects[1].outputs).map(l=>l.address)).toEqual(['G32','H32','I32']);
  const changed=gradeTableDraft(next,'Front',columns,'Calculus',35);expect(changed.subjects).toHaveLength(2);expect(changed.subjects[0].key).toBe(next.subjects[0].key);expect(changed.subjects[1]).toEqual(next.subjects[1]);
});
it('supports four quarters and rejects duplicate subjects, rows and columns',()=>{
  const base=emptyDefinition('a'.repeat(64)),quarters=['D','E','F','G'].map((column,i)=>({column,label:`Quarter ${i+1}`}));
  expect(Object.keys(gradeTableDraft(base,'Front',quarters,'Calculus',10).subjects[0].outputs)).toHaveLength(4);
  for(const rows of ['Calculus\ncalculus','30, Calculus\n30, Language','0, Calculus'])expect(()=>gradeTableDraft(base,'Front',columns,rows,30)).toThrow();
  expect(()=>gradeTableDraft(base,'Front',[columns[0],{...columns[1],column:'G'}],'Calculus',30)).toThrow();
});
it('uses normal server validation to normalize merged cells and reject overlaps and bounds',()=>{
  const base=emptyDefinition('a'.repeat(64));
  const structure={metadata:{formatVersion:1,sheets:[{name:'Front',rowExtent:50,columnExtent:12}]},worksheetNames:['Front'],merges:[[parseMerge('G30:G31')]]} as WorkbookStructure;
  const draft=gradeTableDraft(base,'Front',columns,'Calculus',30);
  expect(validateDefinition(draft,base.templateSha256,structure).subjects[0].outputs.period_1?.address).toBe('G30:G31');
  expect(()=>validateDefinition(gradeTableDraft(base,'Front',columns,'Calculus\nLanguage',30),base.templateSha256,structure)).toThrow(/overlaps/);
  expect(()=>validateDefinition(gradeTableDraft(base,'Front',columns,'Calculus',51),base.templateSha256,structure)).toThrow(/bounds/);
});
