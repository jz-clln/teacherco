// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readSyncWorkbook } from "@/features/records/read-sync-workbook";

const names = ["CRUZ, ANA", "REYES, BEN", "SANTOS, CARLA", "LIM, DAN", "GARCIA, ELLA"];
function workbook() {
  const wb = new ExcelJS.Workbook();
  const roster = wb.addWorksheet("INPUT");
  roster.addRow(["LEARNERS' NAMES", "LRN"]);
  names.forEach((n, i) => roster.addRow([n, `12345678900${i}`]));
  for (let term = 1; term <= 3; term++) {
    const sheet = wb.addWorksheet(`TERM${term}`);
    sheet.addRow([`TERM ${term}`]);
    sheet.addRow(["LEARNERS' NAMES", "", "WRITTEN WORKS"]);
    sheet.addRow(["", "", "1", "Initial Grade", "Term Grade", "Descriptor"]);
    sheet.addRow(["HIGHEST POSSIBLE SCORE", "", 10]);
    names.forEach(n => sheet.addRow([n, "", 8, 80, 85, "Proficient"]));
  }
  const attendance = wb.addWorksheet("Attendance");
  attendance.addRow(["Learner name", new Date("2026-10-01T00:00:00Z")]);
  names.forEach(n => attendance.addRow([n, "P"]));
  return wb;
}
async function file(wb: ExcelJS.Workbook) { return new File([new Uint8Array(await wb.xlsx.writeBuffer())], "updated.xlsx"); }

describe("real xlsx sync parsing", () => {
  it("reads all three terms and Excel attendance dates without sending LRNs", async () => {
    const { input } = await readSyncWorkbook(await file(workbook()));
    expect(input.learners).toHaveLength(5); expect(input.sheets.map(s => s.term)).toEqual([1, 2, 3]);
    expect(input.sheets[0].columns[0].scores).toEqual([8, 8, 8, 8, 8]);
    expect(input.attendance[0]).toMatchObject({ date: "2026-10-01", status: "present" });
    expect(JSON.stringify(input)).not.toMatch(/12345678900|lrn|sourceRow/i);
  });
  it("rejects duplicate term-sheet names instead of silently excluding a row", async () => {
    const wb = workbook(); wb.getWorksheet("TERM2")!.addRow([names[0], "", 9]);
    await expect(readSyncWorkbook(await file(wb))).rejects.toThrow(/duplicate or unrecognized/);
  });
  it("blocks invalid scores rather than treating them as deletions", async () => {
    const wb = workbook(); wb.getWorksheet("TERM1")!.getCell("C5").value = 99;
    await expect(readSyncWorkbook(await file(wb))).rejects.toThrow(/invalid values/);
  });
  it("blocks truncated worksheets and oversize uploads", async () => {
    const wb = workbook(); wb.getWorksheet("INPUT")!.getCell("A601").value = "EXTRA, LEARNER";
    await expect(readSyncWorkbook(await file(wb))).rejects.toThrow(/exceeds the supported/);
    await expect(readSyncWorkbook({ size: 16 * 1024 * 1024 } as File)).rejects.toThrow(/15 MB/);
  });
});
