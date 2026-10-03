import { describe, expect, it } from "vitest";
import { computeTermGrade, type ScoreItem } from "@/lib/grading/deped";
import { defaultGradingConfig } from "@/lib/grading/presets";

function workbookTerm(items: ScoreItem[]) {
  return computeTermGrade(items, defaultGradingConfig("GMRC"));
}

describe("DepEd workbook preset", () => {
  it("uses 20/50/30 weights for GMRC and 20/60/20 for EPP/TLE", () => {
    expect(defaultGradingConfig("GMRC").weights).toEqual({ written_work: 0.2, performance_task: 0.5, assessment: 0.3 });
    expect(defaultGradingConfig("EPP").weights).toEqual({ written_work: 0.2, performance_task: 0.6, assessment: 0.2 });
    expect(defaultGradingConfig("TLE").weights).toEqual({ written_work: 0.2, performance_task: 0.6, assessment: 0.2 });
    expect(defaultGradingConfig("Edukasyong Pantahanan at Pangkabuhayan").weights).toEqual({ written_work: 0.2, performance_task: 0.6, assessment: 0.2 });
  });

  it.each([
    { term: 1, scores: [[12, 20], [8, 10], [26, 60]], ps: [60, 80, 43.33], ws: [12, 40, 13], initial: 65, grade: 72, descriptor: "Developing" },
    { term: 2, scores: [[30, 40], [285, 300], [83, 100]], ps: [75, 95, 83], ws: [15, 47.5, 24.9], initial: 87.4, grade: 89, descriptor: "Benchmarking" },
    { term: 3, scores: [[82, 100], [300, 300], [176, 200]], ps: [82, 100, 88], ws: [16.4, 50, 26.4], initial: 92.8, grade: 94, descriptor: "Advancing" },
  ])("reproduces the uploaded workbook's Term $term grades", ({ scores, ps, ws, initial, grade, descriptor }) => {
    const [[written, writtenPossible], [performance, performancePossible], [assessment, assessmentPossible]] = scores;
    const result = workbookTerm([
      { title: "Written Works", component: "written_work", possible: writtenPossible, earned: written, isTermExam: false },
      { title: "Performance Tasks", component: "performance_task", possible: performancePossible, earned: performance, isTermExam: false },
      { title: "Summative Tests and Term Exam", component: "assessment", possible: assessmentPossible, earned: assessment, isTermExam: true },
    ]);

    expect(result.status).toBe("graded");
    expect(result.components.map((component) => component.ps)).toEqual(ps);
    expect(result.components.map((component) => component.ws)).toEqual(ws);
    expect(result.initialGrade).toBe(initial);
    expect(result.termGrade).toBe(grade);
    expect(result.descriptor).toBe(descriptor);
  });

  it("matches the workbook gate when ST scores exist but the Term Exam is blank", () => {
    const result = workbookTerm([
      { title: "Written Works", component: "written_work", possible: 20, earned: 12, isTermExam: false },
      { title: "Performance Tasks", component: "performance_task", possible: 10, earned: 8, isTermExam: false },
      { title: "ST1", component: "assessment", possible: 20, earned: 9, isTermExam: false },
      { title: "ST2", component: "assessment", possible: 15, earned: 2, isTermExam: false },
      { title: "TE", component: "assessment", possible: 25, earned: null, isTermExam: true },
    ]);

    expect(result.status).toBe("graded");
    expect(result.components[2]).toMatchObject({ earned: 11, possible: 60, ps: 18.33, ws: 5.5 });
    expect(result.initialGrade).toBe(57.5);
    expect(result.termGrade).toBe(68);
  });
});