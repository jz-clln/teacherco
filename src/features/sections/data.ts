import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAccess } from '@/lib/auth/access-guard';
import type { createClient } from '@/lib/supabase/server';
import type { Section } from '@/types/domain';
import type { SectionClass, SectionLearner, SectionMember, SectionSummary } from './model';

export type SectionDb = Awaited<ReturnType<typeof createClient>>;
const PAGE = 500;
const sectionFields = 'id,teacher_id,name,grade_level,school_year,school_name,school_id,is_adviser,status,created_at,updated_at';
const classFields = 'id,name,subject,grade_level,school_year,school_id,section_id,status,class_enrollments(count)';
function count(value: unknown) { return Number((value as { count: number }[] | null)?.[0]?.count ?? 0); }
function one<T>(value: T | T[]): T { return Array.isArray(value) ? value[0] : value; }

export const ownedSection = cache(async (id: string) => {
  const context = await requireAccess({ onboarded: true });
  if (!z.uuid().safeParse(id).success) notFound();
  const { data, error } = await context.supabase.from('sections').select(sectionFields).eq('id', id).eq('teacher_id', context.user.id).maybeSingle();
  if (error) throw new Error('Could not load this Section. Please try again.');
  if (!data) notFound();
  return { ...context, section: data as Section };
});

export async function listSections(): Promise<SectionSummary[]> {
  const { supabase, user } = await requireAccess({ onboarded: true });
  const out: SectionSummary[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('sections').select(`${sectionFields},classes(count),section_enrollments(count)`)
      .eq('teacher_id', user.id).eq('section_enrollments.status', 'active')
      .order('school_year', { ascending: false }).order('grade_level').order('name').order('id').range(offset, offset + PAGE - 1);
    if (error || !data) throw new Error('Could not load Sections. Please try again.');
    out.push(...data.map(s => ({ ...s, learnerCount: count(s.section_enrollments), classCount: count(s.classes) }) as SectionSummary));
    if (data.length < PAGE) return out;
  }
}

export async function readMembers(db: SectionDb, teacherId: string, sectionId: string): Promise<SectionMember[]> {
  const out: SectionMember[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.from('section_enrollments').select('id,status,learner:learners!inner(id,display_name,first_name,last_name)')
      .eq('teacher_id', teacherId).eq('section_id', sectionId).order('id').range(offset, offset + PAGE - 1);
    if (error || !data) throw new Error('Could not load Section learners.');
    for (const row of data) out.push({ ...one(row.learner), enrollmentId: row.id, status: row.status as SectionMember['status'] });
    if (data.length < PAGE) return out.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
}
export const sectionMembers = cache(async (id: string) => {
  const { supabase, user } = await ownedSection(id);
  return readMembers(supabase, user.id, id);
});

export async function readClasses(db: SectionDb, teacherId: string, sectionId?: string, unlinkedOnly = false): Promise<SectionClass[]> {
  const out: SectionClass[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = db.from('classes').select(classFields).eq('teacher_id', teacherId).eq('class_enrollments.status', 'active');
    if (sectionId) query = query.eq('section_id', sectionId);
    if (unlinkedOnly) query = query.is('section_id', null);
    const { data, error } = await query.order('subject').order('name').order('id').range(offset, offset + PAGE - 1);
    if (error || !data) throw new Error('Could not load classes.');
    out.push(...data.map(c => ({ ...c, learnerCount: count(c.class_enrollments) })));
    if (data.length < PAGE) return out;
  }
}
export const sectionClasses = cache(async (id: string) => {
  const { supabase, user } = await ownedSection(id);
  return readClasses(supabase, user.id, id);
});
export async function classChoices(id: string) {
  const { supabase, user } = await ownedSection(id);
  return readClasses(supabase, user.id, undefined, true);
}
export async function readClassSummary(db: SectionDb, teacherId: string, classId: string): Promise<SectionClass | null> {
  const { data, error } = await db.from('classes').select(classFields).eq('teacher_id', teacherId).eq('id', classId).eq('class_enrollments.status', 'active').maybeSingle();
  if (error) throw new Error('Could not load this class.');
  return data ? { ...data, learnerCount: count(data.class_enrollments) } : null;
}
export async function readClassLearners(db: SectionDb, classId: string): Promise<SectionLearner[]> {
  const out: SectionLearner[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.from('class_enrollments').select('learner:learners!inner(id,display_name,first_name,last_name)')
      .eq('class_id', classId).eq('status', 'active').order('id').range(offset, offset + PAGE - 1);
    if (error || !data) throw new Error('Could not load class learners.');
    out.push(...data.map(row => one(row.learner)));
    if (data.length < PAGE) return out.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
}
