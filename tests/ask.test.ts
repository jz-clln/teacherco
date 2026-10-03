import { describe, expect, it } from "vitest";
import { answerQuestion, findMissingActivityNames, type AskClass } from "@/features/ask/engine";

const classroom: AskClass = {
  id: "class-1",
  name: "Grade 6 Einstein",
  subject: "Mathematics",
  benchmark: 75,
  classAverage: 78.4,
  assessmentCount: 2,
  assessments: [
    { title: "Fractions quiz", average: 62.5, learnerCount: 2 },
    { title: "Decimals quiz", average: 88, learnerCount: 2 },
  ],
  competencies: [
    { name: "Fractions", average: 60, assessmentCount: 1 },
    { name: "Decimals", average: 90, assessmentCount: 2 },
  ],
  learners: [
    {
      id: "learner-1", name: "Maria Santos", average: 68, absences: 5, attendanceRate: 70, change: -12,
      assessments: [{ title: "Fractions quiz", percentage: 68 }], missingActivities: ["Decimals quiz"],
      competencies: [{ name: "Fractions", average: 50, classAverage: 60 }],
    },
    {
      id: "learner-2", name: "Ana Reyes", average: 82, absences: 1, attendanceRate: 95, change: 8,
      assessments: [{ title: "Fractions quiz", percentage: 82 }], missingActivities: [],
      competencies: [{ name: "Fractions", average: 70, classAverage: 60 }],
    },
  ],
};

describe("answerQuestion", () => {
  it("filters learners below an explicit benchmark", () => {
    const answer = answerQuestion("Who is below 75?", [classroom], { absenceThreshold: 5 });
    expect(answer.rows.map((row) => row.learnerName)).toEqual(["Maria Santos"]);
    expect(answer.rows[0]?.average).toBe(68);
  });

  it("combines grade and absence conditions", () => {
    const answer = answerQuestion("Who has low grades and at least 5 absences?", [classroom], { absenceThreshold: 5 });
    expect(answer.rows.map((row) => row.learnerName)).toEqual(["Maria Santos"]);
  });

  it("answers class average and weakest competency from supplied evidence", () => {
    expect(answerQuestion("What is the class average?", [classroom], { absenceThreshold: 5 }).text).toContain("78.4%");
    expect(answerQuestion("Which competency is weakest?", [classroom], { absenceThreshold: 5 }).text).toContain("Fractions");
  });

  it("compares class averages across classrooms", () => {
    const otherClass = { ...classroom, id: "class-2", name: "Grade 6 Malunggay", classAverage: 65 };
    const answer = answerQuestion("Which class currently has the lowest average?", [classroom, otherClass], { absenceThreshold: 5 });
    expect(answer.text).toContain("Grade 6 Malunggay");
    expect(answer.text).toContain("65%");
  });

  it("summarizes a named learner rather than the whole class", () => {
    const answer = answerQuestion("Summarize Maria's academic progress", [classroom], { absenceThreshold: 5 });
    expect(answer.kind).toBe("learner-lookup");
    expect(answer.text).toContain("Maria Santos");
    expect(answer.text).toContain("5 recorded absences");
  });

  it("reports only scored learners in class-summary benchmark counts", () => {
    const withUnscoredLearner = {
      ...classroom,
      learners: [...classroom.learners, {
        id: "learner-3", name: "Jo Lee", average: null, absences: null, attendanceRate: null, change: null,
        assessments: [], missingActivities: [], competencies: [],
      }],
    };
    const answer = answerQuestion("What should I know about this class?", [withUnscoredLearner], { absenceThreshold: 5 });
    expect(answer.text).toContain("1 of 2 learners with scores below the 75% benchmark");
  });

  it("does not claim an upload comparison without import history", () => {
    const answer = answerQuestion("What changed since my last upload?", [classroom], { absenceThreshold: 5 });
    expect(answer.kind).toBe("import-history");
    expect(answer.text).toContain("guess what changed");
  });

  it("routes report requests to the existing report builder", () => {
    const answer = answerQuestion("Prepare a class report", [classroom], { absenceThreshold: 5 });
    expect(answer.kind).toBe("report");
    expect(answer.action).toEqual({ href: "/reports", label: "Open Reports" });
  });

  it("narrows a competency follow-up to learners below that competency's class average", () => {
    const context = { competencyName: "Fractions" };
    const answer = answerQuestion("Which learners are struggling with it?", [classroom], { absenceThreshold: 5, context });
    expect(answer.rows.map((row) => row.learnerName)).toEqual(["Maria Santos"]);
    expect(answer.rows[0]?.competency).toMatchObject({ name: "Fractions", average: 50, classAverage: 60 });
  });

  it("narrows follow-up results to the previously matched learners", () => {
    const answer = answerQuestion("Only show those who also have frequent absences", [classroom], {
      absenceThreshold: 5,
      context: { learnerIds: ["learner-1", "learner-2"] },
    });
    expect(answer.rows.map((row) => row.learnerName)).toEqual(["Maria Santos"]);
    expect(answer.context?.learnerIds).toEqual(["learner-1"]);
  });

  it("does not pretend to answer general-knowledge questions", () => {
    expect(answerQuestion("What is the capital of France?", [classroom], { absenceThreshold: 5 }).kind).toBe("unsupported");
  });
});

describe("findMissingActivityNames", () => {
  it("compares learners and activities using the same confirmed score rows", () => {
    const missing = findMissingActivityNames(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { assessmentId: "activity-1", assessmentTitle: "Quiz 1", learnerId: "a" },
        { assessmentId: "activity-1", assessmentTitle: "Quiz 1", learnerId: "b" },
        { assessmentId: "activity-2", assessmentTitle: "Quiz 2", learnerId: "b" },
      ],
    );
    expect(missing.get("a")).toEqual(["Quiz 2"]);
    expect(missing.get("b")).toEqual([]);
    expect(missing.get("c")).toEqual(["Quiz 1", "Quiz 2"]);
  });
});