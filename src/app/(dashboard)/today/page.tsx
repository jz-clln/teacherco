// src/app/(dashboard)/today/page.tsx

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, ChevronRight, ClipboardList, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { formatLongDate, todayInManila } from "@/features/attendance/dates";

export const metadata = { title: "Today" };

/** "Good morning / afternoon / evening" by the hour in Manila. */
function greetingForManila(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const primaryButton =
  "tc-button tc-primary";
const outlineButton =
  "tc-button tc-secondary";

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

  // Numbers for the summary cards, from the same data as above.
  const totalLearners = classroomRows.reduce((sum, classroom) => sum + classroom.rosterCount, 0);
  const learnersToMark = attendanceClasses.reduce((sum, classroom) => sum + classroom.rosterCount, 0);
  const learnersMarked = attendanceClasses.reduce((sum, classroom) => sum + classroom.markedCount, 0);
  const classesDone = attendanceClasses.filter((classroom) => classroom.markedCount >= classroom.rosterCount).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-[#4F6F52]">TODAY</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {greetingForManila()}, {firstName}
          </h1>
          {/* Phones: the date, then the classroom count on its own line. Larger screens keep one line. */}
          <p className="mt-2 text-[#606861]">
            <span className="block sm:inline">{formatLongDate(today)}</span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">
              {classroomRows.length} active {classroomRows.length === 1 ? "classroom" : "classrooms"}
            </span>
          </p>
        </div>
        {classroomRows.length > 0 ? (
          <Link href="/classes" className={outlineButton}>
            View classrooms <ArrowRight size={16} />
          </Link>
        ) : null}
      </header>

      {hasOverviewError ? (
        <Card>
          <h2 className="font-semibold">Today’s classroom data isn’t available</h2>
          <p className="mt-2 text-sm text-[#606861]">Your classes and attendance couldn’t be loaded. Try refreshing this page.</p>
          <Link href="/today" className={`${primaryButton} mt-4`}>
            Refresh today
          </Link>
        </Card>
      ) : classroomRows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-4 text-center">
            <Image
              src="/brand/teacherco-mascot.png"
              alt=""
              width={72}
              height={72}
              style={{ width: 72, height: 72 }}
              className="rounded-full bg-[#E8DFCA] object-cover"
            />
            <h2 className="mt-4 text-lg font-semibold">Start with a classroom</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#606861]">
              Create a class, then import the class record you already use. Your learners and scores will appear here once
              they’re added.
            </p>
            <Link href="/classes/new" className={`${primaryButton} mt-5`}>
              Create a class <ArrowRight size={16} />
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* One surface groups today's three summary values. */}
          <div className="tc-group grid divide-y divide-[#E3E5E1] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-5">
              <p className="text-xs text-[#606861] sm:text-sm">Classrooms</p>
              <p className="mt-1 tc-value tc-value text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">{classroomRows.length}</p>
              <p className="mt-1 text-xs text-[#606861]">active this school year</p>
            </div>
            <div className="p-5">
              <p className="text-xs text-[#606861] sm:text-sm">Learners</p>
              <p className="mt-1 tc-value text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">{totalLearners}</p>
              <p className="mt-1 text-xs text-[#606861]">across all classrooms</p>
            </div>
            <div className="p-5">
              <p className="text-xs text-[#606861] sm:text-sm">Attendance today</p>
              <p className="mt-1 tc-value text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">
                {learnersToMark > 0 ? `${learnersMarked}/${learnersToMark}` : "—"}
              </p>
              <p className="mt-1 text-xs text-[#606861]">
                {learnersToMark > 0
                  ? `${classesDone} of ${attendanceClasses.length} ${attendanceClasses.length === 1 ? "classroom" : "classrooms"} done`
                  : "Import learners to start"}
              </p>
            </div>
          </div>

          {setupClasses.length > 0 ? (
            <section aria-labelledby="setup-heading" className="rounded-2xl border border-[#E0B14C] bg-[#FFF8E6] p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F6E3B0] text-[#8A5A00]">
                  <Upload size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="setup-heading" className="font-semibold">
                    Finish setting up your {setupClasses.length === 1 ? "class" : "classes"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#606861]">
                    Import a class record to add learners before taking attendance.
                  </p>
                </div>
              </div>
              <ul className="tc-rows mt-4">
                {setupClasses.map((classroom) => (
                  <li
                    key={classroom.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{classroom.name}</p>
                      <p className="truncate text-sm text-[#606861]">{classroom.subject} · no learners imported</p>
                    </div>
                    <Link href={`/classes/${classroom.id}/records`} className={primaryButton}>
                      Import class record <ArrowRight size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {attendanceClasses.length > 0 ? (
            <section aria-labelledby="attendance-heading" className="overflow-hidden rounded-2xl border border-[#E3E5E1] bg-white">
              <div className="border-b border-[#E3E5E1] px-5 py-4">
                <h2 id="attendance-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <CalendarCheck size={19} className="text-[#4F6F52]" aria-hidden="true" /> Attendance today
                </h2>
                <p className="mt-1 text-sm text-[#606861]">Progress for classrooms with learners.</p>
              </div>
              <ul className="divide-y divide-[#E3E5E1]">
                {attendanceClasses.map((classroom) => {
                  const complete = classroom.markedCount >= classroom.rosterCount;
                  const started = classroom.markedCount > 0;
                  const status = !started
                    ? "Not started"
                    : complete
                      ? `All ${classroom.rosterCount} learners marked`
                      : `${classroom.markedCount} of ${classroom.rosterCount} marked`;
                  const percent = Math.round((classroom.markedCount / classroom.rosterCount) * 100);
                  return (
                    <li key={classroom.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate font-medium">{classroom.name}</p>
                        <p className="truncate text-sm text-[#606861]">{classroom.subject}</p>
                        <div className="mt-2.5 flex items-center gap-3">
                          <div
                            role="progressbar"
                            aria-label={`${classroom.name} attendance progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={percent}
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E8DFCA]"
                          >
                            <div className="h-full rounded-full bg-[#1A4D2E]" style={{ width: `${percent}%` }} />
                          </div>
                          <p className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#606861]">
                            {complete ? <Check size={14} className="text-[#1A4D2E]" aria-hidden="true" /> : null}
                            {status}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/classes/${classroom.id}/attendance`}
                        className={complete ? outlineButton : primaryButton}
                      >
                        {!started ? "Take attendance" : complete ? "Review" : "Continue"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {attendanceClasses.length > 0 ? (
            <section aria-labelledby="scores-heading" className="rounded-2xl border border-[#E3E5E1] bg-white p-5">
              <h2 id="scores-heading" className="flex items-center gap-2 text-lg font-semibold">
                <ClipboardList size={19} className="text-[#4F6F52]" aria-hidden="true" /> Record scores
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#606861]">
                For activities with no answer sheet or Excel column, like oral recitations. Pick a classroom and type the scores.
              </p>
              <ul className="tc-rows mt-4">
                {attendanceClasses.map((classroom) => (
                  <li key={classroom.id}>
                    <Link
                      href={`/classes/${classroom.id}/scores`}
                      className="tc-row justify-between px-0 font-medium"
                    >
                      <span className="break-words">
                        {classroom.name} — {classroom.subject}
                      </span>
                      <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
