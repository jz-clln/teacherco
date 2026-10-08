// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, migrate } from "./helpers/database";
import { buildSyncPlan, type Snapshot, type SyncInput } from "@/features/records/sync-model";

let db: PGlite;
beforeAll(async () => { db = await database(); }, 30000);
afterAll(async () => { await db?.close(); });
async function owner() {
  const id = randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'section-test@example.com',now())", [id]);
  await db.query("update profiles set access_status='active' where id=$1", [id]);
  return id;
}
async function section(teacher: string, adviser = false) {
  const id = randomUUID();
  await db.query("insert into sections(id,teacher_id,name,grade_level,school_year,school_id,is_adviser) values($1,$2,'Rizal','Grade 8','2026-2027','123',$3)", [id, teacher, adviser]);
  return id;
}
async function classroom(teacher: string, sectionId: string | null = null, subject = 'Math') {
  const id = randomUUID();
  await db.query("insert into classes(id,teacher_id,name,subject,grade_level,school_year,school_id,section_id,section) values($1,$2,'Class display label',$3,'Grade 8','2026-2027','123',$4,'Different workbook label')", [id, teacher, subject, sectionId]);
  return id;
}
async function learner(teacher: string) {
  const id = randomUUID();
  await db.query("insert into learners(id,teacher_id,display_name,first_name,last_name) values($1,$2,'Ana Cruz','Ana','Cruz')", [id, teacher]);
  return id;
}
async function enroll(teacher: string, sid: string, lid: string) {
  await db.query("insert into section_enrollments(teacher_id,section_id,learner_id) values($1,$2,$3)", [teacher, sid, lid]);
}
async function role(user: string, fn: () => Promise<void>, name = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${name}`);
  try { await fn(); } finally { await db.exec('reset role'); }
}
async function fixture() {
  const teacher = await owner(), sid = await section(teacher), cid = await classroom(teacher, sid), lid = await learner(teacher);
  await enroll(teacher, sid, lid);
  await db.query('insert into class_enrollments(class_id,learner_id) values($1,$2)', [cid, lid]);
  return { teacher, sid, cid, lid };
}
async function snapshot(cid: string) {
  return (await db.query<{ value: Snapshot }>('select class_record_snapshot($1) value', [cid])).rows[0].value;
}

describe('complete migration chain and academic Sections', () => {
  it('links equivalent school-year formatting without rewriting either record or weakening context guards', async () => {
    const teacher=await owner(),sid=await section(teacher),cid=await classroom(teacher);
    for(const year of ['2026–2027','2026 — 2027',' 2026\u00a0-\u00a02027 ','SY 2026–2027','S.Y. 2026-2027','School Year 2026/2027']) {
      await db.query('update classes set section_id=null,school_year=$1 where id=$2',[year,cid]);
      await role(teacher,async()=>{await db.query('update classes set section_id=$1 where id=$2',[sid,cid]);});
      expect((await db.query<{school_year:string}>('select school_year from classes where id=$1',[cid])).rows[0].school_year).toBe(year);
    }
    await expect(db.query("update classes set school_year='2025-2026' where id=$1",[cid])).rejects.toThrow();
    await expect(db.query("update sections set school_year='2027-2028' where id=$1",[sid])).rejects.toThrow();
    await expect(db.query("update classes set grade_level='Grade 7' where id=$1",[cid])).rejects.toThrow();
    await expect(db.query("update classes set school_id='456' where id=$1",[cid])).rejects.toThrow();
  });
  it('validates the rollback-only remote smoke script locally', async () => {
    await db.exec(readFileSync('tests/sql/academic-sections-smoke.sql', 'utf8'));
  });
  it('supports four independent Sections for one subject and five subjects for one Section', async () => {
    const teacher = await owner();
    for (let n = 0; n < 4; n++) await classroom(teacher, await section(teacher));
    const sid = await section(teacher, true);
    for (const subject of ['Math', 'English', 'Science', 'Filipino', 'Araling Panlipunan']) await classroom(teacher, sid, subject);
    expect((await db.query('select id from classes where section_id=$1', [sid])).rows).toHaveLength(5);
    expect((await db.query('select id from sections where teacher_id=$1', [teacher])).rows).toHaveLength(5);
  });
  it('allows adviser-only and similarly named Sections without creating classes', async () => {
    const teacher = await owner(); await section(teacher, true); await section(teacher, true);
    expect((await db.query('select id from classes where teacher_id=$1', [teacher])).rows).toHaveLength(0);
  });
  it('keeps independent rosters, reusable learner IDs and separate duplicate names', async () => {
    const f = await fixture(), secondClass = await classroom(f.teacher, f.sid), otherLearner = await learner(f.teacher);
    await enroll(f.teacher, f.sid, otherLearner);
    await db.query('insert into class_enrollments(class_id,learner_id) values($1,$2)', [secondClass, f.lid]);
    expect((await db.query('select id from section_enrollments where section_id=$1', [f.sid])).rows).toHaveLength(2);
    expect((await db.query('select id from class_enrollments where class_id=$1', [secondClass])).rows).toHaveLength(1);
    await expect(enroll(f.teacher, f.sid, f.lid)).rejects.toThrow(/unique/);
  });
  it('rejects cross-owner relationships even for privileged callers', async () => {
    const f = await fixture(), other = await owner(), otherSection = await section(other), otherLearner = await learner(other);
    await expect(db.query('update classes set section_id=$1 where id=$2', [otherSection, f.cid])).rejects.toThrow();
    await expect(enroll(f.teacher, f.sid, otherLearner)).rejects.toThrow(/foreign key/);
    await expect(enroll(other, f.sid, otherLearner)).rejects.toThrow(/foreign key/);
  });
  it('permits active owners and denies anonymous access to both new tables', async () => {
    const f = await fixture();
    await role(f.teacher, async () => {
      expect((await db.query('select id from sections where id=$1', [f.sid])).rows).toHaveLength(1);
      expect((await db.query('select id from section_enrollments where section_id=$1', [f.sid])).rows).toHaveLength(1);
      await section(f.teacher);
      await db.query("update section_enrollments set status='inactive' where section_id=$1", [f.sid]);
      await expect(db.query('delete from section_enrollments where section_id=$1', [f.sid])).rejects.toThrow(/permission denied/);
    });
    await role(f.teacher, async () => {
      for (const table of ['sections', 'section_enrollments']) await expect(db.query(`select id from ${table}`)).rejects.toThrow(/permission denied/);
    }, 'anon');
  });
  it.each(['pending', 'suspended', 'unverified'])('blocks %s teachers from reading or writing Sections and enrollments', async (state) => {
    const f = await fixture();
    if (state === 'unverified') await db.query('update auth.users set email_confirmed_at=null where id=$1', [f.teacher]);
    else await db.query('update profiles set access_status=$1 where id=$2', [state, f.teacher]);
    await role(f.teacher, async () => {
      expect((await db.query('select id from sections')).rows).toHaveLength(0);
      expect((await db.query('select id from section_enrollments')).rows).toHaveLength(0);
      await expect(section(f.teacher)).rejects.toThrow(/row-level security/);
      await expect(enroll(f.teacher, f.sid, randomUUID())).rejects.toThrow(/row-level security/);
      expect((await db.query("update sections set name='forbidden' returning id")).rows).toHaveLength(0);
    });
  });
  it('does not give an application admin cross-teacher academic access', async () => {
    const f = await fixture(), admin = await owner();
    await db.query("update profiles set role='admin' where id=$1", [admin]);
    await role(admin, async () => {
      expect((await db.query('select id from sections where id=$1', [f.sid])).rows).toHaveLength(0);
      expect((await db.query('select id from section_enrollments where section_id=$1', [f.sid])).rows).toHaveLength(0);
      await expect(enroll(admin, f.sid, await learner(admin))).rejects.toThrow(/foreign key/);
    });
  });
  it('protects owner and enrollment relationship identity', async () => {
    const f = await fixture(), other = await owner();
    await expect(db.query('update sections set teacher_id=$1 where id=$2', [other, f.sid])).rejects.toThrow(/ownership/);
    for (const field of ['teacher_id', 'section_id', 'learner_id']) {
      await expect(db.query(`update section_enrollments set ${field}=$1 where section_id=$2`, [randomUUID(), f.sid])).rejects.toThrow(/identity/);
    }
  });
  it('archives only the Section and neither bumps revision nor creates history', async () => {
    const f = await fixture(), before = await snapshot(f.cid);
    await db.query("update sections set status='archived',name='New display name',is_adviser=true where id=$1", [f.sid]);
    await db.query("update section_enrollments set status='inactive' where section_id=$1", [f.sid]);
    expect(await snapshot(f.cid)).toEqual(before);
    expect((await db.query('select status from classes where id=$1', [f.cid])).rows[0]).toEqual({ status: 'active' });
    expect((await db.query('select id from class_record_sync_versions where class_id=$1', [f.cid])).rows).toHaveLength(0);
  });
  it('blocks linked Section deletion; unlinking permits membership cascade without deleting learners/classes', async () => {
    const f = await fixture();
    await expect(db.query('delete from sections where id=$1', [f.sid])).rejects.toThrow(/foreign key/);
    const before = await snapshot(f.cid);
    await db.query('update classes set section_id=null where id=$1', [f.cid]);
    expect(await snapshot(f.cid)).toEqual(before);
    await role(f.teacher, async () => { await db.query('delete from sections where id=$1', [f.sid]); });
    expect((await db.query('select id from section_enrollments where section_id=$1', [f.sid])).rows).toHaveLength(0);
    expect(await snapshot(f.cid)).toEqual(before);
  });
  it('class deletion and class roster removal retain Section memberships', async () => {
    const f = await fixture();
    await db.query('delete from class_enrollments where class_id=$1', [f.cid]);
    await db.query('delete from classes where id=$1', [f.cid]);
    expect((await db.query('select id from sections where id=$1', [f.sid])).rows).toHaveLength(1);
    expect((await db.query('select id from section_enrollments where section_id=$1', [f.sid])).rows).toHaveLength(1);
    await expect(db.query('delete from learners where id=$1', [f.lid])).rejects.toThrow(/foreign key/);
    await db.query("update section_enrollments set status='inactive' where section_id=$1", [f.sid]);
    await expect(db.query('delete from learners where id=$1', [f.lid])).rejects.toThrow(/foreign key/);
  });
  it('allows authenticated delete-all in dependency order and complete account cascades', async () => {
    const f = await fixture();
    await role(f.teacher, async () => {
      await db.query('delete from classes where teacher_id=$1', [f.teacher]);
      await db.query('delete from sections where teacher_id=$1', [f.teacher]);
      await db.query('delete from learners where teacher_id=$1', [f.teacher]);
    });
    const account = await fixture();
    await db.query('delete from auth.users where id=$1', [account.teacher]);
    for (const table of ['classes', 'sections', 'section_enrollments', 'learners']) {
      expect((await db.query(`select id from ${table} where teacher_id=$1`, [account.teacher])).rows).toHaveLength(0);
    }
  });
  it.each([['grade_level', 'Grade 9'], ['school_year', '2027-2028'], ['school_id', '999']])('blocks conflicting %s updates on either side and linking', async (field, value) => {
    const f = await fixture();
    await expect(db.query(`update classes set ${field}=$1 where id=$2`, [value, f.cid])).rejects.toThrow(/conflicts/);
    await expect(db.query(`update sections set ${field}=$1 where id=$2`, [value, f.sid])).rejects.toThrow(/conflicts/);
    await db.query('update classes set section_id=null where id=$1', [f.cid]);
    await db.query(`update classes set ${field}=$1 where id=$2`, [value, f.cid]);
    await expect(db.query('update classes set section_id=$1 where id=$2', [f.sid, f.cid])).rejects.toThrow(/conflicts/);
  });
  it('compares harmless formatting without rewriting values or requiring matching display labels', async () => {
    const f = await fixture();
    await db.query("update classes set grade_level='  GRADE   8 ',school_year=' 2026-2027 ',school_name='Workbook school',school_id=null where id=$1", [f.cid]);
    await db.query("update sections set school_name='Different school label',school_id='456' where id=$1", [f.sid]);
    expect((await db.query('select grade_level,section from classes where id=$1', [f.cid])).rows[0]).toEqual({ grade_level: '  GRADE   8 ', section: 'Different workbook label' });
  });
  it('rejects invalid Section values and has no persistent learner identifiers', async () => {
    const f = await fixture();
    for (const [field, value] of [['name', ' '], ['name', '\t\n'], ['grade_level', ''], ['school_year', '\t'], ['name', 'x'.repeat(121)], ['school_name', 'x'.repeat(161)], ['school_id', 'x'.repeat(31)], ['status', 'inactive']]) {
      await expect(db.query(`update sections set ${field}=$1 where id=$2`, [value, f.sid])).rejects.toThrow();
    }
    expect((await db.query("select column_name from information_schema.columns where table_schema='public' and table_name in ('sections','section_enrollments','learners') and column_name in ('lrn','external_ref','learner_number','student_number')")).rows).toHaveLength(0);
  });
  it('runs existing sync on a linked class, preserving class-scoped history and Section roster', async () => {
    const f = await fixture(), before = await snapshot(f.cid);
    const input: SyncInput = { filename: 'section-test.xlsx', learners: [{ firstName: 'Ana', lastName: 'Cruz' }], sheets: [{ term: 1, learners: [{ firstName: 'Ana', lastName: 'Cruz', recordedGrade: { initialGrade: null, termGrade: null, descriptor: null } }], columns: [{ title: 'Term 1 · Written Work 1', total: 10, scores: [8] }] }], attendance: [] };
    await db.query('select apply_class_record_sync($1,$2,$3,$4,$5,$6)', [f.teacher, f.cid, randomUUID(), before.revision, JSON.stringify(input), JSON.stringify(buildSyncPlan(input, before))]);
    expect((await snapshot(f.cid)).scores[0].score).toBe(8);
    expect((await db.query('select class_id from class_record_sync_versions where teacher_id=$1', [f.teacher])).rows).toEqual([{ class_id: f.cid }]);
    expect((await db.query('select learner_id from section_enrollments where section_id=$1', [f.sid])).rows).toEqual([{ learner_id: f.lid }]);
  });
});

it('upgrades populated 0015 without changing IDs, data, term 4, snapshots, reports or legacy metadata', async () => {
  const old = await database(15);
  try {
    const teacher = randomUUID(), cid = randomUUID(), lid = randomUUID(), aid = randomUUID();
    await old.query("insert into auth.users(id,email,email_confirmed_at) values($1,'upgrade@example.com',now())", [teacher]);
    await old.query("update profiles set access_status='active' where id=$1", [teacher]);
    await old.query("insert into classes(id,teacher_id,name,subject,grade_level,school_year,section,adviser) values($1,$2,'Legacy','Math','8','2025-2026','Old label','Old adviser')", [cid, teacher]);
    await old.query("insert into learners(id,teacher_id,display_name) values($1,$2,'Legacy learner')", [lid, teacher]);
    await old.query('insert into class_enrollments(class_id,learner_id) values($1,$2)', [cid, lid]);
    await old.query("insert into assessments(id,class_id,title,kind,source,term) values($1,$2,'Quarter 4','mixed','imported',4)", [aid, cid]);
    await old.query('insert into submissions(assessment_id,learner_id,score,max_score) values($1,$2,8,10)', [aid, lid]);
    await old.query('insert into teacher_term_grades(class_id,learner_id,term,term_grade) values($1,$2,4,85)', [cid, lid]);
    await old.query("insert into class_grading_config(class_id,weights,transmutation,descriptors,verified) values($1,'{\"written_work\":0.3}','[]','[]',true)", [cid]);
    await old.query("insert into attendance_entries(class_id,learner_id,attendance_date,status) values($1,$2,'2026-01-01','present')", [cid, lid]);
    await old.query("insert into reports(teacher_id,class_id,report_type,evidence_snapshot) values($1,$2,'class_performance','{}')", [teacher, cid]);
    await old.query("insert into class_record_sync_versions(class_id,teacher_id,request_id,version_number,filename,changes,before_snapshot,after_snapshot,uploaded_snapshot) values($1,$2,$3,1,'old.xlsx','[]','{}','{}','{}')", [cid, teacher, randomUUID()]);
    const tables = ['classes', 'learners', 'class_enrollments', 'assessments', 'submissions', 'teacher_term_grades', 'class_grading_config', 'attendance_entries', 'reports', 'class_record_sync_versions'];
    const before = await Promise.all(tables.map(t => old.query(`select to_jsonb(t) value from ${t} t`)));
    await migrate(old, 16, 16);
    for (let i = 0; i < tables.length; i++) {
      const expression = tables[i] === 'classes' ? "to_jsonb(t) - 'section_id'" : 'to_jsonb(t)';
      expect((await old.query(`select ${expression} value from ${tables[i]} t`)).rows).toEqual(before[i].rows);
    }
    expect((await old.query('select section_id from classes')).rows).toEqual([{ section_id: null }]);
    expect((await old.query('select id from sections')).rows).toHaveLength(0);
  } finally { await old.close(); }
}, 30000);
