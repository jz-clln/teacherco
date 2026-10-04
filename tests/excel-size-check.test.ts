// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@/lib/excel/parser";

async function workbook(fill: (ws: ExcelJS.Worksheet) => void, name = "TERM1") {
  const wb = new ExcelJS.Workbook();
  fill(wb.addWorksheet(name));
  return new File([await wb.xlsx.writeBuffer()], "record.xlsx");
}
const LIMIT = /exceeds the supported 600 rows or 80 columns/;
const strict = { rejectTruncation: true };

describe("size check uses real data, not formatting", () => {
  it("accepts empty but formatted cells far below the data", async () => {
    const file = await workbook((ws) => {
      ws.getCell("A1").value = "Names";
      for (let r = 2; r <= 1000; r++) ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
      ws.getCell("AZ2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    });
    await expect(openWorkbook(file, strict)).resolves.toBeTruthy();
  });
  it("still rejects data below row 600", async () => {
    const file = await workbook((ws) => { ws.getCell("A1").value = "x"; ws.getCell("A601").value = "learner"; });
    await expect(openWorkbook(file, strict)).rejects.toThrow(LIMIT);
  });
  it("still rejects data past column 80", async () => {
    const file = await workbook((ws) => { ws.getCell("A1").value = "x"; ws.getCell(1, 81).value = "extra"; });
    await expect(openWorkbook(file, strict)).rejects.toThrow(LIMIT);
  });
  it("accepts data exactly on row 600 and column 80", async () => {
    const file = await workbook((ws) => { ws.getCell("A600").value = "last"; ws.getCell(1, 80).value = "edge"; });
    await expect(openWorkbook(file, strict)).resolves.toBeTruthy();
  });
  it("ignores oversized hidden sheets", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Visible").getCell("A1").value = "ok";
    const hidden = wb.addWorksheet("Helper");
    hidden.state = "hidden";
    hidden.getCell("A900").value = "x";
    await expect(openWorkbook(new File([await wb.xlsx.writeBuffer()], "r.xlsx"), strict)).resolves.toBeTruthy();
  });
  it("does not check size unless asked", async () => {
    const file = await workbook((ws) => { ws.getCell("A700").value = "x"; });
    await expect(openWorkbook(file)).resolves.toBeTruthy();
  });
});
