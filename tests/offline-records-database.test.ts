// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {database} from './helpers/database';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {project,type OfflineRow} from '../public/offline-records.js';
let db:PGlite;
beforeAll(async()=>{db=await database(26);},30000);
afterAll(async()=>{await db?.close();});
async function owner(){const id=randomUUID();await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'offline@example.com',now())",[id]);await db.query("update profiles set access_status='active' where id=$1",[id]);return id;}
async function save(owner:string,table:string,row:OfflineRow,before:OfflineRow|null=null,operation=randomUUID()){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
  try{return (await db.query<{r:{ok:boolean;error?:string;row:OfflineRow;current?:OfflineRow}}>('select sync_offline_record($1,$2,$3,$4) r',[operation,table,JSON.stringify(row),before===null?null:JSON.stringify(project(table,before))])).rows[0].r;}
  finally{await db.exec('reset role');}
}
const classroom=(teacher_id:string)=>({id:randomUUID(),teacher_id,name:'Maya',subject:'Math',grade_level:'1',school_year:'2026',status:'active'});
it('syncs a new class, learner, enrollment, activity and score in dependency order',async()=>{
  const teacher=await owner(),c=classroom(teacher),l={id:randomUUID(),teacher_id:teacher,first_name:'Ana',last_name:'Cruz',display_name:'Ana Cruz'};
  expect((await save(teacher,'classes',c)).ok).toBe(true);
  expect((await save(teacher,'learners',l)).ok).toBe(true);
  expect((await save(teacher,'class_enrollments',{id:randomUUID(),class_id:c.id,learner_id:l.id,status:'active'})).ok).toBe(true);
  const a={id:randomUUID(),class_id:c.id,title:'Term 1 Written Work',activity_slot:'Term 1 · Written Work 1',term:1,component:'written_work',total_points:20,source:'manual',status:'active'};
  expect((await save(teacher,'assessments',a)).ok).toBe(true);
  expect((await save(teacher,'assessments',{...a,id:randomUUID()})).ok).toBe(false);
  const s={id:randomUUID(),assessment_id:a.id,learner_id:l.id,score:18,max_score:20,review_status:'confirmed'},op=randomUUID();
  expect((await save(teacher,'submissions',s,null,op)).ok).toBe(true);
  const updated={...s,score:19};expect((await save(teacher,'submissions',updated,s)).ok).toBe(true);
  expect((await save(teacher,'assessments',{...a,total_points:30},a)).ok).toBe(false);
  expect((await save(teacher,'submissions',{...s,score:17},s))).toMatchObject({ok:false,current:{score:19}});
  expect((await save(teacher,'submissions',s,null,op)).ok).toBe(true);
  expect((await db.query<{score:number}>('select score from submissions where id=$1',[s.id])).rows[0].score).toBe('19.00');
});
it('detects concurrent edits and permits a reviewed overwrite without losing unrelated fields',async()=>{
  const teacher=await owner(),c=classroom(teacher);await save(teacher,'classes',c);
  await db.query("update classes set name='Online Maya',school_name='Preserved School' where id=$1",[c.id]);
  const changed={...c,name:'Device Maya'},result=await save(teacher,'classes',changed,c);
  expect(result).toMatchObject({ok:false,current:{name:'Online Maya'}});
  expect((await save(teacher,'classes',changed,result.current!)).row.school_name).toBe('Preserved School');
});
it('rejects cross-account records and reassigned relationships',async()=>{
  const teacher=await owner(),other=await owner(),c=classroom(other);await save(other,'classes',c);
  await expect(save(teacher,'classes',{...c,name:'Stolen'},c)).rejects.toThrow();
  await expect(save(teacher,'assessments',{id:randomUUID(),class_id:c.id,title:'Unauthorized',activity_slot:'Term 1 · Written Work 1',term:1,component:'written_work',total_points:20,source:'manual',status:'active'})).rejects.toThrow();
});
it('does not resurrect a deleted record when replaying an acknowledged creation',async()=>{
  const teacher=await owner(),c=classroom(teacher),operation=randomUUID();await save(teacher,'classes',c,null,operation);
  await db.query('delete from classes where id=$1',[c.id]);
  expect(await save(teacher,'classes',c,null,operation)).toMatchObject({ok:true,row:null});
  expect((await db.query('select * from classes where id=$1',[c.id])).rows).toHaveLength(0);
});
it('supports Section grades without inventing import provenance',async()=>{
  const teacher=await owner(),section={id:randomUUID(),teacher_id:teacher,name:'Maya',grade_level:'1',school_year:'2026',status:'active'};
  const l={id:randomUUID(),teacher_id:teacher,first_name:'Ana',last_name:'Cruz',display_name:'Ana Cruz'};
  await save(teacher,'sections',section);await save(teacher,'learners',l);
  expect((await save(teacher,'section_enrollments',{id:randomUUID(),teacher_id:teacher,section_id:section.id,learner_id:l.id,status:'active'})).ok).toBe(true);
  const subject={id:randomUUID(),teacher_id:teacher,section_id:section.id,name:'Math',position:1,status:'active'},period={id:randomUUID(),teacher_id:teacher,section_id:section.id,key:'period_1',label:'Term 1',position:1,status:'active'};
  await save(teacher,'section_subjects',subject);await save(teacher,'section_grade_periods',period);
  const grade={id:randomUUID(),teacher_id:teacher,section_id:section.id,learner_id:l.id,section_subject_id:subject.id,period_id:period.id,grade:88,source_type:'manual'};
  const saved=await save(teacher,'section_grade_entries',grade);expect(saved.ok).toBe(true);expect(saved.row.source_snapshot).toBe(null);
  expect((await save(teacher,'section_grade_entries',{...grade,grade:101},grade)).ok).toBe(false);
});
