import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPreview, parseGrade, presetPeriods, type GradeEntry, type ImportSelection } from '@/features/gradebook/model';
import { computeTermGrade } from '@/lib/grading/deped';
import { defaultGradingConfig } from '@/lib/grading/presets';
import type { ClassTermGrades } from '@/features/grading/queries';
const selection:ImportSelection={sectionId:'section',subjectId:'subject',periodId:'period',classId:'class',term:1,calculation:'printed'};
const config=defaultGradingConfig('Math');
const result=computeTermGrade([{title:'WW',component:'written_work',possible:100,earned:90,isTermExam:false},{title:'PT',component:'performance_task',possible:100,earned:90,isTermExam:false},{title:'Exam',component:'assessment',possible:100,earned:90,isTermExam:true}],config);
function classroom():ClassTermGrades{return {id:'class',name:'Math',subject:'Math',gradeLevel:'Grade 8',config,customized:false,sourceFilename:null,hasTermData:true,unassignedActivityCount:0,learners:['a','b','c','d','same-name-other-id'].map(id=>({id,name:'Ana Cruz',terms:[{term:1,result,recorded:{termGrade:id==='c'?null:89,initialGrade:null,descriptor:null},comparison:{status:'differs',termGap:1,initialGap:1}}]}))};}
const entry=(id:string,grade:number,source:'manual'|'teacherco_class'='manual'):GradeEntry=>({learner_id:id,section_subject_id:'subject',period_id:'period',grade,source_type:source,source_class_id:null,source_reference:null,source_snapshot:null,updated_at:'2026-10-05T01:00:00Z'});
describe('grade values and preview',()=>{
  it.each([['',null],['  ',null],['0',0],['89.48',89.48],['100',100]])('parses %s distinctly', (input,expected)=>expect(parseGrade(input as string)).toBe(expected));
  it.each(['-1','101','abc','1e2','Infinity','NaN','88,2'])('rejects invalid text %s',input=>expect(()=>parseGrade(input)).toThrow());
  it('reports add/change/unchanged/missing/outside using UUIDs, never duplicate names',()=>{
    const source=classroom(),entries=[entry('a',84),entry('b',89)];const before=JSON.stringify({source,entries});
    const rows=buildPreview(source,new Set(['a','b','c','d']),entries,selection);
    expect(rows.map(r=>r.status)).toEqual(['change','unchanged','missing','add','outside']);
    expect(rows[0].current?.source_type).toBe('manual');expect(rows[4].current).toBeNull();expect(JSON.stringify({source,entries})).toBe(before);
  });
  it('exposes both sources and honors explicit source choice without inventing precedence',()=>{
    const rows=buildPreview(classroom(),new Set(['a']),[],{...selection,calculation:'calculated'});
    expect(rows[0].printed).toBe(89);expect(rows[0].calculated).toBe(result.termGrade);expect(rows[0].incoming).toBe(result.termGrade);
    expect(buildPreview(classroom(),new Set(['a']),[],selection)[0].incoming).toBe(89);
  });
  it('does not replace missing calculated values with zero or printed grades',()=>{const source=classroom();source.learners[0].terms[0]={...source.learners[0].terms[0],result:{...result,status:'no_scores',termGrade:null}};const row=buildPreview(source,new Set(['a']),[],{...selection,calculation:'calculated'})[0];expect(row.status).toBe('missing');expect(row.incoming).toBeNull();});
  it('presets use stable generic keys independent of labels',()=>{const a=presetPeriods('quarters'),b=presetPeriods('terms');expect(a).toHaveLength(4);expect(b).toHaveLength(3);expect(a[0].key).toBe(b[0].key);expect(a[0].id).not.toBe(b[0].id);});
  it('reuses the existing class-grade query and contains no second formula or AI call',()=>{const source=readFileSync('src/features/gradebook/actions.ts','utf8');expect(source).toContain('getClassTermGrades(supabase,p.classId)');expect(source).not.toMatch(/getAIProvider|generateText|computeTermGrade|transmute\(/);});
});
