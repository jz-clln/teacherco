import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readWorkbookGradingRules } from "@/lib/excel/parser";

describe("readWorkbookGradingRules", () => {
  it("reads only the active named tables from a hidden helper sheet", () => {
    const workbook = new ExcelJS.Workbook();
    const helper = workbook.addWorksheet("Helper (Do Not Delete)");
    helper.state = "hidden";
    helper.getCell("H3").value = 0;
    helper.getCell("J3").value = 39.99;
    helper.getCell("K3").value = 60;
    helper.getCell("H4").value = 40;
    helper.getCell("J4").value = 42.99;
    helper.getCell("K4").value = 61;
    helper.getCell("T3").value = 0;
    helper.getCell("V3").value = 64;
    helper.getCell("W3").value = "Emerging";
    helper.getCell("T4").value = 65;
    helper.getCell("V4").value = 74;
    helper.getCell("W4").value = "Developing";
    workbook.definedNames.add("'Helper (Do Not Delete)'!$H$3:$K$4", "NewTransmu");
    workbook.definedNames.add("'Helper (Do Not Delete)'!$T$3:$W$4", "DESCRIPTORS");

    expect(readWorkbookGradingRules(workbook)).toEqual({
      transmutation: [
        { min: 0, max: 39.99, grade: 60 },
        { min: 40, max: 42.99, grade: 61 },
      ],
      descriptors: [
        { min: 0, label: "Emerging" },
        { min: 65, label: "Developing" },
      ],
    });
  });
});