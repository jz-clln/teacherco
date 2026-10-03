// src/features/exams/queries.ts

// Server-side reads for the Check screens. RLS limits everything to the signed-in teacher.
import { createClient } from "@/lib/supabase/server";
import type { AnalyticsItem, AnalyticsSubmission } from "@/lib/exams/analytics";
import { answerOf, choiceCountOf, choicesFor, formatOf, type AssessmentFormat } from "@/lib/exams/types";

// PostgREST returns a to-one embed as an object, sometimes typed as an array.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

import { getActivityChoices } from "./activity-slots";
import { activityDisplayTitle, type ActivityChoice } from "@/lib/exams/activity-slots";

export interface ClassOption {
  activityChoices: ActivityChoice[];
  id: string;
  label: string;
  competencies: string[];
}

export async function getClassOptions(): Promise<ClassOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id,name,subject,status,competencies(name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return Promise.all((data ?? []).map(async (c: { id: string; name: string; subject: string; competencies: { name: string }[] }) => ({
    id: c.id,
    activityChoices: await getActivityChoices(c.id, supabase),
    label: `${c.name} — ${c.subject}`,
    competencies: (c.competencies ?? []).map((x) => x.name),
  })));
}

export interface OverviewRow {
  id: string;
  title: string;
  status: string;
  format: AssessmentFormat;
  date: string | null;
  className: string;
  classId: string;
  classTitle: string;
  subject: string;
  gradeLevel: string | null;
  checked: number;
  roster: number;
  mean: number | null;
}

type ClassRef = { name: string; subject: string; grade_level: string | null };

export async function getAssessmentsOverview(): Promise<OverviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assessments")
    .select("id,title,activity_slot,status,kind,assessment_date,created_at,class_id,classes(name,subject,grade_level),submissions(score,max_score)")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as {
    id: string; title: string; activity_slot: string | null; status: string; kind: string; assessment_date: string | null; class_id: string;
    classes: ClassRef | ClassRef[] | null;
    submissions: { score: number | null; max_score: number | null }[];
  }[];
  if (!rows.length) return [];

  const classIds = [...new Set(rows.map((r) => r.class_id))];
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .in("class_id", classIds)
    .eq("status", "active");
  const rosterByClass = new Map<string, number>();
  for (const e of (enrollments ?? []) as { class_id: string }[]) {
    rosterByClass.set(e.class_id, (rosterByClass.get(e.class_id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const cls = one(r.classes);
    const percents = r.submissions
      .filter((s) => s.score !== null && s.max_score)
      .map((s) => (Number(s.score) / Number(s.max_score)) * 100);
    return {
      id: r.id,
      title: activityDisplayTitle(r.title, r.activity_slot),
      status: r.status,
      format: formatOf(r.kind),
      date: r.assessment_date,
      className: cls ? `${cls.name} — ${cls.subject}` : "Class",
      classId: r.class_id,
      classTitle: cls?.name ?? "Class",
      subject: cls?.subject ?? "General",
      gradeLevel: cls?.grade_level ?? null,
      checked: r.submissions.length,
      roster: rosterByClass.get(r.class_id) ?? 0,
      mean: percents.length ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10 : null,
    };
  });
}

export interface CheckSubjectGroup {
  subject: string;
  /** Class record used for "New assessment" in this subject. */
  classId: string;
  assessments: OverviewRow[];
}

export interface CheckFolder {
  key: string;
  name: string;
  gradeLevel: string | null;
  subjects: CheckSubjectGroup[];
  total: number;
  /** Assessments that are open and still have unchecked sheets. */
  pending: number;
}

/** Class folders → subjects → assessments. Classes with no assessments still get a folder. */
export async function getCheckFolders(): Promise<CheckFolder[]> {
  const supabase = await createClient();
  const [overview, classesRes] = await Promise.all([
    getAssessmentsOverview(),
    supabase.from("classes").select("id,name,subject,grade_level").eq("status", "active"),
  ]);

  const folders = new Map<string, CheckFolder>();
  const subjectGroup = (name: string, grade: string | null, subject: string, classId: string) => {
    const key = name.trim().toLowerCase();
    let folder = folders.get(key);
    if (!folder) {
      folder = { key, name: name.trim(), gradeLevel: grade, subjects: [], total: 0, pending: 0 };
      folders.set(key, folder);
    }
    let group = folder.subjects.find((g) => g.subject.toLowerCase() === subject.trim().toLowerCase());
    if (!group) {
      group = { subject: subject.trim(), classId, assessments: [] };
      folder.subjects.push(group);
    }
    return { folder, group };
  };

  for (const c of (classesRes.data ?? []) as { id: string; name: string; subject: string; grade_level: string | null }[]) {
    subjectGroup(c.name, c.grade_level, c.subject, c.id);
  }
  for (const a of overview) {
    const { folder, group } = subjectGroup(a.classTitle, a.gradeLevel, a.subject, a.classId);
    group.assessments.push(a);
    folder.total += 1;
    if (a.status !== "closed" && a.checked < a.roster) folder.pending += 1;
  }

  const list = [...folders.values()];
  for (const f of list) f.subjects.sort((x, y) => x.subject.localeCompare(y.subject));
  return list.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
}

export interface AssessmentBundle {
  assessment: {
    id: string;
    classId: string;
    rawTitle: string;
    title: string;
    status: string;
    format: AssessmentFormat;
    choices: string[];
    choiceCount: number;
    pointsPerItem: number;
    date: string | null;
    className: string;
    benchmark: number;
  };
  items: AnalyticsItem[];
  roster: { learnerId: string; name: string; score: number | null; maxScore: number | null }[];
  submissions: AnalyticsSubmission[];
  competencyNames: string[];
}

export async function getAssessmentBundle(id: string): Promise<AssessmentBundle | null> {
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("assessments")
    .select("id,class_id,title,activity_slot,kind,status,assessment_date,answer_key,classes(name,subject,benchmark)")
    .eq("id", id)
    .maybeSingle();
  if (!a) return null;

  const [itemsRes, enrollRes, subsRes, compRes] = await Promise.all([
    supabase
      .from("assessment_items")
      .select("id,item_number,expected_answer,max_points,assessment_competencies(competencies(name))")
      .eq("assessment_id", id)
      .order("item_number"),
    supabase
      .from("class_enrollments")
      .select("learner_id,learners(display_name)")
      .eq("class_id", a.class_id)
      .eq("status", "active"),
    supabase
      .from("submissions")
      .select("learner_id,score,max_score,submission_answers(assessment_item_id,teacher_final_answer,is_correct)")
      .eq("assessment_id", id),
    supabase.from("competencies").select("name").eq("class_id", a.class_id),
  ]);

  const format = formatOf(a.kind);
  const choiceCount = choiceCountOf(a.answer_key);
  type ClassEmbed = { name: string; subject: string; benchmark: number };
  const cls = one(a.classes as ClassEmbed | ClassEmbed[] | null);
  const pointsPerItem = Number((a.answer_key as { pointsPerItem?: number } | null)?.pointsPerItem ?? 1);

  type ItemRow = {
    id: string; item_number: number; expected_answer: unknown; max_points: number | string;
    assessment_competencies: { competencies: { name: string } | { name: string }[] | null }[];
  };
  const items: AnalyticsItem[] = ((itemsRes.data ?? []) as ItemRow[]).map((r) => ({
    id: r.id,
    itemNumber: r.item_number,
    expected: answerOf(r.expected_answer),
    points: Number(r.max_points),
    competencies: (r.assessment_competencies ?? [])
      .map((l) => one(l.competencies)?.name)
      .filter((n): n is string => !!n),
  }));

  type SubRow = {
    learner_id: string; score: number | null; max_score: number | null;
    submission_answers: { assessment_item_id: string; teacher_final_answer: unknown; is_correct: boolean | null }[];
  };
  const subRows = (subsRes.data ?? []) as SubRow[];
  const submissions: AnalyticsSubmission[] = subRows.map((s) => ({
    learnerId: s.learner_id,
    score: Number(s.score ?? 0),
    maxScore: Number(s.max_score ?? 0),
    answers: Object.fromEntries(
      s.submission_answers.map((x) => [
        x.assessment_item_id,
        { given: answerOf(x.teacher_final_answer), isCorrect: x.is_correct === true },
      ]),
    ),
  }));
  const subByLearner = new Map(subRows.map((s) => [s.learner_id, s]));

  const roster = ((enrollRes.data ?? []) as {
    learner_id: string;
    learners: { display_name: string } | { display_name: string }[] | null;
  }[])
    .map((e) => {
      const sub = subByLearner.get(e.learner_id);
      return {
        learnerId: e.learner_id,
        name: one(e.learners)?.display_name ?? "Unnamed learner",
        score: sub?.score != null ? Number(sub.score) : null,
        maxScore: sub?.max_score != null ? Number(sub.max_score) : null,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  return {
    assessment: {
      id: a.id,
      classId: a.class_id,
      title: activityDisplayTitle(a.title, a.activity_slot),
      rawTitle: a.title,
      status: a.status,
      format,
      choices: choicesFor(format, choiceCount),
      choiceCount,
      pointsPerItem,
      date: a.assessment_date,
      className: cls ? `${cls.name} — ${cls.subject}` : "Class",
      benchmark: Number(cls?.benchmark ?? 75),
    },
    items,
    roster,
    submissions,
    competencyNames: ((compRes.data ?? []) as { name: string }[]).map((c) => c.name),
  };
}