import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/features/classes/overview-data", () => ({ ownedClass: async () => ({ classroom: { name: "Grade 1 Giraffe" } }), classRoster: async () => [] }));
vi.mock("@/features/learners/actions", () => ({ addLearner: vi.fn(), deleteLearner: vi.fn() }));
vi.mock("@/features/classes/details-actions", () => ({ loadClassSubjectOptions: vi.fn().mockResolvedValue({ok:true,data:['Mathematics','Calculus']}), updateClassDetails: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/classes/class/learners", useRouter: () => ({ refresh: vi.fn() }) }));
import ClassLearnersPage from "@/app/(dashboard)/classes/[classId]/learners/page";
afterEach(cleanup);
it("keeps the original learner form in the dedicated Learners area", async () => {
  render(await ClassLearnersPage({ params: Promise.resolve({ classId: "class" }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "Learners" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Class overview/ })).toHaveAttribute("href", "/classes/class");
  fireEvent.click(screen.getByRole("button", { name: "Add learner" }));
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Add learner");
  expect(screen.getByLabelText("First name")).toBeInTheDocument(); expect(screen.getByLabelText("Last name")).toBeInTheDocument();
  expect(document.querySelector('input[name="classId"]')).toHaveValue("class");
});
