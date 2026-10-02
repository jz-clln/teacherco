// src/lib/excel/class-info.ts
//
// Reads the class details printed at the top of a DepEd-style class record:
//   SCHOOL NAME ........ NATO ELEMENTARY SCHOOL      SCHOOL YEAR ... 2026-2027
//   GRADE & SECTION .... ONE-MAYA    TEACHER ... SANDRA O. CONDE    SUBJECT ... LANGUAGE
// Works on the same plain text grids as roster.ts. A label is a cell such as
// "SCHOOL NAME:"; its value is the next filled cell to the right on the same row.

import { smartCase, type SheetGrid } from "@/lib/excel/roster";

export type ClassInfo = {
  schoolName: string;
  schoolId: string;
  adviser: string;
  gradeLevel: string;
  section: string;
  subject: string;
  schoolYear: string;
  /** Suggested class name, e.g. "Grade 1 Maya". */
  name: string;
};

export const EMPTY_CLASS_INFO: ClassInfo = {
  schoolName: "",
  schoolId: "",
  adviser: "",
  gradeLevel: "",
  section: "",
  subject: "",
  schoolYear: "",
  name: "",
};

type Field = "schoolName" | "schoolId" | "adviser" | "subject" | "schoolYear" | "gradeSection" | "grade" | "section";

const LABELS: Record<Field, RegExp> = {
  schoolName: /^school\s*name$/i,
  schoolId: /^school\s*id$/i,
  adviser: /^((class|homeroom)\s*)?(adviser|advisor|teacher)(\s*name)?$/i,
  subject: /^subject(\s*taught)?$/i,
  schoolYear: /^(school\s*year|s\.?\s?y\.?)$/i,
  gradeSection: /^grade\s*(&|and|\/|-)?\s*section$/i,
  grade: /^grade(\s*level)?$/i,
  section: /^section$/i,
};
const FIELDS = Object.keys(LABELS) as Field[];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const unlabel = (s: string) => squash(s).replace(/\s*[:：]\s*$/, "");
const isAnyLabel = (s: string) => FIELDS.some((f) => LABELS[f].test(unlabel(s)));

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

/** "ONE-MAYA" -> Grade 1 + Maya. "6 - Einstein", "Grade Six Rizal", "Kinder Sampaguita" work too. */
export function parseGradeSection(raw: string): { gradeLevel: string; section: string } {
  const s = squash(raw);
  if (!s) return { gradeLevel: "", section: "" };

  const kinder = /^(kinder(garten)?)\b[\s\-–—:.,/]*(.*)$/i.exec(s);
  if (kinder) return { gradeLevel: "Kindergarten", section: smartCase(kinder[3]) };

  const arabic = /^(?:grade|gr\.?)?\s*(\d{1,2})\b\s*[-–—:.,/]*\s*(.*)$/i.exec(s);
  if (arabic && Number(arabic[1]) >= 1 && Number(arabic[1]) <= 12) {
    return { gradeLevel: `Grade ${Number(arabic[1])}`, section: smartCase(arabic[2]) };
  }

  const word = /^(?:grade\s*)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s*[-–—:.,/]*\s*(.*)$/i.exec(s);
  if (word) return { gradeLevel: `Grade ${WORDS[word[1].toLowerCase()]}`, section: smartCase(word[2]) };

  const roman = /^(?:grade\s*)?(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\s*[-–—:.,/]\s*(.+)$/i.exec(s);
  if (roman) return { gradeLevel: `Grade ${ROMAN[roman[1].toLowerCase()]}`, section: smartCase(roman[2]) };

  return { gradeLevel: "", section: smartCase(s) };
}

/** "2026-2027" -> "SY 2026–2027". */
export function normalizeSchoolYear(raw: string): string {
  const m = /(\d{4})\s*[-–—/]\s*(\d{2,4})/.exec(raw);
  if (!m) return squash(raw);
  const end = m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2];
  return `SY ${m[1]}–${end}`;
}

/** First filled cell to the right of (r, c) that is not itself a label. */
function valueRightOf(row: string[], c: number): string {
  for (let k = c + 1; k < Math.min(row.length, c + 14); k++) {
    const v = squash(row[k] ?? "");
    if (!v || /^[:：]$/.test(v)) continue;
    return isAnyLabel(v) ? "" : v;
  }
  return "";
}

/** Finds every label in the top rows of one sheet. */
function scanSheet(sheet: SheetGrid): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  const top = sheet.rows.slice(0, 16);
  for (const row of top) {
    for (let c = 0; c < Math.min(row.length, 40); c++) {
      const text = squash(row[c] ?? "");
      if (!text) continue;
      for (const f of FIELDS) {
        if (out[f]) continue;
        if (LABELS[f].test(unlabel(text))) {
          const v = valueRightOf(row, c);
          if (v) out[f] = v;
        } else {
          // "SUBJECT: LANGUAGE" in one cell.
          const inline = /^([^:：]{3,30})[:：]\s*(.+)$/.exec(text);
          if (inline && LABELS[f].test(squash(inline[1]))) out[f] = squash(inline[2]);
        }
      }
    }
  }
  return out;
}

/**
 * Reads the details from the given sheets. The first sheet that has a field wins,
 * so put the learner sheet first. Sheets are pulled lazily and reading stops
 * as soon as every field is found.
 */
export function detectClassInfo(sheets: Iterable<SheetGrid>): ClassInfo {
  const found: Partial<Record<Field, string>> = {};
  for (const sheet of sheets) {
    const got = scanSheet(sheet);
    for (const f of FIELDS) if (!found[f] && got[f]) found[f] = got[f];
    if (found.schoolName && found.adviser && found.subject && found.schoolYear && (found.gradeSection || (found.grade && found.section))) break;
  }

  let { gradeLevel, section } = found.gradeSection
    ? parseGradeSection(found.gradeSection)
    : { gradeLevel: "", section: "" };
  if (!gradeLevel && found.grade) gradeLevel = parseGradeSection(found.grade).gradeLevel || smartCase(found.grade);
  if (!section && found.section) section = smartCase(found.section);

  return {
    schoolName: smartCase(found.schoolName ?? ""),
    schoolId: (found.schoolId ?? "").replace(/\.0+$/, ""),
    adviser: smartCase(found.adviser ?? ""),
    gradeLevel,
    section,
    subject: smartCase(found.subject ?? ""),
    schoolYear: normalizeSchoolYear(found.schoolYear ?? ""),
    name: [gradeLevel, section].filter(Boolean).join(" "),
  };
}

export const hasClassInfo = (i: ClassInfo | null | undefined): i is ClassInfo =>
  !!i && Object.values(i).some(Boolean);