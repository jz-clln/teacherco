// src/app/(dashboard)/classes/[classId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, Download, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { AddStudentDialog } from "@/features/learners/add-student-dialog";
import { DeleteStudentButton } from "@/features/learners/delete-student-button";
import { EditClassDetails } from "@/features/classes/edit-class-details";
import { toClassDetails } from "@/features/classes/details";
import { getClassStats } from "@/features/classes/stats";
import {
  ATTENTION_RULES,
  buildInsights,
  readRecentAttendance,
  type AttentionItem,
} from "@/features/classes/insights";

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** How many flagged learners show before the rest fold into "Show more". */
const SHOWN_FLAGS = 5;

const DOT: Record<"good" | "warn" | "neutral", string> = {
  good: "bg-[#4F6F52]",
  warn: "bg-amber-500",
  neutral: "bg-[#8B928C]",
};

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li className="py-3">
      <p className="font-medium">{item.name}</p>
      <ul className="mt-1 space-y-0.5">
        {item.reasons.map((reason) => (
          <li key={reason} className="text-sm text-[#606861]">
            {reason}
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function ClassOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{
    error?: string;
    added?: string;
    removed?: string;
    imported?: string;
    skipped?: string;
    grades?: string;
    details?: string;
  }>;
}) {
  const { classId } = await params;
  const { error, added, removed, imported, skipped, grades, details } = await searchParams;
  const importedCount = Number(imported ?? 0);
  const skippedCount = Number(skipped ?? 0);
  const gradeCount = Number(grades ?? 0);
  const supabase = await createClient();

  const [{ data: classroom }, { count, data: enrollments }] = await Promise.all([
    supabase
      .from("classes")
      .select("id,name,subject,grade_level,school_year,benchmark,school_name,school_id,adviser,section")
      .eq("id", classId)
      .single(),
    supabase
      .from("class_enrollments")
      .select("created_at, learner:learners(id,display_name)", { count: "exact" })
      .eq("class_id", classId)
      .eq("status", "active")
      .limit(500),
  ]);
  if (!classroom) notFound();

  const learners = (enrollments ?? [])
    .flatMap((e) => {
      const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
      return l
        ? [
            {
              id: l.id as string,
              name: l.display_name as string,
              addedAt: e.created_at as string,
            },
          ]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const total = count ?? 0;
  const benchmark = Number(classroom.benchmark);

  // Scores and recent attendance load together; the flags and changes are worked out from both.
  const [stats, recentAttendance] = await Promise.all([
    getClassStats(
      supabase,
      classId,
      learners.map((l) => l.id),
      benchmark,
    ),
    readRecentAttendance(supabase, classId),
  ]);
  const insights = buildInsights({
    learners,
    learnerPercents: stats.learnerPercents,
    benchmark,
    attendance: recentAttendance,
  });
  const hasData = stats.average != null || insights.attendanceDays > 0;
  const flagsShown = insights.attention.slice(0, SHOWN_FLAGS);
  const flagsHidden = insights.attention.slice(SHOWN_FLAGS);

  const details_ = toClassDetails(classroom);

  const linkBase =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-sm font-semibold leading-tight sm:px-4";
  const linkLight = `${linkBase} border border-[#E3E5E1] bg-white text-[#1A4D2E] hover:bg-[#F5F6F4]`;

  return (
    <div className="space-y-6">
      <Link href="/classes" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52] hover:underline">
        <ArrowLeft size={16} /> All classes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#4F6F52]">
            {classroom.grade_level}
            {classroom.section ? ` · ${classroom.section}` : ""} · {classroom.school_year}
          </p>
          <h1 className="mt-1 text-3xl font-bold">{classroom.name}</h1>
          <p className="mt-1 text-[#606861]">{classroom.subject}</p>
          {classroom.school_name || classroom.adviser ? (
            <p className="mt-1 text-sm text-[#606861]">
              {[classroom.school_name, classroom.adviser ? `Adviser: ${classroom.adviser}` : ""].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>

        {/* Phones: two buttons per row.  Edit | Attendance  /  Import | Export  /  Add a student (full width) */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <div className="[&>button]:h-full [&>button]:w-full [&>button]:justify-center sm:[&>button]:w-auto">
            <EditClassDetails classId={classId} initial={details_} />
          </div>
          <Link href={`/classes/${classId}/attendance`} className={linkLight}>
            <CalendarCheck size={18} className="shrink-0" /> Take attendance
          </Link>
          <Link href={`/classes/${classId}/records`} className={`${linkBase} bg-[#1A4D2E] text-white hover:bg-[#123820]`}>
            <Upload size={18} className="shrink-0" /> Import record
          </Link>
          <Link href={`/classes/${classId}/export`} className={linkLight}>
            <Download size={18} className="shrink-0" /> Export record
          </Link>
          {/* New key after each result so the popup closes on success and reopens with the error. */}
          <div className="col-span-2 [&>button]:min-h-11 [&>button]:w-full [&>button]:justify-center sm:col-span-1 sm:[&>button]:w-auto">
            <AddStudentDialog key={`${added ?? ""}|${error ?? ""}`} classId={classId} error={error} />
          </div>
        </div>
      </div>

      {added ? <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{added} was added to this class.</p> : null}

      {imported !== undefined ? (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
          {importedCount === 0
            ? "No new students were added."
            : `${importedCount} ${importedCount === 1 ? "student was" : "students were"} imported.`}
          {skippedCount > 0 ? ` ${skippedCount} already in this class ${skippedCount === 1 ? "was" : "were"} skipped.` : ""}
          {gradeCount > 0 ? ` ${gradeCount} ${gradeCount === 1 ? "score was" : "scores were"} saved from your record.` : ""}
          {details === "1" ? " Class details were updated from your file." : ""}
        </p>
      ) : null}

      {/*
        Phones: Learners | Class average | Attendance on one row, then Below | Lowest scoring activity.
        Larger screens keep the original order and layout.
      */}
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
        <Card className="col-span-2 p-3 sm:col-span-1 sm:p-5">
          <p className="text-xs text-[#606861] sm:text-sm">Learners</p>
          <p className="mt-1 text-2xl font-bold text-[#1A4D2E] tabular-nums sm:mt-2 sm:text-3xl">{total}</p>
        </Card>
        <Card className="col-span-2 p-3 sm:col-span-1 sm:p-5">
          <p className="text-xs text-[#606861] sm:text-sm">Class average</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">{stats.average == null ? "—" : pct(stats.average)}</p>
          <p className="mt-1 hidden text-xs text-[#606861] sm:block">
            {stats.average == null ? "Import grades to see this" : `${stats.scored} learners · ${stats.assessments} score columns`}
          </p>
        </Card>
        <Card className="order-1 col-span-3 p-3 sm:order-none sm:col-span-1 sm:p-5">
          <p className="text-xs text-[#606861] sm:text-sm">Below {benchmark}%</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl ${stats.below > 0 ? "text-red-700" : ""}`}>
            {stats.average == null ? "—" : stats.below}
          </p>
          <p className="mt-1 text-xs text-[#606861]">
            {stats.average == null ? "Import grades to see this" : stats.below === 1 ? "learner" : "learners"}
          </p>
        </Card>
        <Card className="col-span-2 p-3 sm:col-span-1 sm:p-5">
          <p className="text-xs text-[#606861] sm:text-sm">Attendance</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">{stats.attendance == null ? "—" : pct(stats.attendance)}</p>
          <p className="mt-1 hidden text-xs text-[#606861] sm:block">
            {stats.attendance == null ? "No attendance recorded yet" : "Present or late, all recorded days"}
          </p>
          {/* "Take attendance" is already a button at the top of the page on phones. */}
          <Link
            href={`/classes/${classId}/attendance`}
            className="mt-2 hidden text-xs font-semibold text-[#1A4D2E] hover:underline sm:inline-block"
          >
            Take attendance
          </Link>
        </Card>
        <Card className="order-2 col-span-3 bg-[#E8DFCA]/55 p-3 sm:order-none sm:col-span-1 sm:p-5">
          <p className="text-xs text-[#606861] sm:text-sm">Lowest scoring activity</p>
          {stats.lowest ? (
            <>
              <p className="mt-1 text-base font-bold break-words sm:mt-2 sm:text-lg">{stats.lowest.title}</p>
              <p className="mt-1 text-xs text-[#606861]">{pct(stats.lowest.average)} class average</p>
            </>
          ) : (
            <p className="mt-1 text-base font-bold sm:mt-2 sm:text-lg">Import data first</p>
          )}
        </Card>
      </div>

      {/* Needs attention + Recent changes, above the student list */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Needs attention</h2>
            {insights.attention.length > 0 ? (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {insights.attention.length} {insights.attention.length === 1 ? "learner" : "learners"}
              </span>
            ) : null}
          </div>

          {insights.attention.length === 0 ? (
            <p className="mt-2 text-sm text-[#606861]">
              {hasData
                ? "No learner needs attention right now."
                : "Import scores or take attendance, and learners who need a closer look will show here."}
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-[#E3E5E1]">
                {flagsShown.map((item) => (
                  <AttentionRow key={item.learnerId} item={item} />
                ))}
              </ul>
              {flagsHidden.length > 0 ? (
                <details className="group mt-1 border-t border-[#E3E5E1]">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-[#1A4D2E] hover:underline">
                    <span className="group-open:hidden">Show {flagsHidden.length} more</span>
                    <span className="hidden group-open:inline">Show fewer</span>
                  </summary>
                  <ul className="divide-y divide-[#E3E5E1]">
                    {flagsHidden.map((item) => (
                      <AttentionRow key={item.learnerId} item={item} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}

          <p className="mt-3 border-t border-[#E3E5E1] pt-3 text-xs text-[#606861]">
            A learner shows here when their score average is under {benchmark}%, they were absent {ATTENTION_RULES.streak} recorded
            days in a row, or they were here less than {ATTENTION_RULES.lowAttendance}% of the last {ATTENTION_RULES.recentDays}{" "}
            recorded days.
          </p>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Recent changes</h2>
          {insights.changes.length === 0 ? (
            <p className="mt-2 text-sm text-[#606861]">Changes will show here after you take attendance or add students.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {insights.changes.map((change) => (
                <li key={change.id} className="flex gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[change.tone]}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{change.title}</p>
                    {change.details.map((line) => (
                      <p key={line} className="text-xs text-[#606861]">
                        {line}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Roster */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[#E3E5E1] px-5 py-4">
          <h2 className="text-lg font-semibold">Students</h2>
          <span className="text-sm text-[#606861]">
            {learners.length < total ? `Showing ${learners.length} of ${total}` : `${total} total`}
          </span>
        </div>

        {removed ? (
          <p className="border-b border-[#E3E5E1] bg-green-50 px-5 py-3 text-sm text-green-800">{removed} was deleted.</p>
        ) : null}

        {learners.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#606861]">
            No students yet. Use &quot;Add a student&quot; above, or import your record.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F5F6F4] text-xs uppercase tracking-wide text-[#606861]">
                <tr>
                  <th className="px-5 py-2.5 font-medium">#</th>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Added</th>
                  <th className="px-5 py-2.5 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E5E1]">
                {learners.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 text-[#606861]">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{l.name}</td>
                    <td className="px-5 py-3 text-[#606861]">
                      {new Date(l.addedAt).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-1 text-right">
                      <DeleteStudentButton classId={classId} learnerId={l.id} name={l.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}