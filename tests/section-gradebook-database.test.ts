// @vitest-environment node
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { database, migrate } from './helpers/database';
import { presetPeriods } from '@/features/gradebook/model';
let db:PGlite;
beforeAll(async()=>{db=await database();},30000);
afterAll(async()=>{await db?.close();});
async function owner(){const id=randomUUID();await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'gradebook-test@example.com',now())",[id]);await db.query("update profiles set access_status='active' where id=$1",[id]);return id;}
async function fixture(){
  const teacher=await owner(),sid=randomUUID(),lid=randomUUID(),subject=randomUUID(),period=randomUUID(),cid=randomUUID();
  await db.query("insert into sections(id,teacher_id,name,grade_level,school_year) values($1,$2,'Rizal','Grade 8','2026-2027')",[sid,teacher]);
  await db.query("insert into learners(id,teacher_id,display_name) values($1,$2,'Ana Cruz')",[lid,teacher]);
  await db.query('insert into section_enrollments(teacher_id,section_id,learner_id) values($1,$2,$3)',[teacher,sid,lid]);
  await db.query("insert into section_grade_periods(id,teacher_id,section_id,key,label,position) values($1,$2,$3,'period_1','Midyear',1)",[period,teacher,sid]);
  await db.query("insert into section_subjects(id,teacher_id,section_id,name,position) values($1,$2,$3,'Math',1)",[subject,teacher,sid]);
  await db.query("insert into classes(id,teacher_id,section_id,name,subject,grade_level,school_year) values($1,$2,$3,'Math class','Math','Grade 8','2026-2027')",[cid,teacher,sid]);
  await db.query('insert into class_enrollments(class_id,learner_id) values($1,$2)',[cid,lid]);
  return {teacher,sid,lid,subject,period,cid};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function actor(id:string,fn:()=>Promise<void>,role='authenticated'){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);try{await fn();}finally{await db.exec('reset role');}}
async function entries(f:Fixture){return (await db.query<{grade:string|null;source_type:string;updated_at:Date;source_class_id:string|null;source_snapshot:unknown}>('select * from section_grade_entries where section_id=$1',[f.sid])).rows;}
async function save(f:Fixture,grade:number|null=88,expected:string|null=null,extra:Record<string,unknown>={}){return db.query('select save_section_grades($1,$2,$3,$4::jsonb)',[f.sid,f.subject,f.period,JSON.stringify([{learner_id:f.lid,grade,expected_updated_at:expected,...extra}])]);}
async function copy(f:Fixture,grade=89,expected:string|null=null,replace=false,revision?:number){const rev=revision??Number((await db.query<{sync_revision:number}>('select sync_revision from classes where id=$1',[f.cid])).rows[0]?.sync_revision);return db.query("select save_section_grades($1,$2,$3,$4::jsonb,$5,$6,1,'printed')",[f.sid,f.subject,f.period,JSON.stringify([{learner_id:f.lid,grade,expected_updated_at:expected,replace_manual:replace}]),f.cid,rev]);}
const version=(value:Date|string)=>new Date(value).toISOString();
it.each(['quarters','terms','semesters','custom'] as const)('sets up %s with independent stable period identities',async preset=>{
  const f=await fixture();await db.query('delete from section_grade_periods where section_id=$1',[f.sid]);await db.query('delete from section_subjects where section_id=$1',[f.sid]);
  const periods=presetPeriods(preset);if(preset==='custom'){periods[0].label='Midyear';periods[1].label='Final';}
  await actor(f.teacher,async()=>{await db.query('select save_section_gradebook_setup($1,$2::jsonb,$3::jsonb,$4::jsonb)',[f.sid,JSON.stringify(periods),'[]','[]']);});
  expect((await db.query('select key,label from section_grade_periods where section_id=$1 order by position',[f.sid])).rows).toEqual(periods.map(({key,label})=>({key,label})));
});
it.each([['period_1','Other',2],['period_2','Other',1],['period_2',' \t\n',2],['period_2','Other',9]])('rejects invalid/duplicate period %s %s %s',async(key,label,position)=>{const f=await fixture();await expect(db.query('insert into section_grade_periods(teacher_id,section_id,key,label,position) values($1,$2,$3,$4,$5)',[f.teacher,f.sid,key,label,position])).rejects.toThrow();});
it('saves decimals, zero and missing distinctly; manual provenance strips extra data',async()=>{
  const f=await fixture();await actor(f.teacher,async()=>{await save(f,null);expect(await entries(f)).toHaveLength(0);await save(f,89.48);let row=(await entries(f))[0];expect(Number(row.grade)).toBe(89.48);expect(row.source_type).toBe('manual');expect(row.source_snapshot).toBeNull();await save(f,0,version(row.updated_at));row=(await entries(f))[0];expect(Number(row.grade)).toBe(0);await save(f,null,version(row.updated_at));expect((await entries(f))[0].grade).toBeNull();});
});
it.each([-1,101])('rejects grade %s atomically',async grade=>{const f=await fixture();await actor(f.teacher,async()=>{await expect(save(f,grade)).rejects.toThrow();expect(await entries(f)).toHaveLength(0);});});
it('saves 36 learners in one transaction, rolls back all on one invalid row, prevents duplicate cells',async()=>{
  const f=await fixture(),rows:{learner_id:string;grade:number;expected_updated_at:null}[]=[];
  for(let i=0;i<36;i++){const id=randomUUID();await db.query("insert into learners(id,teacher_id,display_name) values($1,$2,'Learner')",[id,f.teacher]);await db.query('insert into section_enrollments(teacher_id,section_id,learner_id) values($1,$2,$3)',[f.teacher,f.sid,id]);rows.push({learner_id:id,grade:80+i/10,expected_updated_at:null});}
  await actor(f.teacher,async()=>{const query=(r:unknown)=>db.query('select save_section_grades($1,$2,$3,$4::jsonb)',[f.sid,f.subject,f.period,JSON.stringify(r)]);await expect(query([...rows.slice(0,35),{...rows[35],grade:101}])).rejects.toThrow();expect(await entries(f)).toHaveLength(0);await query(rows);expect(await entries(f)).toHaveLength(36);await expect(query(rows)).rejects.toThrow(/changed/);expect(await entries(f)).toHaveLength(36);await expect(query([rows[0],rows[0]])).rejects.toThrow(/Duplicate/);});
});
it('rejects stale edits and keeps unchanged values and timestamps',async()=>{const f=await fixture();await actor(f.teacher,async()=>{await save(f);const before=(await entries(f))[0];await save(f,88,version(before.updated_at));expect(await entries(f)).toEqual([before]);await expect(save(f,90)).rejects.toThrow(/changed/);});});
it('rejects SQL-null configuration and bulk inputs rather than accepting empty mutations',async()=>{const f=await fixture();await actor(f.teacher,async()=>{await expect(db.query('select save_section_gradebook_setup($1,null,null,null)',[f.sid])).rejects.toThrow(/Invalid Grade Book configuration/);await expect(db.query('select save_section_grades($1,$2,$3,null)',[f.sid,f.subject,f.period])).rejects.toThrow(/Choose 1 to 500/);expect((await db.query('select id from section_grade_periods where section_id=$1',[f.sid])).rows).toHaveLength(1);});});
it('preserves inactive learner history and rejects new writes',async()=>{const f=await fixture();await actor(f.teacher,async()=>{await save(f);await db.query("update section_enrollments set status='inactive' where section_id=$1",[f.sid]);const row=(await entries(f))[0];await expect(save(f,90,version(row.updated_at))).rejects.toThrow(/active Section learner/);expect(Number((await entries(f))[0].grade)).toBe(88);});});
it('rejects outside learners and cross-owner cells even for privileged mistakes',async()=>{const f=await fixture(),other=await fixture();await actor(f.teacher,async()=>{await expect(save({...f,lid:other.lid})).rejects.toThrow();});await expect(db.query("insert into section_grade_entries(teacher_id,section_id,learner_id,section_subject_id,period_id,grade,source_type) values($1,$2,$3,$4,$5,88,'manual')",[other.teacher,f.sid,f.lid,f.subject,f.period])).rejects.toThrow();await expect(save({...f,period:other.period})).rejects.toThrow();await expect(save({...f,subject:other.subject})).rejects.toThrow();});
it('retains subjects and periods containing grades; supports safe rename, reorder and inactive status',async()=>{
  const f=await fixture();await actor(f.teacher,async()=>{await save(f);await expect(db.query('delete from section_grade_periods where id=$1',[f.period])).rejects.toThrow(/foreign key/);await expect(db.query('delete from section_subjects where id=$1',[f.subject])).rejects.toThrow(/foreign key/);await db.query("update section_grade_periods set label='Final',position=2 where id=$1",[f.period]);await db.query("update section_subjects set name='Mathematics',position=5,status='inactive' where id=$1",[f.subject]);expect(await entries(f)).toHaveLength(1);await expect(save(f,90,version((await entries(f))[0].updated_at))).rejects.toThrow(/active Section subject/);await expect(db.query("update section_grade_periods set key='period_new' where id=$1",[f.period])).rejects.toThrow(/stable/);});
});
it('allows duplicate names with independent UUIDs and persists local subject order',async()=>{const f=await fixture();for(let i=2;i<=5;i++)await db.query("insert into section_subjects(teacher_id,section_id,name,position) values($1,$2,'Math',$3)",[f.teacher,f.sid,i]);expect((await db.query('select id from section_subjects where section_id=$1 order by position',[f.sid])).rows).toHaveLength(5);for(let i=0;i<3;i++){const other=await fixture();expect((await db.query('select name from section_subjects where section_id=$1',[other.sid])).rows).toEqual([{name:'Math'}]);}});
it('requires reviewed manual replacement, records minimal class provenance and does not touch class sync',async()=>{
  const f=await fixture(),before=(await db.query('select class_record_snapshot($1) value',[f.cid])).rows;
  await actor(f.teacher,async()=>{await save(f);const row=(await entries(f))[0];await expect(copy(f,89,version(row.updated_at))).rejects.toThrow(/Explicitly/);await copy(f,89,version(row.updated_at),true);const copied=(await entries(f))[0];expect(copied.source_type).toBe('teacherco_class');expect(Object.keys(copied.source_snapshot as object).sort()).toEqual(['calculation','original_grade','sync_revision','term']);await save(f,90,version(copied.updated_at));expect((await entries(f))[0].source_type).toBe('manual');});
  expect((await db.query('select class_record_snapshot($1) value',[f.cid])).rows).toEqual(before);expect((await db.query('select id from class_record_sync_versions where class_id=$1',[f.cid])).rows).toHaveLength(0);
});
it('rejects unlinked, other-owner and stale source classes',async()=>{const f=await fixture(),other=await fixture();await actor(f.teacher,async()=>{await expect(copy(f,89,null,false,-1)).rejects.toThrow(/changed/);await expect(copy({...f,cid:other.cid},89,null,false,0)).rejects.toThrow(/changed/);await db.query('update classes set section_id=null where id=$1',[f.cid]);await expect(copy(f)).rejects.toThrow(/changed/);});});
it('class deletion preserves copied grades even in an archived Section',async()=>{const f=await fixture();await actor(f.teacher,async()=>{await copy(f);await db.query("update sections set status='archived' where id=$1",[f.sid]);await db.query('delete from classes where id=$1',[f.cid]);const row=(await entries(f))[0];expect(Number(row.grade)).toBe(89);expect(row.source_class_id).toBeNull();expect(row.source_type).toBe('teacherco_class');expect(row.source_snapshot).not.toBeNull();});});
it('archived Sections are readable but cannot be edited or have setup deleted',async()=>{const f=await fixture();await actor(f.teacher,async()=>{await save(f);await db.query("update sections set status='archived' where id=$1",[f.sid]);await expect(save(f,90,version((await entries(f))[0].updated_at))).rejects.toThrow(/Active owned/);await expect(db.query("update section_subjects set name='Other' where id=$1",[f.subject])).rejects.toThrow(/Reactivate/);await db.query('delete from section_grade_periods where id=$1',[f.period]);expect((await db.query('select id from section_grade_periods where id=$1',[f.period])).rows).toHaveLength(1);});});
it.each(['pending','suspended','unverified','other','admin','anon'])('denies %s access on all three tables and atomic writes',async state=>{
  const f=await fixture();await actor(f.teacher,async()=>{await save(f);});let id=f.teacher;
  if(state==='pending'||state==='suspended')await db.query('update profiles set access_status=$1 where id=$2',[state,id]);
  if(state==='unverified')await db.query('update auth.users set email_confirmed_at=null where id=$1',[id]);
  if(state==='other'||state==='admin'){id=await owner();if(state==='admin')await db.query("update profiles set role='admin' where id=$1",[id]);}
  await actor(id,async()=>{for(const table of ['section_grade_periods','section_subjects','section_grade_entries']){const query=db.query(`select id from ${table} where section_id=$1`,[f.sid]);if(state==='anon')await expect(query).rejects.toThrow(/permission/);else expect((await query).rows).toHaveLength(0);}await expect(save(f)).rejects.toThrow();},state==='anon'?'anon':'authenticated');
});
it('deleting a teacher account removes owned gradebooks without foreign-key failures',async()=>{const f=await fixture();await actor(f.teacher,async()=>{await copy(f);});await db.query('delete from auth.users where id=$1',[f.teacher]);expect(await entries(f)).toHaveLength(0);});
it('configuration saves atomically reorder identities and reject stale setup or destructive removal',async()=>{
  const f=await fixture();const load=async()=>({periods:(await db.query<{id:string;updated_at:Date;position:number}>('select * from section_grade_periods where section_id=$1 order by position',[f.sid])).rows,subjects:(await db.query<{id:string;updated_at:Date;position:number}>('select * from section_subjects where section_id=$1 order by position',[f.sid])).rows});
  await actor(f.teacher,async()=>{
    const initial=await load();const expected=[...initial.periods,...initial.subjects].map(r=>({id:r.id,updated_at:version(r.updated_at)}));
    const periods=[{...initial.periods[0],position:2},{id:randomUUID(),key:'period_final',label:'Final',position:1,status:'active'}];
    const setup=(ps:unknown,ss:unknown,ex:unknown)=>db.query('select save_section_gradebook_setup($1,$2::jsonb,$3::jsonb,$4::jsonb)',[f.sid,JSON.stringify(ps),JSON.stringify(ss),JSON.stringify(ex)]);
    await setup(periods,initial.subjects,expected);expect((await load()).periods.map(p=>p.id)).toEqual([periods[1].id,f.period]);await expect(setup(periods,initial.subjects,expected)).rejects.toThrow(/changed/);
    await save(f);const current=await load(),versions=[...current.periods,...current.subjects].map(r=>({id:r.id,updated_at:version(r.updated_at)}));
    await expect(setup([current.periods[0]],current.subjects,versions)).rejects.toThrow(/foreign key/);expect((await load()).periods).toHaveLength(2);expect(await entries(f)).toHaveLength(1);
    await expect(setup(current.periods,[{...current.subjects[0],name:''}],versions)).rejects.toThrow();expect(await load()).toEqual(current);
  });
});
it('upgrades populated 0016 without changing old rows',async()=>{
  const old=await database(16);
  try{
    const id=randomUUID(),sid=randomUUID(),cid=randomUUID(),lid=randomUUID(),assessment=randomUUID();
    await old.query("insert into auth.users(id,email,email_confirmed_at) values($1,'upgrade@example.com',now())",[id]);
    await old.query("insert into sections(id,teacher_id,name,grade_level,school_year) values($1,$2,'Rizal','Grade 8','2026')",[sid,id]);
    await old.query("insert into classes(id,teacher_id,section_id,name,subject,grade_level,school_year) values($1,$2,$3,'Math class','Math','Grade 8','2026')",[cid,id,sid]);
    await old.query("insert into learners(id,teacher_id,display_name) values($1,$2,'Ana Cruz')",[lid,id]);
    await old.query('insert into section_enrollments(teacher_id,section_id,learner_id) values($1,$2,$3)',[id,sid,lid]);
    await old.query('insert into class_enrollments(class_id,learner_id) values($1,$2)',[cid,lid]);
    await old.query("insert into assessments(id,class_id,title,kind,source,total_points,term,component) values($1,$2,'Term 1 Performance Task','mixed','manual',100,1,'performance_task')",[assessment,cid]);
    await old.query("insert into submissions(assessment_id,learner_id,score,max_score,review_status) values($1,$2,88.5,100,'confirmed')",[assessment,lid]);
    await old.query('insert into teacher_term_grades(class_id,learner_id,term,term_grade) values($1,$2,1,89)',[cid,lid]);
    await old.query("insert into attendance_entries(class_id,learner_id,attendance_date,status) values($1,$2,'2026-10-05','present')",[cid,lid]);
    await old.query("insert into reports(teacher_id,class_id,report_type,evidence_snapshot) values($1,$2,'class_performance','{}')",[id,cid]);
    const tables=(await old.query<{tablename:string}>("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
    const snapshot=async()=>Promise.all(tables.map(async t=>({table:t.tablename,rows:(await old.query(`select to_jsonb(t) as row from public.${t.tablename} t order by to_jsonb(t)::text`)).rows})));
    const before=await snapshot();await migrate(old,17,17);expect(await snapshot()).toEqual(before);
  }finally{await old.close();}
},30000);
