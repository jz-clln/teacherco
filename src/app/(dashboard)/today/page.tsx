// src/app/(dashboard)/today/page.tsx

import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, Plus, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { formatLongDate, todayInManila } from "@/features/attendance/dates";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const firstName = String(user?.user_metadata?.full_name ?? "Teacher").split(" ")[0];

  const today = todayInManila();
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id,name,subject")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  type LearnerRow = { class_id: string; learner_id: string };
  let enrollments: LearnerRow[] = [];
  let attendanceEntries: LearnerRow[] = [];
  let hasOverviewError = Boolean(classesError);

  if (classes?.length) {
    const classIds = classes.map((classroom) => String(classroom.id));
    const [enrollmentResult, attendanceResult] = await Promise.all([
      supabase
        .from("class_enrollments")
        .select("class_id,learner_id")
        .in("class_id", classIds)
        .eq("status", "active")
        .limit(5000),
      supabase
        .from("attendance_entries")
        .select("class_id,learner_id")
        .in("class_id", classIds)
        .eq("attendance_date", today)
        .limit(5000),
    ]);
    hasOverviewError ||= Boolean(enrollmentResult.error || attendanceResult.error);
    enrollments = (enrollmentResult.data ?? []) as LearnerRow[];
    attendanceEntries = (attendanceResult.data ?? []) as LearnerRow[];
  }

  const groupLearners = (rows: LearnerRow[]) => {
    const grouped = new Map<string, Set<string>>();
    for (const row of rows) {
      const learners = grouped.get(row.class_id) ?? new Set<string>();
      learners.add(row.learner_id);
      grouped.set(row.class_id, learners);
    }
    return grouped;
  };

  const rostersByClass = groupLearners(enrollments);
  const attendanceByClass = groupLearners(attendanceEntries);
  const classroomRows = (classes ?? []).map((classroom) => {
    const id = String(classroom.id);
    const rosterCount = rostersByClass.get(id)?.size ?? 0;
    return {
      id,
      name: String(classroom.name),
      subject: String(classroom.subject),
      rosterCount,
      markedCount: Math.min(attendanceByClass.get(id)?.size ?? 0, rosterCount),
    };
  });
  const setupClasses = classroomRows.filter((classroom) => classroom.rosterCount === 0);
  const attendanceClasses = classroomRows.filter((classroom) => classroom.rosterCount > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full sm:flex-1">
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Good day, {firstName}</h1>
          <p className="mt-2 text-[#606861]">
            {formatLongDate(today)} · {classroomRows.length} active {classroomRows.length === 1 ? "classroom" : "classrooms"}
          </p>
          <p className="mt-2 text-sm font-medium text-[#4F6F52]">TODAY</p>
        </div>
        {classroomRows.length > 0 ? (
          <Link href="/classes" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E3E5E1] bg-white px-4 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F4F7F4]">
            View classrooms <ArrowRight size={16} />
          </Link>
        ) : null}
      </div>

      {hasOverviewError ? (
        <Card>
          <h2 className="font-semibold">Today’s classroom data isn’t available</h2>
          <p className="mt-2 text-sm text-[#606861]">Your classes and attendance couldn’t be loaded. Try refreshing this page.</p>
          <Link href="/today" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white hover:bg-[#123820]">
            Refresh today
          </Link>
        </Card>
      ) : classroomRows.length === 0 ? (
        <Card>
          <div className="flex items-start gap-3">
            <Plus size={20} className="mt-0.5 shrink-0 text-[#4F6F52]" />
            <div>
              <h2 className="font-semibold">Start with a classroom</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#606861]">
                Create a class, then import the class record you already use. Your learners and scores will appear here once they’re added.
              </p>
              <Link href="/classes/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white hover:bg-[#123820]">
                Create a class <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {setupClasses.length > 0 ? (
            <section aria-labelledby="setup-heading" className="rounded-xl border border-[#E0B14C] bg-[#FFF8E6] p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Upload size={20} className="shrink-0 text-[#8A5A00]" />
                  <div className="min-w-0">
                  <h2 id="setup-heading" className="font-semibold">Finish setting up your {setupClasses.length === 1 ? "class" : "classes"}</h2>
                  <p className="mt-1 text-sm leading-6 text-[#606861]">Import a class record to add learners before taking attendance.</p>
                  </div>
                </div>
                <ul className="ml-8 mt-3 divide-y divide-[#E0B14C]/50">
                  {setupClasses.map((classroom) => (
                    <li key={classroom.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{classroom.name}</p>
                        <p className="truncate text-sm text-[#606861]">{classroom.subject} · no learners imported</p>
                      </div>
                      <Link href={`/classes/${classroom.id}/records`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white hover:bg-[#123820]">
                        Import class record <ArrowRight size={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {attendanceClasses.length > 0 ? (
            <section aria-labelledby="attendance-heading">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="attendance-heading" className="flex items-center gap-2 text-lg font-semibold">
                    <CalendarCheck size={19} className="text-[#4F6F52]" /> Attendance today
                  </h2>
                  <p className="mt-1 text-sm text-[#606861]">Progress for classrooms with learners.</p>
                </div>
              </div>
              <ul className="divide-y divide-[#E3E5E1] border-y border-[#E3E5E1]">
                {attendanceClasses.map((classroom) => {
                  const complete = classroom.markedCount >= classroom.rosterCount;
                  const status = classroom.markedCount === 0
                    ? "Not started"
                    : complete
                      ? `All ${classroom.rosterCount} learners marked`
                      : `${classroom.markedCount} of ${classroom.rosterCount} marked`;
                  return (
                    <li key={classroom.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{classroom.name}</p>
                        <p className="truncate text-sm text-[#606861]">{classroom.subject} · {status}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {complete ? <Check size={18} className="text-[#1A4D2E]" aria-label="Attendance recorded" /> : null}
                        <Link
                          href={`/classes/${classroom.id}/attendance`}
                          className="inline-flex min-h-11 items-center rounded-xl border border-[#4F6F52]/40 bg-white px-4 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F4F7F4]"
                        >
                          {classroom.markedCount === 0 ? "Take attendance" : complete ? "Review" : "Continue"}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}