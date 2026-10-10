import { z } from 'zod';
import {subjectKey,periodCode} from '@/features/assisted-workflows/labels';
export function importSubjectId(label:string,subjects:Subject[]){const matches=subjects.filter(s=>s.status==='active'&&subjectKey(s.name)===subjectKey(label));return matches.length===1?matches[0].id:'';}
export function importPeriodId(term:number,periods:Period[]){const matches=periods.filter(p=>p.status==='active'&&(periodCode(p.label)===10+term||new RegExp(`^period ${term}$`,'i').test(p.label.trim())));return matches.length===1?matches[0].id:'';}
import type { ClassTermGrades } from '@/features/grading/queries';
export type Period = { id: string; key: string; label: string; position: number; status: 'active' | 'inactive'; updated_at?: string };
export type Subject = { id: string; name: string; code: string | null; category: string | null; position: number; status: 'active' | 'inactive'; updated_at?: string };
export type GradeEntry = { learner_id: string; section_subject_id: string; period_id: string; grade: number | null; source_type: 'manual' | 'teacherco_class' | 'external_import'; source_class_id: string | null; source_reference: string | null; source_snapshot: { term?: number; calculation?: string; original_grade?: number; sync_revision?: number } | null; updated_at: string };
export type PreviewRow = { learnerId: string; name: string; current: GradeEntry | null; printed: number | null; calculated: number | null; incoming: number | null; status: 'add' | 'change' | 'unchanged' | 'missing' | 'outside'; warnings: string[] };
export type ImportPreview = { rows: PreviewRow[]; digest: string; revision: number };
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export const cellKey = (learner: string, subject: string, period: string) => `${learner}|${subject}|${period}`;
export const gradeText = (grade: number | null | undefined) => grade == null ? '—' : String(grade);
export function presetPeriods(preset: 'quarters' | 'terms' | 'semesters' | 'custom'): Period[] {
  const [count, label] = preset === 'quarters' ? [4, 'Quarter'] : preset === 'terms' ? [3, 'Term'] : preset === 'semesters' ? [2, 'Semester'] : [2, 'Period'];
  return Array.from({ length: count }, (_, i) => ({ id: crypto.randomUUID(), key: `period_${i + 1}`, label: `${label} ${i + 1}`, position: i + 1, status: 'active' }));
}
export function parseGrade(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('Enter a grade from 0 to 100, or leave it blank.');
  const grade = Number(value);
  if (!Number.isFinite(grade) || grade < 0 || grade > 100) throw new Error('Enter a grade from 0 to 100, or leave it blank.');
  return grade;
}
const label = (max: number) => z.string().trim().min(1).max(max);
const status = z.enum(['active', 'inactive']);
export const setupSchema = z.object({ sectionId: z.uuid(), periods: z.array(z.object({ id: z.uuid(), key: z.string().regex(/^period_[a-zA-Z0-9_-]+$/).max(80), label: label(60), position: z.number().int().min(1).max(8), status })).min(1).max(8), subjects: z.array(z.object({ id: z.uuid(), name: label(120), code: z.string().max(40).nullable(), category: z.string().max(80).nullable(), position: z.number().int().positive(), status })).max(100), expected: z.array(z.object({ id: z.uuid(), updated_at: z.string() })).max(108), duplicatesConfirmed: z.boolean() });
export const manualSchema = z.object({ sectionId: z.uuid(), subjectId: z.uuid(), periodId: z.uuid(), confirmed: z.literal(true), rows: z.array(z.object({ learner_id: z.uuid(), grade: z.number().finite().min(0).max(100).nullable(), expected_updated_at: z.string().nullable() })).min(1).max(500) });
export const importSchema = z.object({ sectionId: z.uuid(), subjectId: z.uuid(), periodId: z.uuid(), classId: z.uuid(), term: z.number().int().min(1).max(3), calculation: z.enum(['printed', 'calculated']), destinationConfirmed:z.boolean().optional() });
export type ImportSelection = z.infer<typeof importSchema>;
export function buildPreview(classroom: ClassTermGrades, activeIds: Set<string>, entries: GradeEntry[], selection: ImportSelection): PreviewRow[] {
  const byId = new Map(entries.filter(e => e.section_subject_id === selection.subjectId && e.period_id === selection.periodId).map(e => [e.learner_id, e]));
  return classroom.learners.map(learner => {
    const term = learner.terms.find(t => t.term === selection.term);
    const printed = term?.recorded?.termGrade ?? null;
    const calculated = term?.result.status === 'graded' ? term.result.termGrade : null;
    const incoming = selection.calculation === 'printed' ? printed : calculated;
    const current = byId.get(learner.id) ?? null;
    const valid = incoming != null && Number.isFinite(incoming) && incoming >= 0 && incoming <= 100;
    return { learnerId: learner.id, name: learner.name, current, printed, calculated, incoming: valid ? incoming : null,
      status: !activeIds.has(learner.id) ? 'outside' : !valid ? 'missing' : current?.grade === incoming ? 'unchanged' : current?.grade == null ? 'add' : 'change', warnings: term?.result.warnings ?? [] };
  });
}
