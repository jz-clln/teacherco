import type { Section } from '@/types/domain';

export type SectionSummary = Section & { learnerCount: number; classCount: number };
export type SectionClass = {
  id: string; name: string; subject: string; grade_level: string; school_year: string;
  school_id: string | null; section_id: string | null; status: string; learnerCount: number;
};
export type SectionLearner = { id: string; display_name: string; first_name: string | null; last_name: string | null; classes?: string[] };
export type SectionMember = SectionLearner & { enrollmentId: string; status: 'active' | 'inactive' };
export type DuplicateWarning = { id: string; name: string; existing: string[] };
export type SectionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string; duplicates?: DuplicateWarning[] };

export const normalizeName = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
export function sectionLabel(section: Pick<Section, 'name' | 'grade_level'>) {
  return normalizeName(section.name).startsWith(normalizeName(section.grade_level)) ? section.name : `${section.grade_level} - ${section.name}`;
}
export function contextConflict(a: { grade_level: string; school_year: string; school_id: string | null }, b: typeof a): string | null {
  if (normalizeName(a.grade_level) !== normalizeName(b.grade_level)) return 'Grade level does not match.';
  if (normalizeName(a.school_year) !== normalizeName(b.school_year)) return 'School year does not match.';
  if (a.school_id?.trim() && b.school_id?.trim() && normalizeName(a.school_id) !== normalizeName(b.school_id)) return 'School ID does not match.';
  return null;
}
export function compareRosters(section: SectionMember[], classroom: SectionLearner[]) {
  const active = section.filter(l => l.status === 'active');
  const sectionIds = new Set(active.map(l => l.id)), classIds = new Set(classroom.map(l => l.id));
  return { both: active.filter(l => classIds.has(l.id)), sectionOnly: active.filter(l => !classIds.has(l.id)), classOnly: classroom.filter(l => !sectionIds.has(l.id)) };
}
export function duplicateWarnings(candidates: SectionLearner[], members: SectionLearner[]): DuplicateWarning[] {
  return candidates.flatMap(candidate => {
    const matches = [...members, ...candidates].filter(other => other.id !== candidate.id && normalizeName(other.display_name) === normalizeName(candidate.display_name));
    return matches.length ? [{ id: candidate.id, name: candidate.display_name, existing: [...new Set(matches.map(m => m.display_name))] }] : [];
  });
}
export const sectionInputClass = 'mt-1 w-full min-h-11 rounded-lg border border-[#E3E5E1] bg-white px-3 py-2 text-sm outline-none focus:border-[#1A4D2E] focus-visible:ring-2 focus-visible:ring-[#1A4D2E]';
