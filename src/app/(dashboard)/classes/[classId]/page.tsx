import {LoadingState} from '@/components/ui/loading-state';
import { Suspense } from "react";
import Link from "next/link";
import { GroupedSection } from "@/components/ui/grouped-section";
import { toClassDetails } from "@/features/classes/details";
import { ownedClass, currentOverview, latestClassChanges, recentAssessments } from "@/features/classes/overview-data";
import { OverviewHeader, ClassMetrics, WhatChanged, NeedsAttention, ClassLinks, SectionLoading, overviewLink } from "@/features/classes/overview-view";

type Current = ReturnType<typeof currentOverview>;
async function Metrics({ current, benchmark }: { current: Current; benchmark: number }) {
  const data = await current;
  return <ClassMetrics total={data.total} stats={data.metrics} benchmark={benchmark} />;
}
async function Changes({ classId, current }: { classId: string; current: Current }) {
  const [result, data] = await Promise.all([latestClassChanges(classId), current]);
  return <WhatChanged classId={classId} result={result} hasRecord={Boolean(data.metrics?.assessments)} />;
}
async function Attention({ classId, current }: { classId: string; current: Current }) {
  return <NeedsAttention classId={classId} insights={(await current).insights} />;
}
async function Recent({ classId, current }: { classId: string; current: Current }) {
  const [assessments, data] = await Promise.all([recentAssessments(classId), current]);
  return <GroupedSection title="Recent assessments" href={`/classes/${classId}/assessments`}><div className="p-5">
    {assessments === null ? <p role="status" className="mt-2 text-sm text-[#606861]">Recent assessments could not be loaded.</p> : !assessments.length ? <p className="mt-2 text-sm text-[#606861]">Your latest assessments will appear here after you record or import scores.</p> : <ul className="mt-2 divide-y divide-[#E3E5E1]">{assessments.map(a => <li key={a.id}><Link className={`${overviewLink} flex-wrap gap-x-3 py-2`} href={a.source === "checked" ? `/check/${a.id}` : a.source === "manual" ? `/classes/${classId}/scores?a=${a.id}` : `/classes/${classId}/term-grades`}><span className="min-w-0 break-words">{a.title}</span><span className="text-xs font-normal text-[#606861]">{new Date(a.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}</span></Link></li>)}</ul>}
    {data.metrics?.lowest && <p className="mt-3 border-t border-[#E3E5E1] pt-3 text-xs text-[#606861]">Lowest scoring activity: {data.metrics.lowest.title} · {data.metrics.lowest.average.toFixed(1)}%</p>}
  </div></GroupedSection>;
}
export default async function ClassOverviewPage({ params, searchParams }: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ imported?: string; grades?: string; details?: string; added?: string; removed?: string; error?: string }>;
}) {
  const { classId } = await params;
  const { classroom } = await ownedClass(classId);
  const notices = await searchParams;
  const current = currentOverview(classId);
  return <div className="space-y-6">
    <OverviewHeader classId={classId} details={toClassDetails(classroom)} />
    <ClassLinks classId={classId} />
    {notices.imported !== undefined && <p role="status" className="rounded-xl bg-[#EAF0EA] p-3 text-sm text-[#1A4D2E]">Record imported. {Number(notices.imported) || 0} learners added{Number(notices.grades) > 0 ? ` and ${Number(notices.grades)} scores saved` : ""}.{notices.details === "1" ? " Class details updated." : ""}</p>}
    {(notices.added || notices.removed || notices.error) && <p role="status" className="text-sm text-[#606861]">{notices.error ? "Review your learner update." : "Learner list updated."} <Link href={`/classes/${classId}/learners`} className={overviewLink}>Open learners →</Link></p>}
    <Suspense fallback={<LoadingState label="Loading class metrics..."/>}><Metrics current={current} benchmark={Number(classroom.benchmark)} /></Suspense>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Suspense fallback={<SectionLoading label="What changed" />}><Changes classId={classId} current={current} /></Suspense>
      <Suspense fallback={<SectionLoading label="Needs attention" />}><Attention classId={classId} current={current} /></Suspense>
    </div>

    <Suspense fallback={<SectionLoading label="Recent assessments" />}><Recent classId={classId} current={current} /></Suspense>
  </div>;
}
