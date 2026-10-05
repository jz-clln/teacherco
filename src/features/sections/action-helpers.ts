import 'server-only';
import { revalidatePath } from 'next/cache';
import { getAccessContext } from '@/lib/auth/access-guard';
import type { Section } from '@/types/domain';
import type { SectionResult } from './model';
import type { SectionDb } from './data';

export class SectionError extends Error {}
export async function sectionAccess() {
  const context = await getAccessContext();
  if (!context?.user.email_confirmed_at || context.profile.access_status !== 'active') throw new SectionError('You no longer have active access. Please sign in and check your account.');
  return context;
}
export async function requireSection(db: SectionDb, teacherId: string, id: string) {
  const { data, error } = await db.from('sections').select('*').eq('id', id).eq('teacher_id', teacherId).maybeSingle();
  if (error || !data) throw new SectionError('You no longer have access to this Section.');
  return data as Section;
}
export function databaseError(error: { code?: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === '23514') throw new SectionError('The grade level, school year or school ID conflicts with a linked class or Section. Change or unlink the class first.');
  if (error.code === '23503') throw new SectionError('This relationship has changed or is still in use. Refresh and try again.');
  if (error.code === '23505') throw new SectionError('This learner is already in this Section.');
  throw new SectionError(fallback);
}
export async function sectionAction(work: (context: Awaited<ReturnType<typeof sectionAccess>>) => Promise<SectionResult>): Promise<SectionResult> {
  try { return await work(await sectionAccess()); }
  catch (error) { return { ok: false, error: error instanceof SectionError ? error.message : 'Could not save this change. Refresh and try again.' }; }
}
export function refreshSection(sectionId: string, classId?: string) {
  revalidatePath('/sections');
  revalidatePath(`/sections/${sectionId}`, 'layout');
  revalidatePath('/classes');
  if (classId) revalidatePath(`/classes/${classId}`, 'layout');
}
