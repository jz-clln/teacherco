import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewHeader, ClassMetrics, WhatChanged, NeedsAttention, ClassLinks } from "@/features/classes/overview-view";
import { summarizeUpdate, type LatestUpdate } from "@/features/classes/change-summary";
import type { ClassStats } from "@/features/classes/stats";

vi.mock("next/navigation", () => ({ usePathname: () => "/classes/class", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/classes/details-actions", () => ({ loadClassSubjectOptions: vi.fn().mockResolvedValue({ok:true,data:['Mathematics','Calculus']}), updateClassDetails: vi.fn() }));
const details = { name: "Grade 1 Giraffe", subject: "Mathematics", gradeLevel: "Grade 1", schoolYear: "2026–2027", schoolName: "School", schoolId: "", adviser: "Teacher", section: "Giraffe", benchmark: 75 };
const stats: ClassStats = { average: 84.2, attendance: 92, below: 4, scored: 36, assessments: 3, learnerPercents: {}, lowest: null };
const fixture = (): LatestUpdate => ({ id: "version-1", version_number: 1, filename: "record.xlsx", created_at: "2026-10-01T00:00:00Z", changes: [], before_learners: [{ id: "a", first_name: "Ana", last_name: "Cruz", status: "active" }], after_learners: [{ id: "a", first_name: "Ana", last_name: "Cruz", status: "active" }], before_scores: [{ learner_id: "a", assessment_id: "w", score: 80, max_score: 100 }], after_scores: [{ learner_id: "a", assessment_id: "w", score: 85, max_score: 100 }] });
afterEach(cleanup);

describe("overview hierarchy and menu", () => {
  it("keeps routine actions visible and reserves More for grading settings", () => {
    render(<OverviewHeader classId="class" details={details} />);
    expect(screen.getByRole("link", { name: "Take attendance" })).toHaveAttribute("href", "/classes/class/attendance");
    for (const [name, route] of [["Import", "records"], ["Export", "export"], ["Sync", "records/sync"]]) expect(screen.getByRole("link", { name })).toHaveAttribute("href", `/classes/class/${route}`);
    const trigger = screen.getByRole("button", { name: "More" }); fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Grading settings" })).toHaveAttribute("href", "/settings?class=class#grading");
    fireEvent.keyDown(document, { key: "Escape" }); expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Edit class details");
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: /Add (learner|student)/ })).not.toBeInTheDocument();
  });
  it("dismisses More outside and preserves learner navigation", () => {
    render(<><OverviewHeader classId="class" details={details} /><ClassLinks classId="class" /></>);
    fireEvent.click(screen.getByRole("button", { name: "More" })); fireEvent.pointerDown(document.body);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Learners" })).toHaveAttribute("href", "/classes/class/learners");
  });
  it("shows four correct metrics and renders unknown metrics as dashes", () => {
    const { rerender } = render(<ClassMetrics total={36} stats={stats} benchmark={75} />);
    for (const value of ["36", "84.2%", "92.0%", "4"]) expect(screen.getByText(value)).toBeInTheDocument();
    expect(screen.getAllByRole("term")).toHaveLength(4);
    rerender(<ClassMetrics total={null} stats={null} benchmark={75} />);
    expect(screen.getAllByText("—")).toHaveLength(4); expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
describe("deterministic latest-update summaries", () => {
  it.each([[85, "increased", "80.0% → 85.0%"], [70, "decreased", "80.0% → 70.0%"]])("calculates average movement to %s", (score, direction, detail) => {
    const data = fixture(); data.after_scores[0].score = Number(score);
    expect(summarizeUpdate(data, 75).insights).toContainEqual(expect.objectContaining({ id: "average", title: `Class average ${direction}`, detail }));
  });
  it("ranks below-benchmark crossings first and never calls a new score a crossing", () => {
    const data = fixture(); data.after_scores[0].score = 70;
    expect(summarizeUpdate(data, 75).insights[0].id).toBe("below");
    data.before_scores = []; expect(summarizeUpdate(data, 75).insights.some(i => i.id === "below")).toBe(false);
  });
  it("counts new learners and learners with new scores by ID, not ambiguous display names", () => {
    const data = fixture(); data.before_scores = [];
    data.after_learners.push({ ...data.after_learners[0], id: "b" });
    data.after_scores.push({ ...data.after_scores[0], learner_id: "b" }, { ...data.after_scores[0], assessment_id: "second" });
    const insights = summarizeUpdate(data, 75).insights;
    expect(insights).toContainEqual(expect.objectContaining({ title: "1 learner was added" }));
    expect(insights).toContainEqual(expect.objectContaining({ title: "2 learners received new scores" }));
  });
  it("counts corrected scores and actual attendance changes, not missing-data notices", () => {
    const data = fixture(); data.changes = [{ kind: "attendance", label: "Ana · 2026-10-01", before: "present", after: "absent" }, { kind: "missing", label: "Old date", before: "present", after: "kept" }];
    const insights = summarizeUpdate(data, 75).insights;
    expect(insights).toContainEqual(expect.objectContaining({ title: "1 score was corrected" }));
    expect(insights).toContainEqual(expect.objectContaining({ title: "1 attendance record changed" }));
  });
  it("ignores unscored and inactive learners in average calculations", () => {
    const data = fixture(); data.after_learners.push({ ...data.after_learners[0], id: "b", status: "inactive" });
    data.after_scores.push({ ...data.after_scores[0], learner_id: "b", score: 0 });
    expect(summarizeUpdate(data, 75).insights.find(i => i.id === "average")?.detail).toBe("80.0% → 85.0%");
  });
  it("shows no-change and no-history states with accurate CTAs", () => {
    const data = fixture(); data.after_scores = structuredClone(data.before_scores);
    const { rerender } = render(<WhatChanged classId="class" result={{ status: "ready", summary: summarizeUpdate(data, 75) }} hasRecord />);
    expect(screen.getByText("You’re up to date")).toBeInTheDocument();
    rerender(<WhatChanged classId="class" result={{ status: "empty" }} hasRecord={false} />);
    expect(screen.getByRole("link", { name: /Import class record/ })).toHaveAttribute("href", "/classes/class/records");
    rerender(<WhatChanged classId="class" result={{ status: "empty" }} hasRecord />);
    expect(screen.getByRole("link", { name: /Sync updated record/ })).toHaveAttribute("href", "/classes/class/records/sync");
  });
  it("links to the exact existing version and explains the average evidence", () => {
    render(<WhatChanged classId="class" result={{ status: "ready", summary: summarizeUpdate(fixture(), 75) }} hasRecord />);
    expect(screen.getByRole("link", { name: /View changes/ })).toHaveAttribute("href", "/classes/class/records/sync?version=version-1#version-version-1");
    expect(screen.getByText(/Later manual edits are not included/)).toBeInTheDocument();
  });
  it("caps overview insights at four", () => {
    const data = fixture(); data.changes = ["attendance", "grade", "activity"].map(kind => ({ kind: kind as "attendance" | "grade" | "activity", label: "value", before: "New activity", after: "new" }));
    expect(summarizeUpdate(data, 75).insights).toHaveLength(4);
  });
  it("caps attention at three and exposes errors and empty states", () => {
    const items = [1, 2, 3, 4].map(n => ({ learnerId: String(n), name: `Learner ${n}`, reasons: ["Score average below benchmark"] }));
    const { rerender } = render(<NeedsAttention classId="class" insights={{ attention: items, attendanceDays: 5, changes: [] }} />);
    expect(screen.queryByText("Learner 4")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all 4/ })).toHaveAttribute("href", "/classes/class/attention");
    rerender(<NeedsAttention classId="class" insights={null} />); expect(screen.getByRole("status")).toHaveTextContent("could not be loaded");
    rerender(<NeedsAttention classId="class" insights={{ attention: [], attendanceDays: 0, changes: [] }} />); expect(screen.getByText(/No concerns found/)).toBeInTheDocument();
  });
});
