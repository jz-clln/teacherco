// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { database } from "./helpers/database";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSyncPlan, type Snapshot, type SyncInput, type SyncPlan } from "@/features/records/sync-model";

let db: PGlite;
beforeAll(async () => {
  db = await database();
}, 30000);
afterAll(async () => { await db?.close(); });

async function fixture() {
  const userId = randomUUID(), classId = randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'teacher@example.com',now())", [userId]);
  await db.query("update public.profiles set access_status='active' where id=$1", [userId]);
  await db.query("insert into public.classes(id,teacher_id,name,subject,grade_level,school_year) values($1,$2,'Class A','Math','1','2026')", [classId, userId]);
  const input: SyncInput = { filename: "updated.xlsx", learners: [{ firstName: "Ana", lastName: "Cruz" }], sheets: [{ term: 1, learners: [{ firstName: "Ana", lastName: "Cruz", recordedGrade: { initialGrade: 80, termGrade: 85, descriptor: "Proficient" } }], columns: [{ title: "Term 1 · Written Work 1", total: 10, scores: [8] }] }], attendance: [{ firstName: "Ana", lastName: "Cruz", date: "2026-10-01", status: "present" }] };
  return { userId, classId, input };
}
async function snapshot(classId: string) { return (await db.query<{ snapshot: Snapshot }>("select public.class_record_snapshot($1) snapshot", [classId])).rows[0].snapshot; }
async function apply(f: Awaited<ReturnType<typeof fixture>>, requestId = randomUUID(), current?: Snapshot, override?: SyncPlan) {
  const before = current ?? await snapshot(f.classId);
  return (await db.query<{ result: { version: number; id: string } }>("select public.apply_class_record_sync($1,$2,$3,$4,$5,$6) result", [f.userId, f.classId, requestId, before.revision, JSON.stringify(f.input), JSON.stringify(override ?? buildSyncPlan(f.input, before))])).rows[0].result;
}
async function asRole(role: string, userId: string, fn: () => Promise<void>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec(`set role ${role}`);
  try { await fn(); } finally { await db.exec("reset role"); }
}

describe("record sync database transactions and privacy", () => {
  it("atomically adds learners, scores, printed grades, attendance and before/after history", async () => {
    const f = await fixture(); const saved = await apply(f); expect(saved.version).toBe(1);
    const current = await snapshot(f.classId);
    expect(current.learners).toHaveLength(1); expect(current.scores[0].score).toBe(8); expect(current.grades[0].term_grade).toBe(85); expect(current.attendance[0].status).toBe("present");
    const history = (await db.query<{ before_snapshot: Snapshot; after_snapshot: Snapshot }>("select before_snapshot,after_snapshot from public.class_record_sync_versions where id=$1", [saved.id])).rows[0];
    expect(history.before_snapshot.learners).toHaveLength(0); expect(history.after_snapshot.scores[0].score).toBe(8);
    expect(current.revision).toBe(1); // one class update even though several tables were written
  });
  it("retrying the same request cannot duplicate learners or versions", async () => {
    const f = await fixture(), request = randomUUID(), before = await snapshot(f.classId);
    expect(await apply(f, request, before)).toEqual(await apply(f, request, before));
    expect((await snapshot(f.classId)).learners).toHaveLength(1);
    expect((await db.query("select id from public.class_record_sync_versions where class_id=$1", [f.classId])).rows).toHaveLength(1);
  });
  it("rolls back all writes and history when a later write fails", async () => {
    const f = await fixture(), before = await snapshot(f.classId), plan = buildSyncPlan(f.input, before);
    plan.attendance[0].status = "invalid";
    await expect(apply(f, randomUUID(), before, plan)).rejects.toThrow();
    expect(await snapshot(f.classId)).toEqual(before);
    expect((await db.query("select id from public.class_record_sync_versions where class_id=$1", [f.classId])).rows).toHaveLength(0);
  });
  it("rejects a stale review after a normal attendance edit", async () => {
    const f = await fixture(); await apply(f); const before = await snapshot(f.classId);
    await db.query("update public.attendance_entries set status='late' where class_id=$1", [f.classId]);
    f.input.sheets[0].columns[0].scores = [9];
    await expect(apply(f, randomUUID(), before)).rejects.toThrow(/class changed/);
    expect((await snapshot(f.classId)).scores[0].score).toBe(8);
  });
  it("old imported-score RPC writes also invalidate pending reviews", async () => {
    const f = await fixture(); await apply(f); const before = await snapshot(f.classId);
    await asRole("authenticated", f.userId, async () => {
      await db.query("select public.import_grade_scores($1)", [JSON.stringify([{ assessment_id: before.assessments[0].id, learner_id: before.learners[0].id, score: 7, max_score: 10 }])]);
    });
    await expect(apply(f, randomUUID(), before)).rejects.toThrow(/class changed/);
  });
  it("name edits invalidate pending reviews and past snapshots remain unchanged", async () => {
    const f = await fixture(); await apply(f); const before = await snapshot(f.classId);
    await db.query("update public.learners set first_name='Anna' where id=$1", [before.learners[0].id]);
    expect((await snapshot(f.classId)).revision).toBeGreaterThan(before.revision);
    const previous = (await db.query<{ after_snapshot: Snapshot }>("select after_snapshot from public.class_record_sync_versions where class_id=$1", [f.classId])).rows[0];
    expect(previous.after_snapshot.learners[0].first_name).toBe("Ana");
  });
  it("does not allow browser calls to apply or mutation of saved versions", async () => {
    const f = await fixture(); await apply(f);
    await asRole("authenticated", f.userId, async () => {
      await expect(apply(f)).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.class_record_sync_versions where class_id=$1", [f.classId])).rejects.toThrow(/permission denied/);
      expect((await db.query("select id from public.class_record_sync_versions where class_id=$1", [f.classId])).rows).toHaveLength(1);
    });
  });
  it("isolates another teacher's class snapshot and versions", async () => {
    const owner = await fixture(), other = await fixture(); await apply(owner);
    await asRole("authenticated", other.userId, async () => {
      expect(await snapshot(owner.classId)).toBeNull();
      expect((await db.query("select id from public.class_record_sync_versions where class_id=$1", [owner.classId])).rows).toHaveLength(0);
    });
    await expect(apply({ ...owner, userId: other.userId })).rejects.toThrow(/Class not found/);
  });
  it("denies suspended teachers both reads and server apply", async () => {
    const f = await fixture(); await apply(f);
    await db.query("update public.profiles set access_status='suspended' where id=$1", [f.userId]);
    await expect(apply(f)).rejects.toThrow(/Active access/);
    await asRole("authenticated", f.userId, async () => {
      expect(await snapshot(f.classId)).toBeNull();
      expect((await db.query("select id from public.class_record_sync_versions where class_id=$1", [f.classId])).rows).toHaveLength(0);
    });
  });
  it("enforces source protection again in the database", async () => {
    const f = await fixture(); await apply(f);
    await db.query("update public.assessments set source='manual' where class_id=$1", [f.classId]);
    const before = await snapshot(f.classId); const forged = structuredClone(before); forged.assessments[0].source = "imported";
    await expect(apply(f, randomUUID(), before, buildSyncPlan(f.input, forged))).rejects.toThrow(/protected/);
  });
});
