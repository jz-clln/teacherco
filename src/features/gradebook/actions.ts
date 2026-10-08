'use server';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sectionAccess, requireSection, SectionError } from '@/features/sections/action-helpers';
import { getClassTermGrades } from '@/features/grading/queries';
import { readGradebook } from './data';
import { readSubjectOptions } from '@/features/classes/subject-options';
import { buildPreview, setupSchema, manualSchema, importSchema, type Result, type ImportSelection, type ImportPreview } from './model';
async function action<T>(work: (context: Awaited<ReturnType<typeof sectionAccess>>) => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await work(await sectionAccess()) }; }
  catch (error) { return { ok: false, error: error instanceof SectionError ? error.message : 'Could not save this change. Refresh and try again.' }; }
}
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '23503') throw new SectionError('A period or subject still contains grades. Keep it or mark it inactive.');
  if (error.code === '23505') throw new SectionError('Period keys and positions must be unique. Refresh and try again.');
  const safe = ['changed.', 'Active owned Section', 'Explicitly confirm', 'Reactivate', 'Choose an active', 'Choose a linked', 'Invalid Grade Book'];
  throw new SectionError(safe.some(s => error.message.includes(s)) ? error.message : 'Could not save the Grade Book. Check the values and refresh before retrying.');
}
export async function loadGradebookSetup(input:unknown){
  return action(async({supabase,user})=>{
    const {sectionId}=z.object({sectionId:z.uuid()}).parse(input);
    const section=await requireSection(supabase,user.id,sectionId);
    if(section.status!=='active')throw new SectionError('Reactivate the Section before changing its subjects.');
    const [book,subjectOptions]=await Promise.all([readGradebook(supabase,user.id,sectionId),readSubjectOptions(supabase,user.id)]);
    return {book:{section,...book},subjectOptions};
  });
}
export async function saveGradebookSetup(input: unknown) {
  return action(async ({ supabase, user }) => {
    const parsed = setupSchema.safeParse(input);
    if (!parsed.success) throw new SectionError('Use 1–8 named periods and valid subject details.');
    const p = parsed.data;
    await requireSection(supabase,user.id,p.sectionId);
    const names = p.subjects.map(s => s.name.toLocaleLowerCase().replace(/\s+/g,' '));
    if (new Set(names).size !== names.length && !p.duplicatesConfirmed) throw new SectionError('Duplicate subject names: confirm that these are separate subjects before saving.');
    const { error } = await supabase.rpc('save_section_gradebook_setup', { p_section:p.sectionId, p_periods:p.periods, p_subjects:p.subjects, p_expected:p.expected });
    check(error); revalidatePath(`/sections/${p.sectionId}/grades`); revalidatePath(`/sections/${p.sectionId}/report-cards`); revalidatePath('/classes/new');
  });
}
export async function saveManualGrades(input: unknown) {
  return action(async ({ supabase, user }) => {
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) throw new SectionError('Review 1–500 grades between 0 and 100 before saving.');
    const p = parsed.data;
    await requireSection(supabase,user.id,p.sectionId);
    const { error } = await supabase.rpc('save_section_grades', { p_section:p.sectionId, p_subject:p.subjectId, p_period:p.periodId, p_rows:p.rows });
    check(error); revalidatePath(`/sections/${p.sectionId}/grades`);
  });
}
async function preview(context: Awaited<ReturnType<typeof sectionAccess>>, p: ImportSelection): Promise<ImportPreview> {
  const { supabase, user } = context;
  const section = await requireSection(supabase,user.id,p.sectionId);
  if (section.status !== 'active') throw new SectionError('Reactivate the Section before importing grades.');
  const source = async () => {
    const { data, error } = await supabase.from('classes').select('id,sync_revision').eq('id',p.classId).eq('teacher_id',user.id).eq('section_id',p.sectionId).maybeSingle();
    if (error || !data) throw new SectionError('Choose a linked class in this Section.');
    return Number(data.sync_revision);
  };
  const revision = await source();
  const [book, classroom] = await Promise.all([readGradebook(supabase,user.id,p.sectionId), getClassTermGrades(supabase,p.classId)]);
  if (!classroom || await source() !== revision) throw new SectionError('Source class changed. Review a fresh preview.');
  if (!book.subjects.some(s => s.id === p.subjectId && s.status === 'active') || !book.periods.some(t => t.id === p.periodId && t.status === 'active')) throw new SectionError('Choose an active subject and period.');
  const rows = buildPreview(classroom,new Set(book.learners.filter(l => l.status === 'active').map(l => l.id)),book.entries,p);
  const digest = createHash('sha256').update(JSON.stringify({ p, revision, rows })).digest('hex');
  return { rows, revision, digest };
}
export async function previewClassGrades(input: unknown) {
  return action(async context => {
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) throw new SectionError('Choose a linked class, source term, destination period and grade source.');
    return preview(context,parsed.data);
  });
}
export async function importClassGrades(input: unknown) {
  return action(async context => {
    const parsed = importSchema.extend({ digest:z.string().length(64), replaceManual:z.array(z.uuid()).max(500), confirmed:z.literal(true) }).safeParse(input);
    if (!parsed.success) throw new SectionError('Review the class grades before confirming.');
    const p = parsed.data;
    const current = await preview(context,importSchema.parse(p));
    if (current.digest !== p.digest) throw new SectionError('The source or Grade Book changed. Review a fresh preview.');
    const rows = current.rows.filter(r => (r.status === 'add' || r.status === 'change') && (r.current?.source_type !== 'manual' || p.replaceManual.includes(r.learnerId))).map(r => ({ learner_id:r.learnerId, grade:r.incoming, expected_updated_at:r.current?.updated_at ?? null, replace_manual:p.replaceManual.includes(r.learnerId) }));
    if (!rows.length) throw new SectionError('No selected changes to import.');
    const { error } = await context.supabase.rpc('save_section_grades', { p_section:p.sectionId, p_subject:p.subjectId, p_period:p.periodId, p_rows:rows, p_class:p.classId, p_revision:current.revision, p_term:p.term, p_calculation:p.calculation });
    check(error); revalidatePath(`/sections/${p.sectionId}/grades`);
  });
}
