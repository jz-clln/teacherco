import 'server-only';
import { ownedSection, readMembers, readClasses, type SectionDb } from '@/features/sections/data';
import type { Period, Subject, GradeEntry } from './model';
export async function readGradebook(db: SectionDb, teacherId: string, sectionId: string) {
  async function rows<T>(table: string, order: string): Promise<T[]> {
    const result: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from(table).select('*').eq('teacher_id', teacherId).eq('section_id', sectionId).order(order).order('id').range(offset, offset + 499);
      if (error || !data) throw new Error('Could not load the Section Grade Book.');
      result.push(...data as T[]);
      if (data.length < 500) return result;
    }
  }
  const [periods, subjects, entries, learners, classes] = await Promise.all([rows<Period>('section_grade_periods','position'), rows<Subject>('section_subjects','position'), rows<GradeEntry>('section_grade_entries','id'), readMembers(db,teacherId,sectionId), readClasses(db,teacherId,sectionId)]);
  return { periods, subjects, entries: entries.map(e => ({ ...e, grade: e.grade == null ? null : Number(e.grade) })), learners, classes };
}
export async function sectionGradebook(sectionId: string) {
  const { section, supabase, user } = await ownedSection(sectionId);
  return { section, ...await readGradebook(supabase,user.id,sectionId) };
}
export type GradebookData = Awaited<ReturnType<typeof sectionGradebook>>;
