'use server';

import { z } from 'zod';
import { duplicateWarnings, type SectionLearner, type SectionResult } from './model';
import { databaseError, refreshSection, requireSection, sectionAccess, sectionAction, SectionError } from './action-helpers';
import { readClassLearners, readMembers, type SectionDb } from './data';

const uuid = z.string().uuid();
const selection = z.object({ sectionId: uuid, learnerIds: z.array(uuid).min(1).max(500), keepSeparate: z.boolean().optional() });
type Selection = z.infer<typeof selection>;

async function addSelected(db: SectionDb, teacherId: string, input: Selection, candidates: SectionLearner[]): Promise<SectionResult> {
  const members = await readMembers(db, teacherId, input.sectionId);
  const existingIds = new Set(members.map(m => m.id));
  const fresh = candidates.filter(c => !existingIds.has(c.id));
  if (!fresh.length) return { ok: false, error: 'These learners already belong to this Section. Use Reactivate for an inactive learner.' };
  const duplicates = duplicateWarnings(fresh, members);
  if (duplicates.length && !input.keepSeparate) return { ok: false, error: 'Possible duplicate names. Review these learner records before keeping them separate.', duplicates };
  const { error } = await db.from('section_enrollments').upsert(fresh.map(l => ({ teacher_id: teacherId, section_id: input.sectionId, learner_id: l.id, status: 'active' })), { onConflict: 'section_id,learner_id', ignoreDuplicates: true });
  databaseError(error, 'Could not add learners to the Section.');
  refreshSection(input.sectionId);
  return { ok: true, message: 'Selected learners added to the Section.' };
}
export async function addLearnerToSection(input: Selection): Promise<SectionResult> {
  const parsed = selection.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Select between 1 and 500 learners.' };
  return sectionAction(async ({ supabase, user }) => {
    const d = parsed.data;
    await requireSection(supabase, user.id, d.sectionId);
    const ids = [...new Set(d.learnerIds)];
    const { data, error } = await supabase.from('learners').select('id,display_name,first_name,last_name').eq('teacher_id', user.id).in('id', ids);
    if (error || data?.length !== ids.length) throw new SectionError('One of these learners is no longer available in your workspace.');
    return addSelected(supabase, user.id, d, data);
  });
}
export async function addLearnersFromClassToSection(input: Selection & { classId: string }): Promise<SectionResult> {
  const parsed = selection.extend({ classId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a linked class and between 1 and 500 learners.' };
  return sectionAction(async ({ supabase, user }) => {
    const d = parsed.data;
    await requireSection(supabase, user.id, d.sectionId);
    await requireLinkedClass(supabase, user.id, d.sectionId, d.classId);
    const roster = await readClassLearners(supabase, d.classId);
    const ids = new Set(d.learnerIds), selected = roster.filter(l => ids.has(l.id));
    if (selected.length !== ids.size) throw new SectionError('The class roster changed. Review the learners before adding them.');
    return addSelected(supabase, user.id, d, selected);
  });
}
async function requireLinkedClass(db: SectionDb, teacherId: string, sectionId: string, classId: string) {
  const { data, error } = await db.from('classes').select('id').eq('id', classId).eq('teacher_id', teacherId).eq('section_id', sectionId).maybeSingle();
  if (error || !data) throw new SectionError('This class is no longer linked to this Section.');
}
export async function getLinkedClassLearners(input: { sectionId: string; classId: string }): Promise<{ ok: true; learners: SectionLearner[] } | { ok: false; error: string }> {
  try {
    const d = z.object({ sectionId: uuid, classId: uuid }).parse(input);
    const { supabase, user } = await sectionAccess();
    await requireSection(supabase, user.id, d.sectionId);
    await requireLinkedClass(supabase, user.id, d.sectionId, d.classId);
    return { ok: true, learners: await readClassLearners(supabase, d.classId) };
  } catch (error) { return { ok: false, error: error instanceof SectionError ? error.message : 'Could not load these learners. Try again.' }; }
}
export async function searchSectionLearners(input: { sectionId: string; search: string }): Promise<{ ok: true; learners: SectionLearner[]; hasMore: boolean } | { ok: false; error: string }> {
  try {
    const d = z.object({ sectionId: uuid, search: z.string().trim().max(120) }).parse(input);
    const { supabase, user } = await sectionAccess();
    await requireSection(supabase, user.id, d.sectionId);
    // Search returns profiles only. Membership decisions always use exact IDs.
    const { data, error } = await supabase.from('learners').select('id,display_name,first_name,last_name,class_enrollments(classes(name,subject,school_year))')
      .eq('teacher_id', user.id).ilike('display_name', `%${d.search.replace(/[\\%_]/g, '\\$&')}%`).order('display_name').order('id').limit(51);
    if (error || !data) throw new Error('lookup');
    return { ok: true, hasMore: data.length > 50, learners: data.slice(0, 50).map(l => ({ id: l.id, display_name: l.display_name, first_name: l.first_name, last_name: l.last_name,
      classes: l.class_enrollments.flatMap(e => (Array.isArray(e.classes) ? e.classes : [e.classes]).filter(Boolean).map(c => `${c.name} · ${c.subject} · ${c.school_year}`)),
    })) };
  } catch (error) { return { ok: false, error: error instanceof SectionError ? error.message : 'Could not search learners. Try again.' }; }
}
export async function createLearnerInSection(input: { sectionId: string; requestId: string; firstName: string; lastName: string; keepSeparate?: boolean }): Promise<SectionResult> {
  const parsed = z.object({ sectionId: uuid, requestId: uuid, firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120), keepSeparate: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter a first and last name, up to 120 characters each.' };
  return sectionAction(async ({ supabase, user }) => {
    const d = parsed.data;
    await requireSection(supabase, user.id, d.sectionId);
    const candidate = { id: d.requestId, first_name: d.firstName, last_name: d.lastName, display_name: `${d.firstName} ${d.lastName}` };
    const members = await readMembers(supabase, user.id, d.sectionId);
    const existing = members.find(m => m.id === d.requestId);
    if (existing) return { ok: true, id: existing.id };
    const duplicates = duplicateWarnings([candidate], members);
    if (duplicates.length && !d.keepSeparate) return { ok: false, error: 'Possible duplicate name. Keep this new learner record separate?', duplicates };
    const created = await supabase.from('learners').insert({ ...candidate, teacher_id: user.id });
    if (created.error?.code === '23505') {
      const retry = await supabase.from('learners').select('id').eq('id', d.requestId).eq('teacher_id', user.id).eq('first_name', d.firstName).eq('last_name', d.lastName).maybeSingle();
      if (retry.error || !retry.data) throw new SectionError('This request has changed. Refresh and try again.');
    } else databaseError(created.error, 'Could not create the learner.');
    let enrollmentError: { code?: string } | null = null;
    try {
      const enrolled = await supabase.from('section_enrollments').upsert({ teacher_id: user.id, section_id: d.sectionId, learner_id: d.requestId, status: 'active' }, { onConflict: 'section_id,learner_id', ignoreDuplicates: true });
      enrollmentError = enrolled.error;
    } catch { enrollmentError = { code: 'network' }; }
    if (enrollmentError) {
      // Compensate only a profile created by this request. Membership FKs protect
      // a concurrent successful retry; never delete a pre-existing profile.
      if (!created.error) {
        const refs = await supabase.from('class_enrollments').select('id', { count: 'exact', head: true }).eq('learner_id', d.requestId);
        if (!refs.error && refs.count === 0) await supabase.from('learners').delete().eq('id', d.requestId).eq('teacher_id', user.id);
      }
      throw new SectionError('Could not add the learner to the Section. Try again with the same form.');
    }
    refreshSection(d.sectionId); return { ok: true, id: d.requestId, message: 'Learner created and added to the Section.' };
  });
}
async function setEnrollmentStatus(input: { sectionId: string; enrollmentId: string }, status: 'active' | 'inactive'): Promise<SectionResult> {
  if (!z.object({ sectionId: uuid, enrollmentId: uuid }).safeParse(input).success) return { ok: false, error: 'Choose a Section learner.' };
  return sectionAction(async ({ supabase, user }) => {
    await requireSection(supabase, user.id, input.sectionId);
    const { data, error } = await supabase.from('section_enrollments').update({ status }).eq('id', input.enrollmentId).eq('section_id', input.sectionId).eq('teacher_id', user.id).select('id');
    databaseError(error, 'Could not update the learner status.');
    if (!data?.length) throw new SectionError('This Section learner is no longer available.');
    refreshSection(input.sectionId); return { ok: true };
  });
}
export async function deactivateSectionEnrollment(input: { sectionId: string; enrollmentId: string }) { return setEnrollmentStatus(input, 'inactive'); }
export async function reactivateSectionEnrollment(input: { sectionId: string; enrollmentId: string }) { return setEnrollmentStatus(input, 'active'); }
