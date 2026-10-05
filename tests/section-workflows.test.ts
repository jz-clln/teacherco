// @vitest-environment node
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { database } from './helpers/database';
import { actionDb } from './helpers/section-action-db';
const mock = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/access-guard', () => ({ getAccessContext: mock.access, requireAccess: mock.access }));
import { createSection, updateSection, archiveSection, reactivateSection, deleteSection, linkClassToSection, unlinkClassFromSection } from '@/features/sections/actions';
import { addLearnerToSection, addLearnersFromClassToSection, createLearnerInSection, deactivateSectionEnrollment, reactivateSectionEnrollment, getLinkedClassLearners } from '@/features/sections/roster-actions';
import { ownedSection } from '@/features/sections/data';
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));

let db: PGlite, teacher: string, other: string, sectionId: string, classId: string, learnerId: string;
let writes: { table: string; operation: string; value: unknown }[];
const fields = { name: 'Rizal', grade_level: 'Grade 8', school_year: '2026-2027', school_name: 'School', school_id: '123', is_adviser: false };
beforeAll(async () => { db = await database(); }, 30000);
afterAll(async () => { await db?.close(); });
async function actor(id: string, status = 'active', verified = true) {
  await db.exec('reset role');
  await db.query("update profiles set access_status=$1 where id=$2", [status, id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
  mock.access.mockResolvedValue({ supabase: actionDb(db, writes), user: { id, email_confirmed_at: verified ? '2026-01-01' : null }, profile: { access_status: status } });
}
beforeEach(async () => {
  await db.exec('reset role');
  writes = []; teacher = randomUUID(); other = randomUUID(); sectionId = randomUUID(); classId = randomUUID(); learnerId = randomUUID();
  for (const id of [teacher, other]) await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'test@example.com',now())", [id]);
  await db.query("insert into sections(id,teacher_id,name,grade_level,school_year,school_id) values($1,$2,'Rizal','Grade 8','2026-2027','123')", [sectionId, teacher]);
  await db.query("insert into classes(id,teacher_id,name,subject,grade_level,school_year,school_id,section) values($1,$2,'Workbook display','Math','Grade 8','2026-2027','123','Different label')", [classId, teacher]);
  await db.query("insert into learners(id,teacher_id,display_name,first_name,last_name) values($1,$2,'Ana Cruz','Ana','Cruz')", [learnerId, teacher]);
  await db.query('insert into class_enrollments(class_id,learner_id) values($1,$2)', [classId, learnerId]);
  await actor(teacher);
});
async function snapshot() { return (await db.query('select class_record_snapshot($1) value', [classId])).rows[0]; }
it('creates an adviser-only Section for the current user and ignores spoofed teacher_id', async () => {
  const input = { ...fields, requestId: randomUUID(), teacher_id: other, is_adviser: true };
  expect(await createSection(input)).toMatchObject({ ok: true, id: input.requestId });
  const row = (await db.query('select teacher_id,is_adviser from sections where id=$1', [input.requestId])).rows[0];
  expect(row).toEqual({ teacher_id: teacher, is_adviser: true });
  expect((await db.query('select id from classes where section_id=$1', [input.requestId])).rows).toHaveLength(0);
  expect(await createSection(input)).toMatchObject({ ok: true });
  expect((await db.query('select id from sections where id=$1', [input.requestId])).rows).toHaveLength(1);
});
it.each(['pending', 'suspended', 'unverified'])('blocks %s actions before any queries write data', async state => {
  await actor(teacher, state === 'unverified' ? 'active' : state, state !== 'unverified');
  expect((await createSection({ ...fields, requestId: randomUUID() })).ok).toBe(false);
  expect((await linkClassToSection({ classId, sectionId })).ok).toBe(false);
  expect(writes).toHaveLength(0);
});
it('denies another teacher loading/editing/archiving/deleting this Section', async () => {
  await actor(other);
  await expect(ownedSection(sectionId)).rejects.toThrow('NOT_FOUND');
  expect((await updateSection({ ...fields, sectionId })).ok).toBe(false);
  expect((await archiveSection(sectionId)).ok).toBe(false);
  expect((await deleteSection({ sectionId, confirmation: 'Rizal' })).ok).toBe(false);
  expect(writes).toHaveLength(0);
});
it('edits Section details and archives/reactivates without changing class records or roster', async () => {
  expect((await linkClassToSection({ classId, sectionId })).ok).toBe(true);
  expect((await addLearnerToSection({ sectionId, learnerIds: [learnerId] })).ok).toBe(true);
  const before = await snapshot();
  expect((await updateSection({ ...fields, sectionId, name: 'New label', is_adviser: true })).ok).toBe(true);
  expect((await archiveSection(sectionId)).ok).toBe(true);
  expect((await reactivateSection(sectionId)).ok).toBe(true);
  expect(await snapshot()).toEqual(before);
  expect((await db.query('select status from section_enrollments where section_id=$1', [sectionId])).rows).toEqual([{ status: 'active' }]);
});
it('requires explicit matching deletion confirmation and blocks linked Sections', async () => {
  expect((await deleteSection({ sectionId, confirmation: '' })).ok).toBe(false);
  await linkClassToSection({ classId, sectionId });
  expect(await deleteSection({ sectionId, confirmation: 'Rizal' })).toEqual({ ok: false, error: expect.stringContaining('still has linked classes') });
  await unlinkClassFromSection({ classId, sectionId });
  await addLearnerToSection({ sectionId, learnerIds: [learnerId] });
  expect((await deleteSection({ sectionId, confirmation: 'Rizal' })).ok).toBe(true);
  expect((await db.query('select id from learners where id=$1', [learnerId])).rows).toHaveLength(1);
  expect((await db.query('select id from classes where id=$1', [classId])).rows).toHaveLength(1);
});
it('links and unlinks only the relationship, preserving sync snapshot/revision and history', async () => {
  const before = await snapshot();
  expect((await linkClassToSection({ classId, sectionId })).ok).toBe(true);
  expect((await unlinkClassFromSection({ classId, sectionId })).ok).toBe(true);
  expect(writes.map(w => [w.table, w.value])).toEqual([['classes', { section_id: sectionId }], ['classes', { section_id: null }]]);
  expect(await snapshot()).toEqual(before);
  expect((await db.query('select id from class_record_sync_versions where class_id=$1', [classId])).rows).toHaveLength(0);
});
it('never replaces another link without explicit expected relationship', async () => {
  const second = randomUUID(); await createSection({ ...fields, requestId: second });
  await linkClassToSection({ classId, sectionId });
  expect((await linkClassToSection({ classId, sectionId: second })).ok).toBe(false);
  expect((await linkClassToSection({ classId, sectionId: second, expectedSectionId: sectionId })).ok).toBe(true);
  expect((await unlinkClassFromSection({ classId, sectionId })).ok).toBe(false);
});
it.each([['grade_level', 'Grade 9'], ['school_year', '2027-2028'], ['school_id', '999']])('rejects %s mismatch with a readable error', async (key, value) => {
  await db.query(`update classes set ${key}=$1 where id=$2`, [value, classId]);
  expect(await linkClassToSection({ classId, sectionId })).toEqual({ ok: false, error: expect.stringContaining('does not match') });
  expect(writes).toHaveLength(0);
});
it('cross-owner class linking fails', async () => {
  await actor(other); const own = randomUUID(); await createSection({ ...fields, requestId: own });
  expect((await linkClassToSection({ classId, sectionId: own })).ok).toBe(false);
});
it('adds exact existing learner IDs without changing class membership or profiles', async () => {
  const before = await snapshot();
  expect((await addLearnerToSection({ sectionId, learnerIds: [learnerId] })).ok).toBe(true);
  expect((await addLearnerToSection({ sectionId, learnerIds: [learnerId] })).ok).toBe(false);
  expect(await snapshot()).toEqual(before);
  expect(writes.every(w => w.table === 'section_enrollments')).toBe(true);
});
it('cross-owner learner selection fails before inserting membership', async () => {
  await actor(other); const own = randomUUID(); await createSection({ ...fields, requestId: own }); writes.length = 0;
  expect((await addLearnerToSection({ sectionId: own, learnerIds: [learnerId] })).ok).toBe(false);
  expect(writes).toHaveLength(0);
});
it('adds only selected learners from a linked class and refuses an unlinked source', async () => {
  expect((await addLearnersFromClassToSection({ sectionId, classId, learnerIds: [learnerId] })).ok).toBe(false);
  await linkClassToSection({ classId, sectionId });
  const before = await snapshot();
  expect((await addLearnersFromClassToSection({ sectionId, classId, learnerIds: [learnerId] })).ok).toBe(true);
  expect(await snapshot()).toEqual(before);
  expect((await db.query('select learner_id from section_enrollments where section_id=$1', [sectionId])).rows).toEqual([{ learner_id: learnerId }]);
});
it('deactivates/reactivates the same enrollment without removing profiles/class memberships', async () => {
  await addLearnerToSection({ sectionId, learnerIds: [learnerId] });
  const enrollmentId = (await db.query<{ id: string }>('select id from section_enrollments where section_id=$1', [sectionId])).rows[0].id;
  const before = await snapshot();
  expect((await deactivateSectionEnrollment({ sectionId, enrollmentId })).ok).toBe(true);
  expect((await db.query("select id from section_enrollments where section_id=$1 and status='active'", [sectionId])).rows).toHaveLength(0);
  expect((await reactivateSectionEnrollment({ sectionId, enrollmentId })).ok).toBe(true);
  expect((await db.query('select id from section_enrollments where section_id=$1', [sectionId])).rows).toEqual([{ id: enrollmentId }]);
  expect(await snapshot()).toEqual(before);
});
it('creates a learner in an adviser-only Section and retries without duplicates', async () => {
  const input = { sectionId, requestId: randomUUID(), firstName: 'New', lastName: 'Learner' };
  expect((await createLearnerInSection(input)).ok).toBe(true);
  expect((await createLearnerInSection(input)).ok).toBe(true);
  expect((await db.query('select id from class_enrollments where learner_id=$1', [input.requestId])).rows).toHaveLength(0);
  expect((await db.query('select id from section_enrollments where learner_id=$1', [input.requestId])).rows).toHaveLength(1);
});
it('cleans up a newly created learner if Section enrollment fails', async () => {
  const context = await mock.access();
  mock.access.mockResolvedValue({ ...context, supabase: actionDb(db, writes, true) });
  const input = { sectionId, requestId: randomUUID(), firstName: 'New', lastName: 'Learner' };
  expect((await createLearnerInSection(input)).ok).toBe(false);
  expect((await db.query('select id from learners where id=$1', [input.requestId])).rows).toHaveLength(0);
});
it('does not clean up a pre-existing learner when a retry cannot enroll', async () => {
  const context = await mock.access();
  mock.access.mockResolvedValue({ ...context, supabase: actionDb(db, writes, true) });
  expect((await createLearnerInSection({ sectionId, requestId: learnerId, firstName: 'Ana', lastName: 'Cruz' })).ok).toBe(false);
  expect((await db.query('select id from learners where id=$1', [learnerId])).rows).toHaveLength(1);
});
it('flags same-name IDs before writes and keeps them separate only after confirmation', async () => {
  await addLearnerToSection({ sectionId, learnerIds: [learnerId] });
  const input = { sectionId, requestId: randomUUID(), firstName: 'Ana', lastName: 'Cruz' };
  writes.length = 0;
  expect(await createLearnerInSection(input)).toMatchObject({ ok: false, duplicates: [{ id: input.requestId }] });
  expect(writes).toHaveLength(0);
  expect((await createLearnerInSection({ ...input, keepSeparate: true })).ok).toBe(true);
  expect((await db.query('select learner_id from section_enrollments where section_id=$1', [sectionId])).rows).toHaveLength(2);
  expect((await db.query('select learner_id from class_enrollments where class_id=$1', [classId])).rows).toEqual([{ learner_id: learnerId }]);
});
it('comparison reads do not write and respect the linked class boundary', async () => {
  await linkClassToSection({ classId, sectionId }); writes.length = 0;
  expect(await getLinkedClassLearners({ sectionId, classId })).toMatchObject({ ok: true, learners: [{ id: learnerId }] });
  expect(writes).toHaveLength(0);
  await unlinkClassFromSection({ classId, sectionId });
  expect((await getLinkedClassLearners({ sectionId, classId })).ok).toBe(false);
});
