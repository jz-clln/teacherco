import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TermGradesTable } from "@/features/grading/term-grades-table";
import type { ClassTermGrades } from "@/features/grading/queries";
import { compareToRecord, computeTermGrade, type Component } from "@/lib/grading/deped";
import { defaultGradingConfig } from "@/lib/grading/presets";

afterEach(cleanup);
const config = defaultGradingConfig("GMRC");
const classroom: ClassTermGrades = {
  id: "class", name: "Grade 1", subject: "GMRC", gradeLevel: "1", config,
  customized: false, sourceFilename: null, hasTermData: true, unassignedActivityCount: 0,
  learners: ["Achilles Asher C. Cadeliña", "Aldrin Lanuzo"].map((name, index) => ({
    id: String(index), name,
    terms: [1, 2, 3].map((term) => {
      const result = computeTermGrade(term === 3 ? [] : (["written_work", "performance_task", "assessment"] as Component[]).map((component) => ({
        title: component, component, possible: 100, earned: term === 1 ? 100 : 0, isTermExam: component === "assessment",
      })), config);
      return { term, result, comparison: compareToRecord(result, null), recorded: null };
    }),
  })),
};

it("filters mobile learners without filtering the desktop table and supports an empty search result", () => {
  render(<TermGradesTable classroom={classroom} />);
  const mobile = within(screen.getByRole("region", { name: "Learner grades" }));
  fireEvent.change(mobile.getByRole("searchbox"), { target: { value: "  ALDRIN  " } });
  expect(mobile.queryByText(classroom.learners[0].name)).toBeNull();
  expect(mobile.getByText(classroom.learners[1].name)).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getByText(classroom.learners[0].name)).toBeInTheDocument();
  fireEvent.change(mobile.getByRole("searchbox"), { target: { value: "missing" } });
  expect(mobile.getByText("No learners match your search.")).toBeInTheDocument();
  fireEvent.change(mobile.getByRole("searchbox"), { target: { value: "" } });
  expect(mobile.getByText(classroom.learners[0].name)).toBeInTheDocument();
});

it("shows the selected term's grade, pending state, and full breakdown", () => {
  render(<TermGradesTable classroom={classroom} />);
  const region = screen.getByRole("region", { name: "Learner grades" });
  const card = () => region.querySelector("details")!;
  expect(within(card().querySelector("summary")!).getByText("100")).toBeInTheDocument();
  expect(within(card()).getByText("Passed")).toBeInTheDocument();
  card().open = true;
  expect(within(card()).getAllByText("Percentage score")).toHaveLength(3);
  expect(within(card()).getByText("No printed grade")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Term 2" }));
  expect(card().open).toBe(false);
  expect(within(card()).getByText("Failed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Term 3" }));
  expect(within(card().querySelector("summary")!).getByText("Pending")).toBeInTheDocument();
  expect(within(card()).getByText("Not yet graded")).toBeInTheDocument();
});
