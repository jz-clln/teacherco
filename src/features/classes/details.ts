// src/features/classes/details.ts
// Shared (client + server) shape of a class's editable details.

export type ClassDetails = {
  sectionLink?: { id: string; name: string; grade_level: string } | null;
  name: string;
  schoolName: string;
  schoolId: string;
  adviser: string;
  gradeLevel: string;
  section: string;
  subject: string;
  schoolYear: string;
  benchmark: number;
};

export const GRADES = ["Kindergarten", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];

export const SUBJECTS = [
  "Mathematics",
  "Science",
  "English",
  "Filipino",
  "Language",
  "Araling Panlipunan",
  "MAPEH",
  "Edukasyon sa Pagpapakatao",
  "GMRC",
  "EPP / TLE",
  "Mother Tongue",
];

/** Turns a classes row into ClassDetails, with safe defaults for new columns. */
export function toClassDetails(row: {
  section_link?: { id: string; name: string; grade_level: string } | { id: string; name: string; grade_level: string }[] | null;
  name: string;
  school_name?: string | null;
  school_id?: string | null;
  adviser?: string | null;
  grade_level: string;
  section?: string | null;
  subject: string;
  school_year: string;
  benchmark: number | string;
}): ClassDetails {
  return {
    sectionLink: Array.isArray(row.section_link) ? row.section_link[0] ?? null : row.section_link ?? null,
    name: row.name,
    schoolName: row.school_name ?? "",
    schoolId: row.school_id ?? "",
    adviser: row.adviser ?? "",
    gradeLevel: row.grade_level,
    section: row.section ?? "",
    subject: row.subject,
    schoolYear: row.school_year,
    benchmark: Number(row.benchmark),
  };
}
