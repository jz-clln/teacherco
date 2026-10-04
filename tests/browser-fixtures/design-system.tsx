import React from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/layout/app-shell";
import { OverviewHeader, ClassMetrics, WhatChanged, NeedsAttention, ClassLinks, SectionLoading } from "@/features/classes/overview-view";
import { GroupedSection } from "@/components/ui/grouped-section";
import { toClassDetails } from "@/features/classes/details";
import { classroom, stats, result, insights, state } from "./design-system-data";
import Today from "@/app/(dashboard)/today/page";
import Classes from "@/app/(dashboard)/classes/page";
import Learners from "@/app/(dashboard)/classes/[classId]/learners/page";
import Assessments from "@/app/(dashboard)/classes/[classId]/assessments/page";
import Records from "@/app/(dashboard)/classes/[classId]/records/page";
import Check from "@/app/(dashboard)/check/page";
import Reports from "@/app/(dashboard)/reports/page";
import Ask from "@/app/(dashboard)/ask/page";
import Settings from "@/app/(dashboard)/settings/page";
import "@/app/globals.css";

const props = { params: Promise.resolve({ classId: "class" }), searchParams: Promise.resolve({}) };
const screen = new URLSearchParams(location.search).get("screen") ?? "overview";
const pages: Record<string, () => Promise<React.ReactNode>> = { today: Today, classes: Classes, learners: () => Learners(props), assessments: () => Assessments(props), records: () => Records(props), check: Check, reports: () => Reports(props), ask: Ask, settings: () => Settings(props) };
const overview = <div className="space-y-6">
  <OverviewHeader classId="class" details={toClassDetails(classroom)} /><ClassLinks classId="class" />
  <ClassMetrics total={state === "error" ? null : state === "empty" ? 0 : 36} stats={state === "error" ? null : state === "empty" ? { ...stats, average: null, attendance: null } : stats} benchmark={75} />
  <div className="grid items-start gap-4 lg:grid-cols-2">{state === "loading" ? <SectionLoading label="What changed" /> : <WhatChanged classId="class" result={result} hasRecord={state !== "empty"} />}<NeedsAttention classId="class" insights={state === "error" ? null : insights} /></div>
  <GroupedSection title="Recent assessments" href="/classes/class/assessments"><ul className="tc-rows"><li className="tc-row">Term 1 · Performance Task 2</li><li className="tc-row">Term 1 · Written Work 3</li></ul></GroupedSection>
</div>;
const content = screen === "overview" ? overview : await pages[screen]();
createRoot(document.getElementById("root")!).render(<AppShell>{content}</AppShell>);
