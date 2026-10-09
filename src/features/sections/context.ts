import {schoolYearKey} from "./model";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
export type AcademicContext = { gradeLevel: string; schoolYear: string; schoolId: string };
const normalized = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Owner/RLS-scoped preflight. Database triggers remain authoritative for races. */
export async function validateLinkedSection(db: Db, teacherId: string, classId: string, context: AcademicContext): Promise<string | null> {
  const { data: teacherClass, error } = await db.from("classes").select("section_id")
    .eq("id", classId).eq("teacher_id", teacherId).maybeSingle();
  if (error || !teacherClass) return "Could not verify this class. Refresh and try again.";
  if (!teacherClass.section_id) return null;
  const { data: section, error: sectionError } = await db.from("sections")
    .select("name, grade_level, school_year, school_id").eq("id", teacherClass.section_id)
    .eq("teacher_id", teacherId).maybeSingle();
  if (sectionError || !section) return "Could not verify the linked Section. Refresh and try again.";
  const mismatch = normalized(context.gradeLevel) !== normalized(section.grade_level)
    ? `grade ${context.gradeLevel}`
    : schoolYearKey(context.schoolYear) !== schoolYearKey(section.school_year)
      ? `school year ${context.schoolYear}`
      : normalized(context.schoolId) && normalized(section.school_id) && normalized(context.schoolId) !== normalized(section.school_id)
        ? `school ID ${context.schoolId}` : null;
  return mismatch
    ? `The class ${mismatch} conflicts with the linked ${section.name} Section (grade ${section.grade_level}, ${section.school_year}). Check the class details against the linked Section before saving.`
    : null;
}
