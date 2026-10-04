import Link from "next/link";
import { ArrowLeft, Download, RefreshCw, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClassMoreMenu } from "./class-more-menu";
import { EditClassDetails } from "./edit-class-details";
import { GroupedSection } from "@/components/ui/grouped-section";
import { ClassTabs } from "./class-tabs";
import type { ClassDetails } from "./details";
import type { ClassStats } from "./stats";
import type { ClassInsights } from "./insights";
import type { ChangeSummary } from "./change-summary";

export const overviewLink = "inline-flex min-h-11 items-center text-sm font-semibold text-[#1A4D2E] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#1A4D2E]";
export function OverviewHeader({ classId, details }: { classId: string; details: ClassDetails }) {
  return <header className="space-y-3">
    <div className="flex items-center justify-between gap-3"><Link href="/classes" className={overviewLink}><ArrowLeft size={16} className="mr-1" aria-hidden />All classes</Link><ClassMoreMenu classId={classId} /></div>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h1>{details.name}</h1><p className="mt-2 break-words text-sm text-[#606861]">{details.subject}</p><p className="mt-1 text-xs text-[#606861]">{details.gradeLevel} · SY {details.schoolYear}</p></div>
      <EditClassDetails classId={classId} initial={details} triggerLabel="Edit" triggerClassName="tc-button tc-quiet shrink-0 px-2" />
    </div>
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <Link href={`/classes/${classId}/attendance`} className="tc-button tc-primary w-full sm:w-auto">Take attendance</Link>
      <div className="grid grid-cols-3 gap-2 sm:flex" aria-label="Record utilities">
        <Link href={`/classes/${classId}/records/sync`} className="tc-button tc-secondary px-2"><RefreshCw size={18} aria-hidden />Sync</Link>
        <Link href={`/classes/${classId}/records`} className="tc-button tc-secondary px-2"><Upload size={18} aria-hidden />Import</Link>
        <Link href={`/classes/${classId}/export`} className="tc-button tc-secondary px-2"><Download size={18} aria-hidden />Export</Link>
      </div>
    </div>
  </header>;
}
export function ClassMetrics({ total, stats, benchmark }: { total: number | null; stats: ClassStats | null; benchmark: number }) {
  const values = [
    ["Learners", total === null ? "—" : String(total), total === null ? "Could not load" : "Active in this class"],
    ["Class average", stats?.average == null ? "—" : `${stats.average.toFixed(1)}%`, stats?.average == null ? "No score average available" : "Recorded scores"],
    ["Attendance", stats?.attendance == null ? "—" : `${stats.attendance.toFixed(1)}%`, stats?.attendance == null ? "No attendance rate available" : "Present or late · all recorded days"],
    [`Below ${benchmark}%`, stats?.average == null ? "—" : String(stats.below), "Learners below benchmark"],
  ];
  return <div><dl aria-label="Class metrics" className="tc-group tc-metrics">{values.map(([label, value, hint]) => <div key={label}><dt className="text-sm text-[#606861]">{label}</dt><dd className="tc-value mt-2 text-2xl font-bold tabular-nums">{value}</dd><dd className="mt-2 text-xs text-[#606861]">{hint}</dd></div>)}</dl>{!stats && <p role="status" className="mt-2 text-xs text-[#606861]">Class metrics could not be loaded. Refresh to try again.</p>}</div>;
}
export function WhatChanged({ classId, result, hasRecord }: { classId: string; result: { status: "error" | "empty" } | { status: "ready"; summary: ChangeSummary }; hasRecord: boolean }) {
  const summary = result.status === "ready" ? result.summary : null;
  const history = summary ? `/classes/${classId}/records/sync?version=${summary.versionId}#version-${summary.versionId}` : `/classes/${classId}/records/sync`;
  return <GroupedSection title="What changed" href={history}><div className="p-5">
    {result.status === "error" ? <p role="status" className="mt-2 text-sm text-[#606861]">Changes could not be loaded. <Link href={history} className={overviewLink}>Open record history</Link></p> : !summary ? <><p className="mt-2 text-sm text-[#606861]">Changes will appear here after you sync an updated class record.</p><Link className={overviewLink} href={hasRecord ? history : `/classes/${classId}/records`}>{hasRecord ? "Sync updated record" : "Import class record"} →</Link></> : <>
      <p className="mt-1 text-xs text-[#606861]">Since your last record update · {new Date(summary.timestamp).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}</p>
      {summary.insights.length ? <ul className="tc-rows mt-3">{summary.insights.map(insight => <li key={insight.id} className="py-4"><p className="font-medium">{insight.title}</p>{insight.detail && <p className="mt-1 text-sm text-[#606861]">{insight.detail}</p>}</li>)}</ul> : <div className="mt-3"><p className="text-sm font-medium">You’re up to date</p><p className="mt-1 text-sm text-[#606861]">No significant classroom changes were found in the latest record update.</p></div>}
      <details className="mt-2"><summary className={`${overviewLink} cursor-pointer`}>Show evidence</summary><p className="text-xs leading-5 text-[#606861]">{summary.evidence}</p><Link href={history} className={overviewLink}>Inspect before and after records →</Link></details>
      <Link className={overviewLink} href={history}>View changes →</Link>
    </>}
  </div></GroupedSection>;
}
export function NeedsAttention({ classId, insights }: { classId: string; insights: ClassInsights | null }) {
  return <GroupedSection title="Needs attention" href={insights?.attention.length ? `/classes/${classId}/attention` : undefined}><div className="p-5">
    {!insights ? <p role="status" className="text-sm text-[#606861]">Attention checks could not be loaded. Refresh to try again.</p> : !insights.attention.length ? <p className="text-sm text-[#606861]">No concerns found in the available scores and recent attendance.</p> : <><ul className="tc-rows">{insights.attention.slice(0, 3).map(item => <li key={item.learnerId} className="py-4"><p className="break-words font-medium">{item.name}</p><p className="mt-1 text-sm text-[#606861]">{item.reasons[0]}{item.reasons.length > 1 ? ` · ${item.reasons.length - 1} more concern` : ""}</p></li>)}</ul><Link className={overviewLink} href={`/classes/${classId}/attention`}>View all {insights.attention.length} →</Link></>}
  </div></GroupedSection>;
}
export function SectionLoading({ label }: { label: string }) { return <Card className="min-h-36"><h2 className="text-lg font-semibold">{label}</h2><p role="status" className="mt-3 text-sm text-[#606861]">Loading {label.toLowerCase()}…</p><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-[#EAF0EA] motion-reduce:animate-none" /></Card>; }
export function ClassLinks({ classId }: { classId: string }) { return <ClassTabs classId={classId} />; }
