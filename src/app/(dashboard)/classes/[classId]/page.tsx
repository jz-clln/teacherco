// src/app/(dashboard)/classes/[classId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Upload, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { addLearner } from "@/features/learners/actions";
import { DeleteStudentButton } from "@/features/learners/delete-student-button";
import { EditClassDetails } from "@/features/classes/edit-class-details";
import { toClassDetails } from "@/features/classes/details";
import { getClassStats } from "@/features/classes/stats";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]";

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

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

  const { data: classroom } = await supabase
    .from("classes")
    .select("id,name,subject,grade_level,school_year,benchmark,school_name,school_id,adviser,section")
    .eq("id", classId)
    .single();
  if (!classroom) notFound();

  const [{ count }, { data: enrollments }] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("status", "active"),
    supabase
      .from("class_enrollments")
      .select("created_at, learner:learners(id,display_name)")
      .eq("class_id", classId)
      .eq("status", "active")
      .limit(500),
  ]);

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
  const stats = await getClassStats(
    supabase,
    classId,
    learners.map((l) => l.id),
    benchmark,
  );
  const details_ = toClassDetails(classroom);

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
        <div className="flex flex-wrap gap-2">
          <EditClassDetails classId={classId} initial={details_} />
          <Link
            href={`/classes/${classId}/export`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E3E5E1] bg-white px-4 py-2 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F5F6F4]"
          >
            <Download size={18} /> Export record
          </Link>
          <Link
            href={`/classes/${classId}/records`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 py-2 text-sm font-semibold text-white"
          >
            <Upload size={18} /> Import record
          </Link>
        </div>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <p className="text-sm text-[#606861]">Learners</p>
          <p className="mt-2 text-3xl font-bold text-[#1A4D2E]">{total}</p>
        </Card>
        <Card>
          <p className="text-sm text-[#606861]">Class average</p>
          <p className="mt-2 text-3xl font-bold">{stats.average == null ? "—" : pct(stats.average)}</p>
          <p className="mt-1 text-xs text-[#606861]">
            {stats.average == null ? "Import grades to see this" : `${stats.scored} learners · ${stats.assessments} score columns`}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[#606861]">Below {benchmark}%</p>
          <p className={`mt-2 text-3xl font-bold ${stats.below > 0 ? "text-red-700" : ""}`}>
            {stats.average == null ? "—" : stats.below}
          </p>
          <p className="mt-1 text-xs text-[#606861]">
            {stats.average == null ? "Import grades to see this" : stats.below === 1 ? "learner" : "learners"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[#606861]">Attendance</p>
          <p className="mt-2 text-3xl font-bold">{stats.attendance == null ? "—" : pct(stats.attendance)}</p>
          {stats.attendance == null ? <p className="mt-1 text-xs text-[#606861]">No attendance recorded yet</p> : null}
        </Card>
        <Card className="bg-[#E8DFCA]/55">
          <p className="text-sm text-[#606861]">Lowest scoring activity</p>
          {stats.lowest ? (
            <>
              <p className="mt-2 text-lg font-bold">{stats.lowest.title}</p>
              <p className="mt-1 text-xs text-[#606861]">{pct(stats.lowest.average)} class average</p>
            </>
          ) : (
            <p className="mt-2 text-lg font-bold">Import data first</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Roster */}
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#E3E5E1] px-5 py-4">
            <h2 className="text-lg font-semibold">Students</h2>
            <span className="text-sm text-[#606861]">
              {learners.length < total ? `Showing ${learners.length} of ${total}` : `${total} total`}
            </span>
          </div>

          {removed ? (
            <p className="border-b border-[#E3E5E1] bg-green-50 px-5 py-3 text-sm text-green-800">
              {removed} was deleted.
            </p>
          ) : null}

          {learners.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[#606861]">
              No students yet. Add one using the form, or import your record.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#F5F6F4] text-xs uppercase tracking-wide text-[#606861]">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">#</th>
                    <th className="px-5 py-2.5 font-medium">Name</th>
                    <th className="px-5 py-2.5 font-medium">Added</th>
                    <th className="px-5 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
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

        {/* Add student */}
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserPlus size={18} className="text-[#4F6F52]" /> Add a student
          </h2>
          <form action={addLearner} className="mt-4 space-y-4">
            <input type="hidden" name="classId" value={classId} />
            {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            {added ? (
              <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{added} was added to this class.</p>
            ) : null}
            <label className="block text-sm font-medium">
              First name
              <input name="firstName" required autoComplete="off" className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              Last name
              <input name="lastName" required autoComplete="off" className={inputClass} />
            </label>
            <Button type="submit">Add student</Button>
          </form>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Needs attention</h2>
          <p className="mt-2 text-sm text-[#606861]">Transparent teacher rules and evidence-backed flags will appear here.</p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Recent changes</h2>
          <p className="mt-2 text-sm text-[#606861]">TeacherCo will compare record versions after your second import.</p>
        </Card>
      </div>
    </div>
  );
}