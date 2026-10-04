import { openWorkbook } from "@/lib/excel/parser";
import { defaultMapping, detectRoster, extractRoster, nameKey, suggestMapping, type Sex, type SheetGrid } from "@/lib/excel/roster";
import { inferTermAndComponent } from "@/lib/grading/deped";
import { syncInputSchema, type SyncInput } from "./sync-model";

/**
 * Learners as shown in the "Check detected learner names" list. Sex comes from the MALE / FEMALE
 * rows of the teacher's record and is only used to group and count names on this device.
 * It is never part of SyncInput. Same order as SyncInput.learners.
 */
export type DisplayLearner = { firstName: string; lastName: string; sex: Sex };

/** Explicit dates and statuses only: never infer attendance from an empty cell or a day number. */
export function readAttendance(sheet: SheetGrid): SyncInput["attendance"] {
  const dates: { col: number; date: string }[] = [];
  for (const row of sheet.rows.slice(0, 30)) {
    const found = row.flatMap((v, col) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? [{ col, date: v }] : []);
    if (found.length) { dates.push(...found); break; }
  }
  if (!dates.length) throw new Error(`${sheet.name}: attendance needs full date headings (YYYY-MM-DD or Excel dates). Day numbers alone are ambiguous.`);
  let mapping = detectRoster([sheet]).mapping;
  // Attendance may contain just one or two learners, below the general roster detector's threshold.
  if (!mapping) {
    const header = sheet.rows.findIndex(row => row.some(v => /^(?:learners?'?\s+)?names?$/i.test(v.trim())));
    if (header >= 0) {
      const nameCol = sheet.rows[header].findIndex(v => /^(?:learners?'?\s+)?names?$/i.test(v.trim()));
      mapping = { ...defaultMapping(sheet), nameCol, format: sheet.rows.slice(header + 1).some(row => row[nameCol]?.includes(",")) ? "surname-first" : "first-last", firstRow: header + 1, lastRow: sheet.rows.length - 1 };
    }
  }
  if (!mapping) throw new Error(`${sheet.name}: could not identify attendance learner names.`);
  const rows = extractRoster(sheet.rows, mapping);
  if (!rows.length || rows.some(l => !l.firstName || !l.lastName || l.flags.some(f => /does not look/i.test(f)))) throw new Error(`${sheet.name}: check the attendance learner names.`);
  const statuses: Record<string, "present" | "absent" | "late" | "excused"> = { p: "present", present: "present", a: "absent", absent: "absent", l: "late", late: "late", e: "excused", excused: "excused" };
  return rows.flatMap(l => dates.map(({ col, date }) => {
    const raw = (sheet.rows[l.sourceRow - 1]?.[col] ?? "").trim().toLowerCase();
    if (raw && !statuses[raw]) throw new Error(`${sheet.name}, row ${l.sourceRow}: use P, A, L, E or the full attendance status. Blank means keep the saved value.`);
    return { firstName: l.firstName, lastName: l.lastName, date, status: raw ? statuses[raw] : null };
  }));
}

export async function readSyncWorkbook(file: File): Promise<{ input: SyncInput; warnings: string[]; display: DisplayLearner[] }> {
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose a workbook smaller than 15 MB.");
  const workbook = await openWorkbook(file, { rejectTruncation: true });
  const { sheetName, detection } = workbook.detect();
  if (!detection.mapping) throw new Error("Could not identify the main learner roster. Use the existing import screen to check the workbook layout.");
  const roster = extractRoster(workbook.read(sheetName).rows, detection.mapping);
  if (roster.some(l => !l.firstName || !l.lastName || l.flags.some(f => /does not look/i.test(f)))) throw new Error("Some roster names could not be read reliably. Correct the names before syncing.");
  const gradeSheets = workbook.findGrades();
  // The grade detector excludes flagged roster rows. A sync must surface them, never silently drop a duplicate.
  for (const g of gradeSheets) {
    const grid = workbook.read(g.sheet), base = suggestMapping(grid);
    const rows = extractRoster(grid.rows, { ...base, firstRow: Math.max(base.firstRow, g.hpsRow ?? 0) });
    if (rows.some(l => !l.include)) throw new Error(`${g.sheet}: duplicate or unrecognized learner names need to be corrected before syncing.`);
  }
  if (gradeSheets.some(g => g.ignored > 0)) throw new Error("Some score cells contain invalid values or exceed the highest possible score. Correct those cells before syncing.");
  const warnings: string[] = [];
  if (!gradeSheets.length) warnings.push("No supported term score sheets were found. Saved scores and grades will be kept.");
  const attendanceSheets = workbook.sheets.filter(s => !s.hidden && /attendance|\bsf\s*2\b/i.test(s.name));
  if (!attendanceSheets.length) warnings.push("No attendance sheet was found. Existing attendance will be kept. Supported attendance sheets use learner names, full date headings, and P/A/L/E statuses.");
  warnings.push("Workbook formulas use Excel’s saved results. Recalculate and save the workbook in Excel before uploading.");
  const parsed = syncInputSchema.safeParse({
    filename: file.name,
    // Deliberately do not serialize LRNs, sex, raw cells or the original workbook.
    learners: roster.map(l => ({ firstName: l.firstName, lastName: l.lastName })),
    sheets: gradeSheets.map(g => ({
      term: inferTermAndComponent(`${g.term} Written Work`).term,
      learners: g.learners.map(l => ({ firstName: l.firstName, lastName: l.lastName, recordedGrade: l.recordedGrade })),
      columns: g.columns.map(c => ({ title: c.title, total: c.total, scores: c.scores })),
    })),
    attendance: attendanceSheets.flatMap(s => readAttendance(workbook.read(s.name))),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the workbook data before syncing.");
  const input = parsed.data;
  const keys = new Set(input.learners.map(l => nameKey(l.firstName, l.lastName)));
  if (!keys.size) throw new Error("The workbook contains no learners to compare.");
  // Display only, same order as input.learners. Stays in the browser.
  const display: DisplayLearner[] = roster.map(l => ({ firstName: l.firstName, lastName: l.lastName, sex: l.sex }));
  return { input, warnings, display };
}
