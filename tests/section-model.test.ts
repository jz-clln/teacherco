import { expect, it } from 'vitest';
import { compareRosters, contextConflict, duplicateWarnings, sectionLabel, type SectionMember } from '@/features/sections/model';
const learner = (id: string, name = 'Ana Cruz') => ({ id, display_name: name, first_name: 'Ana', last_name: 'Cruz' });
const member = (id: string, status: 'active' | 'inactive' = 'active'): SectionMember => ({ ...learner(id), enrollmentId: `enrollment-${id}`, status });
it('compares exact IDs, never merges identical names, and excludes inactive membership', () => {
  const members = [member('both'), member('section-only'), member('inactive', 'inactive')];
  const classroom = [learner('both'), learner('class-only'), learner('inactive')];
  const saved = structuredClone({ members, classroom });
  const result = compareRosters(members, classroom);
  expect(result.both.map(l => l.id)).toEqual(['both']);
  expect(result.sectionOnly.map(l => l.id)).toEqual(['section-only']);
  expect(result.classOnly.map(l => l.id)).toEqual(['class-only', 'inactive']);
  expect({ members, classroom }).toEqual(saved);
});
it('handles either roster being larger or empty', () => {
  expect(compareRosters([member('a'), member('b')], []).sectionOnly).toHaveLength(2);
  expect(compareRosters([], [learner('a'), learner('b')]).classOnly).toHaveLength(2);
  expect(compareRosters([], [])).toEqual({ both: [], sectionOnly: [], classOnly: [] });
});
it('flags normalized same-name IDs, including within a selection, but never flags the same ID', () => {
  expect(duplicateWarnings([learner('a', ' ANA   Cruz ')], [learner('b')])).toMatchObject([{ id: 'a' }]);
  expect(duplicateWarnings([learner('a')], [learner('a')])).toEqual([]);
  expect(duplicateWarnings([learner('a'), learner('b')], []).map(d => d.id)).toEqual(['a', 'b']);
});
it('permits harmless context formatting and unknown school IDs', () => {
  const section = { grade_level: 'Grade 8', school_year: '2026-2027', school_id: '123' };
  expect(contextConflict({ ...section, grade_level: ' GRADE   8 ', school_id: '' }, section)).toBeNull();
  expect(contextConflict({ ...section, school_id: '456' }, section)).toContain('School ID');
  expect(contextConflict({ ...section, school_year: '2027-2028' }, section)).toContain('School year');
});
it('formats Section names without repeating an existing grade prefix', () => {
  expect(sectionLabel({ name: 'Rizal', grade_level: 'Grade 8' })).toBe('Grade 8 - Rizal');
  expect(sectionLabel({ name: 'Grade 8 - Rizal', grade_level: 'Grade 8' })).toBe('Grade 8 - Rizal');
});
