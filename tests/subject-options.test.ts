// @vitest-environment node
import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readSubjectOptions} from '@/features/classes/subject-options';
import type {SectionDb} from '@/features/sections/data';
it('reuses class and custom Section subjects with teacher scoping and normalized duplicates',async()=>{
  const scope:unknown[]=[];
  const db={from:(table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{scope.push(args);return q;},order:()=>q,range:async()=>({data:table==='classes'?[{subject:' Calculus '},{subject:'CALCULUS'}]:[{name:'Astronomy'},{name:'Calculus'}],error:null})};return q;}};
  const options=await readSubjectOptions(db as unknown as SectionDb,'teacher-id');expect(options.filter(n=>n.toLowerCase()==='calculus')).toEqual(['Calculus']);expect(options).toContain('Astronomy');expect(options).toContain('Mathematics');expect(scope).toEqual([['teacher_id','teacher-id'],['teacher_id','teacher-id']]);
});
it('reports failed saved-subject reads instead of silently showing an empty list',async()=>{
  const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:null,error:{message:'offline'}})};
  await expect(readSubjectOptions({from:()=>q} as unknown as SectionDb,'teacher')).rejects.toThrow('Could not load saved subjects');
});
