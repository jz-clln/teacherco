import { z } from 'zod';
import { normalize } from './structure';
import type { GradeEntry } from '@/features/gradebook/model';
export const formatSchema=z.object({sheet:z.number().int().min(0).max(19),headerRow:z.number().int().min(1).max(100),nameColumn:z.number().int().min(1).max(128),gradeColumn:z.number().int().min(1).max(128),gradeColumns:z.array(z.number().int().min(1).max(128)).min(1).max(8).optional(),periodHints:z.array(z.object({column:z.number().int().min(1).max(128),code:z.number().int().min(1).max(32)}).strict()).max(8).optional(),uuidColumn:z.number().int().min(1).max(128).nullable(),startRow:z.number().int().min(2).max(2000),endRow:z.number().int().min(2).max(2000)}).strict().refine(f=>f.endRow>=f.startRow&&f.startRow>f.headerRow&&f.nameColumn!==f.gradeColumn&&(!f.gradeColumns||(new Set(f.gradeColumns).size===f.gradeColumns.length&&!f.gradeColumns.includes(f.nameColumn)&&f.gradeColumns.includes(f.gradeColumn))));
export type GradeFormat=z.infer<typeof formatSchema>;
export type Incoming={row:number;name:string;uuid:string|null;grade:number|null;invalid:boolean;missing?:boolean};
export type Learner={id:string;display_name:string};
export function matchLearner(row:Pick<Incoming,'uuid'|'name'>,learners:Learner[]){
  if(/^\d{12}$/.test(row.name.trim())||row.uuid&&/^\d{12}$/.test(row.uuid))return {id:null,candidates:[],certain:false};
  if(row.uuid){const exact=learners.filter(l=>l.id===row.uuid);return {id:exact.length===1?exact[0].id:null,candidates:exact.map(l=>l.id),certain:exact.length===1};}
  const name=normalize(row.name).replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
  const norm=(s:string)=>normalize(s).replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
  const exact=learners.filter(l=>norm(l.display_name)===name);
  if(exact.length)return {id:exact.length===1?exact[0].id:null,candidates:exact.map(l=>l.id),certain:exact.length===1};
  const tokens=name.split(' ').filter(s=>s.length>1);
  const candidates=learners.filter(l=>{const other=norm(l.display_name).split(' ');return tokens.length>=2&&tokens.every(t=>other.includes(t));}).map(l=>l.id);
  return {id:null,candidates,certain:false};
}
export type GradeIssue={row:number;name:string;incoming:number|null;learnerId:string|null;candidates:string[];current:GradeEntry|null;kind:'ready'|'unchanged'|'missing'|'match'|'invalid'|'conflict'|'duplicate'};
export function gradePreview(rows:Incoming[],learners:Learner[],entries:GradeEntry[],subjectId:string,periodId:string,resolutions:Record<string,string>={}):GradeIssue[]{
  const matched=rows.map(row=>{const m=matchLearner(row,learners),chosen=resolutions[row.row];const id=chosen&&learners.some(l=>l.id===chosen)?chosen:m.id;return {row,m,id};});
  const counts=new Map<string,number>();for(const m of matched)if(m.id)counts.set(m.id,(counts.get(m.id)??0)+1);
  return matched.map(({row,id,m})=>{const current=entries.find(e=>e.learner_id===id&&e.section_subject_id===subjectId&&e.period_id===periodId)??null;
    const kind=row.missing?'missing':row.invalid||row.grade==null?'invalid':!id?'match':(counts.get(id)??0)>1?'duplicate':current?.grade===row.grade?'unchanged':current?.grade!=null?'conflict':'ready';
    return {row:row.row,name:row.name,incoming:row.grade,learnerId:id,candidates:m.candidates,current,kind};});
}
