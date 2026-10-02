// src/app/(dashboard)/reports/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { fmtDate, reportTypeLabels } from "@/features/reports/format";
import { GenerateReportForm, type GenerateClassOption } from "@/features/reports/generate-report-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reports" };

function one(value: unknown): Record<string, unknown> | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? (item as Record<string, unknown>) : null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; class?: string; deleted?: string }>;
}) {
  const { type, class: classFilter, deleted } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const typeFilter = type === "class_performance" || type === "learner_progress" ? type : "";
  const classFilterId = z.string().uuid().safeParse(classFilter).success ? String(classFilter) : "";

  let reportsQuery = supabase
    .from("reports")
    .select(
      "id, report_type, status, created_at, class:classes(name), source:evidence_snapshot->generation->>source, learner_name:evidence_snapshot->learner->>name",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (typeFilter) reportsQuery = reportsQuery.eq("report_type", typeFilter);
  if (classFilterId) reportsQuery = reportsQuery.eq("class_id", classFilterId);

  const [{ data: classes }, { data: enrollments }, { data: profile }, { data: reports }] = await Promise.all([
    supabase.from("classes").select("id, name, subject, grade_level, school_year").eq("teacher_id", user.id).order("created_at", { ascending: false }),
    supabase.from("class_enrollments").select("class_id, learner:learners(id, display_name)").eq("status", "active").limit(1000),
    supabase.from("profiles").select("ai_enabled").eq("id", user.id).maybeSingle(),
    reportsQuery,
  ]);

  const learnersByClass = new Map<string, { id: string; name: string }[]>();
  for (const enrollment of enrollments ?? []) {
    const learner = one(enrollment.learner);
    if (!learner) continue;
    const classId = String(enrollment.class_id);
    const list = learnersByClass.get(classId) ?? [];
    list.push({ id: String(learner.id), name: String(learner.display_name) });
    learnersByClass.set(classId, list);
  }

  const classOptions: GenerateClassOption[] = (classes ?? []).map((item) => ({
    id: String(item.id),
    name: String(item.name),
    subject: String(item.subject),
    gradeLevel: String(item.grade_level),
    schoolYear: String(item.school_year),
    learners: (learnersByClass.get(String(item.id)) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const filtered = Boolean(typeFilter || classFilterId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[#4F6F52]">REPORTS</p>
        <h1 className="mt-1 text-3xl font-bold">Teacher-ready summaries</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#606861]">
          Every number comes from your confirmed records. AI only helps with the wording, and you can edit anything before you use it.
        </p>
      </div>

      {deleted ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">The report was deleted.</p> : null}

      <Card className="sm:p-6">
        <h2 className="font-semibold text-[#1E2420]">Prepare a report</h2>
        <div className="mt-5">
          <GenerateReportForm classes={classOptions} aiEnabled={profile?.ai_enabled !== false} />
        </div>
      </Card>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-lg font-semibold">Saved reports</h2>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Select
              name="type"
              label="Report type"
              hideLabel
              compact
              className="min-w-40"
              defaultValue={typeFilter}
              emptyLabel="All types"
              options={[
                { value: "class_performance", label: reportTypeLabels.class_performance },
                { value: "learner_progress", label: reportTypeLabels.learner_progress },
              ]}
            />
            <Select
              name="class"
              label="Class"
              hideLabel
              compact
              className="min-w-40"
              defaultValue={classFilterId}
              emptyLabel="All classes"
              options={classOptions.map((item) => ({ value: item.id, label: item.name }))}
            />
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {filtered ? (
              <Link href="/reports" className="px-2 text-sm font-medium text-[#4F6F52] hover:underline">
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        {(reports ?? []).length === 0 ? (
          <Card className="mt-4 text-center">
            <p className="py-6 text-sm text-[#606861]">
              {filtered ? "No reports match this filter." : "No reports yet. Prepare your first one above."}
            </p>
          </Card>
        ) : (
          <ul className="mt-4 grid gap-3">
            {(reports ?? []).map((report) => {
              const classroom = one(report.class);
              const learnerName = report.learner_name ? String(report.learner_name) : null;
              return (
                <li key={String(report.id)}>
                  <Link href={`/reports/${report.id}`} className="block rounded-2xl transition hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#4F6F52]">
                    <Card className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1E2420]">{reportTypeLabels[report.report_type as keyof typeof reportTypeLabels]}</p>
                        <p className="mt-0.5 truncate text-sm text-[#606861]">
                          {classroom ? String(classroom.name) : "Deleted class"}
                          {learnerName ? ` · ${learnerName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-[#EAF0EA] px-2.5 py-1 font-medium text-[#1A4D2E]">
                          {report.status === "final" ? "Final" : "Draft"}
                        </span>
                        <span className="rounded-full bg-[#E8DFCA]/60 px-2.5 py-1 font-medium text-[#606861]">
                          {report.source === "ai" ? "AI draft" : "Facts only"}
                        </span>
                        <span className="text-[#8B928C]">{fmtDate(String(report.created_at))}</span>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}