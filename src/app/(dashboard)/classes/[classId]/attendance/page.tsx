// src/app/(dashboard)/classes/[classId]/attendance/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { AttendanceSheet } from "@/features/attendance/attendance-sheet";
import { isDateKey, todayInManila } from "@/features/attendance/dates";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/features/attendance/types";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { classId } = await params;
  if (!z.string().uuid().safeParse(classId).success) notFound();

  // The page opens on today. Any earlier day can be opened too, no matter how long ago.
  const { date: requested } = await searchParams;
  const today = todayInManila();
  const date = requested && isDateKey(requested) ? requested : today;
  if (date > today) redirect(`/classes/${classId}/attendance`);

  const supabase = await createClient();
  const { data: classroom } = await supabase
    .from("classes")
    .select("id,name,subject,grade_level")
    .eq("id", classId)
    .maybeSingle();
  if (!classroom) notFound();

  const [{ data: enrollments }, { data: entries }] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("learner:learners(id,display_name)")
      .eq("class_id", classId)
      .eq("status", "active")
      .limit(500),
    supabase
      .from("attendance_entries")
      .select("learner_id,status,updated_at")
      .eq("class_id", classId)
      .eq("attendance_date", date)
      .limit(1000),
  ]);

  const learners = (enrollments ?? [])
    .flatMap((e) => {
      const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
      return l ? [{ id: String(l.id), name: String(l.display_name) }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const initial: Record<string, AttendanceStatus> = {};
  let updatedAt: string | null = null;
  for (const entry of entries ?? []) {
    const status = String(entry.status) as AttendanceStatus;
    if ((ATTENDANCE_STATUSES as readonly string[]).includes(status)) initial[String(entry.learner_id)] = status;

    // The newest save time among this day's rows is the "last updated".
    if (entry.updated_at) {
      const stamp = String(entry.updated_at);
      if (updatedAt === null || Date.parse(stamp) > Date.parse(updatedAt)) updatedAt = stamp;
    }
  }
  const taken = learners.some((l) => initial[l.id] !== undefined);

  return (
    <div className="min-w-0 w-full space-y-5">
      <Link
        href={`/classes/${classId}`}
        className="tc-button tc-quiet inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52]"
      >
        <ArrowLeft size={16} /> Back to class
      </Link>

      <div>
        <p className="text-sm font-semibold text-[#4F6F52]">ATTENDANCE</p>
        <h1 className="mt-1 text-3xl font-bold">{classroom.name}</h1>
        <p className="mt-1 text-[#606861]">
          {classroom.subject} · {classroom.grade_level}
        </p>
      </div>

      {learners.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No students in this class yet</h2>
          <p className="mt-2 text-sm text-[#606861]">Add students or import your record, then come back to take attendance.</p>
          <Link href={`/classes/${classId}`} className="tc-button tc-quiet mt-3 inline-block text-sm font-semibold text-[#1A4D2E]">
            Go to the class page
          </Link>
        </Card>
      ) : (
        <AttendanceSheet
          key={date}
          classId={classId}
          date={date}
          today={today}
          learners={learners}
          initial={initial}
          taken={taken}
          updatedAt={updatedAt}
        />
      )}
    </div>
  );
}