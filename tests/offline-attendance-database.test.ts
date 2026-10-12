// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {database} from './helpers/database';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
let db:PGlite;
beforeAll(async()=>{db=await database(25);},30000);
afterAll(async()=>{await db?.close();});
async function fixture(){
  const owner=randomUUID(),classId=randomUUID(),learner=randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'offline@example.com',now())",[owner]);
  await db.query("update profiles set access_status='active' where id=$1",[owner]);
  await db.query("insert into classes(id,teacher_id,name,subject,grade_level,school_year) values($1,$2,'Maya','Math','1','2026')",[classId,owner]);
  await db.query("insert into learners(id,teacher_id,first_name,last_name,display_name) values($1,$2,'Ana','Cruz','Ana Cruz')",[learner,owner]);
  await db.query("insert into class_enrollments(class_id,learner_id,status) values($1,$2,'active')",[classId,learner]);
  return {owner,classId,learner};
}
async function save(f:Awaited<ReturnType<typeof fixture>>,marks:Record<string,string>,baseline:Record<string,string>|null={},owner=f.owner){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
  try{return (await db.query<{result:{ok:boolean;error?:string;marks:Record<string,string>}}>('select save_attendance_day($1,$2,$3,$4) result',[f.classId,'2026-01-01',JSON.stringify(marks),baseline===null?null:JSON.stringify(baseline)])).rows[0].result;}finally{await db.exec('reset role');}
}
it('saves offline marks once and safely retries a lost response',async()=>{
  const f=await fixture(),marks={[f.learner]:'absent'};expect((await save(f,marks)).ok).toBe(true);expect((await save(f,marks)).ok).toBe(true);
  expect((await db.query('select * from attendance_entries where class_id=$1',[f.classId])).rows).toHaveLength(1);
});
it('keeps newer online attendance and permits a reviewed resolution',async()=>{
  const f=await fixture();await save(f,{[f.learner]:'present'});
  expect(await save(f,{[f.learner]:'absent'})).toMatchObject({ok:false,error:expect.stringContaining('changed online')});
  expect((await save(f,{[f.learner]:'absent'},{[f.learner]:'present'})).ok).toBe(true);
});
it('rejects another account and invalid or removed learners without partial writes',async()=>{
  const f=await fixture();await expect(save(f,{[f.learner]:'present'},{},randomUUID())).rejects.toThrow();
  expect((await save(f,{[f.learner]:'present',[randomUUID()]:'late'})).ok).toBe(false);
  expect((await db.query('select * from attendance_entries where class_id=$1',[f.classId])).rows).toHaveLength(0);
});
