import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ queries: [] as { table: string; operation: string; args: unknown[] }[], results: [] as unknown[], user: 'teacher' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mock.user ? { id: mock.user } : null } }) },
  storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  from: (table: string) => {
    const result = mock.results.shift() ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const operation of ['select', 'update', 'delete', 'eq', 'neq', 'in', 'maybeSingle']) {
      builder[operation] = (...args: unknown[]) => { mock.queries.push({ table, operation, args }); return builder; };
    }
    builder.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return builder;
  },
}) }));
import { updateClassDetails } from '@/features/classes/details-actions';
import { deleteLearner } from '@/features/learners/actions';
import { deleteClass, deleteAllData } from '@/features/settings/actions';

beforeEach(() => { mock.queries = []; mock.results = []; mock.user = 'teacher'; });
const details = { classId: 'eb34d257-37b5-4404-a35e-b507e2b0679d', name: 'Rizal', schoolName: '', schoolId: '123', adviser: '', gradeLevel: 'Grade 8', section: 'Workbook label', subject: 'Math', schoolYear: '2026-2027', benchmark: 75 };
const section = { name: 'Rizal', grade_level: 'Grade 8', school_year: '2026-2027', school_id: '123' };
const mutations = () => mock.queries.filter(q => ['delete', 'update'].includes(q.operation));
function form(values: Record<string, string>) { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, value); return f; }

it.each([{ gradeLevel: 'Grade 9' }, { schoolYear: '2027-2028' }, { schoolId: '999' }])('rejects conflicting details before mutation: %o', async change => {
  mock.results = [{ data: { section_id: 'section' } }, { data: section }];
  expect(await updateClassDetails({ ...details, ...change })).toEqual({ ok: false, error: expect.stringContaining('conflicts') });
  expect(mutations()).toHaveLength(0);
});
it('allows unlinked metadata and checks the class owner', async () => {
  mock.results = [{ data: { section_id: null } }, { data: [{ id: details.classId }] }];
  expect(await updateClassDetails(details)).toEqual({ ok: true });
  expect(mock.queries).toContainEqual({ table: 'classes', operation: 'eq', args: ['teacher_id', 'teacher'] });
});
it('accepts harmless formatting and gives a clear error if a concurrent DB edit conflicts', async () => {
  mock.results = [{ data: { section_id: 'section' } }, { data: section }, { error: { code: '23514' } }];
  expect(await updateClassDetails({ ...details, gradeLevel: ' GRADE   8 ', schoolId: '' })).toEqual({ ok: false, error: expect.stringContaining('linked Section') });
});
it('fails closed when linked context cannot be read', async () => {
  mock.results = [{ data: { section_id: 'section' } }, { error: { message: 'offline' } }];
  expect((await updateClassDetails(details)).ok).toBe(false);
  expect(mutations()).toHaveLength(0);
});
it('retains a learner with Section membership even without another class', async () => {
  mock.results = [{ count: 0 }, { count: 1 }];
  await expect(deleteLearner(form({ classId: 'class', learnerId: 'learner' }))).rejects.toThrow(/removed=/);
  expect(mutations().map(q => q.table)).toEqual(['attendance_entries', 'class_enrollments']);
  expect(mock.queries.some(q => q.table === 'section_enrollments' && q.args[0] === 'status')).toBe(false);
});
it('does not delete a learner if membership lookup fails', async () => {
  mock.results = [{ count: 0 }, { error: { message: 'offline' } }];
  await expect(deleteLearner(form({ classId: 'class', learnerId: 'learner' }))).rejects.toThrow(/error=/);
  expect(mutations()).toHaveLength(0);
});
it('still removes an ordinary class-only learner', async () => {
  mock.results = [{ count: 0 }, { count: 0 }];
  await expect(deleteLearner(form({ classId: 'class', learnerId: 'learner' }))).rejects.toThrow(/removed=/);
  expect(mutations().map(q => q.table)).toEqual(['learners']);
});
it('class cleanup retains both active and inactive Section memberships', async () => {
  mock.results = [{ data: { id: details.classId, name: 'Rizal' } }, { data: [{ learner_id: 'kept' }, { learner_id: 'orphan' }] }, {}, { data: [] }, { data: [{ learner_id: 'kept' }] }, {}];
  expect(await deleteClass(form({ classId: details.classId, confirmation: 'Rizal' }))).toHaveProperty('success');
  expect(mock.queries).toContainEqual({ table: 'learners', operation: 'in', args: ['id', ['orphan']] });
});
it('class cleanup fails closed on membership errors', async () => {
  mock.results = [{ data: { id: details.classId, name: 'Rizal' } }, { data: [{ learner_id: 'kept' }] }, {}, { data: [] }, { error: { message: 'offline' } }];
  await deleteClass(form({ classId: details.classId, confirmation: 'Rizal' }));
  expect(mutations().map(q => q.table)).toEqual(['classes']);
});
it('delete-all removes classes, Sections/memberships, then learners', async () => {
  expect(await deleteAllData(form({ confirmation: 'DELETE' }))).toHaveProperty('success');
  expect(mutations().map(q => q.table)).toEqual(['report_card_templates', 'classes', 'sections', 'learners', 'teacher_notes']);
});
it('delete-all stops before learners when Section cleanup fails', async () => {
  mock.results = [{}, {}, { error: { message: 'failed' } }];
  expect(await deleteAllData(form({ confirmation: 'DELETE' }))).toHaveProperty('error');
  expect(mutations().map(q => q.table)).toEqual(['report_card_templates', 'classes', 'sections']);
});
