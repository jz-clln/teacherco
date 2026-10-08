import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import AssessmentsPage from "@/app/(dashboard)/classes/[classId]/assessments/page";
import { WhatChanged } from "@/features/classes/overview-view";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>, useLinkStatus: () => ({ pending: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/classes/class/assessments", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/features/classes/details-actions", () => ({ loadClassSubjectOptions: vi.fn().mockResolvedValue({ok:true,data:['Mathematics','Calculus']}), updateClassDetails: vi.fn() }));
vi.mock("@/features/classes/overview-data", () => ({ ownedClass: vi.fn(async () => ({ classroom: { name: "Grade 1" } })) }));
vi.mock("@/features/exams/queries", () => ({ getAssessmentsOverview: vi.fn(async () => []) }));
vi.mock("@/features/exams/actions", () => ({ deleteAssessment: vi.fn() }));
afterEach(cleanup);

it("has five mobile destinations and an accessible account disclosure", () => {
  render(<AppShell><p>Page</p></AppShell>);
  const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
  expect(within(nav).getAllByRole("link").map(el => el.textContent)).toEqual(["Today", "Classes", "Check", "Reports", "Ask"]);
  const trigger = screen.getByRole("button", { name: "Account" }); fireEvent.click(trigger);
  const group = screen.getByRole("group", { name: "Account actions" });
  expect(within(group).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  expect(within(group).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/settings#profile");
  expect(within(group).getByRole("button", { name: "Sign out" })).toHaveAttribute("type", "submit");
  fireEvent.keyDown(document, { key: "Escape" }); expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("keeps New assessment within the class context", async () => {
  render(await AssessmentsPage({ params: Promise.resolve({ classId: "class" }) }));
  expect(screen.getByRole("link", { name: "New assessment" })).toHaveAttribute("href", "/check/new?classId=class");
  expect(screen.getByRole("link", { name: "Assessments" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Record scores" })).toHaveAttribute("href", "/classes/class/scores");
});

it("groups change rows, retaining words for direction and version evidence", () => {
  render(<WhatChanged classId="class" hasRecord result={{ status: "ready", summary: { versionId: "v1", timestamp: "2026-10-01", insights: [{ id: "average", title: "Class average decreased", detail: "85% → 80%", priority: 1 }], evidence: "Recorded scores" } }} />);
  expect(screen.getByRole("list")).toHaveClass("tc-rows");
  expect(screen.getByText("Class average decreased")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "See all: What changed" })).toHaveAttribute("href", "/classes/class/records/sync?version=v1#version-v1");
});
