'use server';

import { z } from 'zod';
import { contextConflict, type SectionResult } from './model';
import { databaseError, refreshSection, requireSection, sectionAction, SectionError } from './action-helpers';

const id = z.string().uuid();
const fields = z.object({ name: z.string().trim().min(1).max(120), grade_level: z.string().trim().min(1).max(50), school_year: z.string().trim().min(1).max(30), school_name: z.string().trim().max(160), school_id: z.string().trim().max(30), is_adviser: z.boolean() });
export type SectionFields = z.infer<typeof fields>;

export async function createSection(input: SectionFields & { requestId: string }): Promise<SectionResult> {
  const parsed = fields.extend({ requestId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter a Section name, grade level and school year within the displayed limits.' };
  return sectionAction(async ({ supabase, user }) => {
    const { requestId, ...values } = parsed.data;
    const { error } = await supabase.from('sections').insert({ ...values, school_name: values.school_name || null, school_id: values.school_id || null, id: requestId, teacher_id: user.id });
    if (error?.code === '23505') {
      const existing = await requireSection(supabase, user.id, requestId);
      return { ok: true, id: existing.id };
    }
    databaseError(error, 'Could not create the Section. Please try again.');
    refreshSection(requestId);
    return { ok: true, id: requestId };
  });
}
export async function updateSection(input: SectionFields & { sectionId: string }): Promise<SectionResult> {
  const parsed = fields.extend({ sectionId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the Section details and field limits.' };
  return sectionAction(async ({ supabase, user }) => {
    const { sectionId, ...values } = parsed.data;
    await requireSection(supabase, user.id, sectionId);
    const { data, error } = await supabase.from('sections').update({ ...values, school_name: values.school_name || null, school_id: values.school_id || null }).eq('id', sectionId).eq('teacher_id', user.id).select('id');
    databaseError(error, 'Could not save the Section.');
    if (!data?.length) throw new SectionError('You no longer have access to this Section.');
    refreshSection(sectionId); return { ok: true, id: sectionId };
  });
}
async function setStatus(sectionId: string, status: 'active' | 'archived'): Promise<SectionResult> {
  if (!id.safeParse(sectionId).success) return { ok: false, error: 'Section not found.' };
  return sectionAction(async ({ supabase, user }) => {
    await requireSection(supabase, user.id, sectionId);
    const { data, error } = await supabase.from('sections').update({ status }).eq('id', sectionId).eq('teacher_id', user.id).select('id');
    databaseError(error, 'Could not update Section status.');
    if (!data?.length) throw new SectionError('You no longer have access to this Section.');
    refreshSection(sectionId); return { ok: true };
  });
}
export async function archiveSection(sectionId: string) { return setStatus(sectionId, 'archived'); }
export async function reactivateSection(sectionId: string) { return setStatus(sectionId, 'active'); }
export async function deleteSection(input: { sectionId: string; confirmation: string }): Promise<SectionResult> {
  if (!id.safeParse(input.sectionId).success) return { ok: false, error: 'Section not found.' };
  return sectionAction(async ({ supabase, user }) => {
    const section = await requireSection(supabase, user.id, input.sectionId);
    if (input.confirmation !== section.name) throw new SectionError('Type the Section name exactly to confirm.');
    const { count, error: checkError } = await supabase.from('classes').select('id', { count: 'exact', head: true }).eq('section_id', section.id).eq('teacher_id', user.id);
    databaseError(checkError, 'Could not verify linked classes.');
    if (count) throw new SectionError('This Section still has linked classes. Unlink them before deleting the Section.');
    const { error } = await supabase.from('sections').delete().eq('id', section.id).eq('teacher_id', user.id);
    if (error?.code === '23503') throw new SectionError('This Section still has linked classes. Unlink them before deleting the Section.');
    databaseError(error, 'Could not delete the Section.');
    refreshSection(section.id); return { ok: true };
  });
}
export async function linkClassToSection(input: { classId: string; sectionId: string; expectedSectionId?: string | null }): Promise<SectionResult> {
  const parsed = z.object({ classId: id, sectionId: id, expectedSectionId: id.nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a class and Section.' };
  return sectionAction(async ({ supabase, user }) => {
    const d = parsed.data, section = await requireSection(supabase, user.id, d.sectionId);
    const { data: classroom, error } = await supabase.from('classes').select('id,section_id,grade_level,school_year,school_id').eq('id', d.classId).eq('teacher_id', user.id).maybeSingle();
    if (error || !classroom) throw new SectionError('You no longer have access to this class.');
    if (classroom.section_id === section.id) return { ok: true };
    if (classroom.section_id !== (d.expectedSectionId ?? null)) throw new SectionError('This class is already linked to another Section. Refresh before changing it.');
    const conflict = contextConflict(classroom, section);
    if (conflict) throw new SectionError(conflict);
    let query = supabase.from('classes').update({ section_id: section.id }).eq('id', classroom.id).eq('teacher_id', user.id);
    query = classroom.section_id ? query.eq('section_id', classroom.section_id) : query.is('section_id', null);
    const saved = await query.select('id');
    databaseError(saved.error, 'Could not link the class.');
    if (!saved.data?.length) throw new SectionError('The class relationship changed. Refresh and try again.');
    if (classroom.section_id) refreshSection(classroom.section_id, classroom.id);
    refreshSection(section.id, classroom.id); return { ok: true };
  });
}
export async function unlinkClassFromSection(input: { classId: string; sectionId: string }): Promise<SectionResult> {
  if (!z.object({ classId: id, sectionId: id }).safeParse(input).success) return { ok: false, error: 'Choose a class and Section.' };
  return sectionAction(async ({ supabase, user }) => {
    await requireSection(supabase, user.id, input.sectionId);
    const { data, error } = await supabase.from('classes').update({ section_id: null }).eq('id', input.classId).eq('teacher_id', user.id).eq('section_id', input.sectionId).select('id');
    databaseError(error, 'Could not unlink the class.');
    if (!data?.length) throw new SectionError('The class relationship changed. Refresh and try again.');
    refreshSection(input.sectionId, input.classId); return { ok: true };
  });
}
