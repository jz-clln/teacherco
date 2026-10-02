// src/app/(dashboard)/reports/[reportId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { DeleteReportButton } from "@/features/reports/delete-report-button";
import { EvidenceView, type StoredEvidence } from "@/features/reports/evidence-view";
import { fallbackMessages, fmtDate, reportTypeLabels } from "@/features/reports/format";
import { ReportEditor } from "@/features/reports/report-editor";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Report" };

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: report } = await supabase
    .from("reports")
    .select("id, report_type, status, evidence_snapshot, generated_content, teacher_edited_content, created_at, updated_at, class:classes(id, name)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) notFound();

  const evidence = report.evidence_snapshot as StoredEvidence;
  const classroom = Array.isArray(report.class) ? report.class[0] : report.class;
  const hasEdits = report.teacher_edited_content != null;
  const text = String(report.teacher_edited_content ?? report.generated_content ?? "");
  const { generation } = evidence;
  const isAi = generation.source === "ai";

  // Scores typed in by the teacher after this report was written. Only typed-in activities count:
  // imports re-save unchanged scores too, so they would flag every report by mistake.
  let changedScores = 0;
  if (classroom?.id) {
    let query = supabase
      .from("submissions")
      .select("id, assessments!inner(class_id, source)", { count: "exact", head: true })
      .eq("assessments.class_id", classroom.id)
      .eq("assessments.source", "manual")
      .gt("updated_at", generation.generatedAt);
    if (evidence.kind === "learner_progress") query = query.eq("learner_id", evidence.learner.id);
    const { count } = await query;
    changedScores = count ?? 0;
  }

  return (
    <div className="space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52] hover:underline">
        <ArrowLeft size={16} /> All reports
      </Link>

      <div>
        <p className="text-sm font-semibold text-[#4F6F52]">
          {classroom ? classroom.name : "Deleted class"} · {fmtDate(String(report.created_at))}
        </p>
        <h1 className="mt-1 text-3xl font-bold">{reportTypeLabels[report.report_type as keyof typeof reportTypeLabels]}</h1>
        {evidence.kind === "learner_progress" ? <p className="mt-1 text-[#606861]">{evidence.learner.name}</p> : null}
      </div>

      {changedScores > 0 ? (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          {changedScores} {changedScores === 1 ? "score was" : "scores were"} recorded after this report was written. The numbers below are
          from {fmtDate(generation.generatedAt)}. Generate a new report to include {changedScores === 1 ? "it" : "them"}.
        </p>
      ) : null}

      <Card className="sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-[#1E2420]">Summary</h2>
          {hasEdits ? (
            <span className="rounded-full bg-[#EAF0EA] px-2.5 py-1 text-sm font-medium text-[#1A4D2E]">Edited by you</span>
          ) : (
            <span className="rounded-full bg-[#E8DFCA]/60 px-2.5 py-1 text-sm font-medium text-[#606861]">
              {isAi ? "AI draft · please review" : "From your records · no AI"}
            </span>
          )}
        </div>

        {!isAi && generation.fallbackReason ? (
          <p className="mt-3 text-sm leading-5 text-[#606861]">{fallbackMessages[generation.fallbackReason]}</p>
        ) : null}

        <div className="mt-5">
          <ReportEditor key={String(report.updated_at)} reportId={String(report.id)} text={text} status={report.status === "final" ? "final" : "draft"} hasEdits={hasEdits} />
        </div>

        {hasEdits ? (
          <details className="mt-5 rounded-2xl border border-[#E3E5E1] bg-[#FAFAF8] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#313832]">
              {isAi ? "Original AI draft" : "Original text from your records"}
            </summary>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#606861]">{String(report.generated_content ?? "")}</p>
          </details>
        ) : null}
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Evidence</h2>
          <p className="mt-1 text-sm text-[#606861]">Where each number comes from.</p>
        </div>
        <EvidenceView evidence={evidence} />
      </section>

      <div>
        <DeleteReportButton reportId={String(report.id)} />
      </div>
    </div>
  );
}