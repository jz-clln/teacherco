// src/app/(dashboard)/today/page.tsx

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatLongDate, todayInManila } from "@/features/attendance/dates";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const firstName = String(user?.user_metadata?.full_name ?? "Teacher").split(" ")[0];

  const today = todayInManila();
  const [{ data: classes }, { data: entries }] = await Promise.all([
    supabase.from("classes").select("id,name,subject").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("attendance_entries").select("class_id").eq("attendance_date", today).limit(1000),
  ]);
  const takenToday = new Set((entries ?? []).map((e) => String(e.class_id)));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[#4F6F52]">TODAY</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Good day, {firstName} 👋</h1>
        <p className="mt-2 text-[#606861]">
          {formatLongDate(today)}. Once your first class is imported, important classroom changes will appear here.
        </p>
      </div>

      {(classes ?? []).length > 0 ? (
        <Card>
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarCheck size={18} className="text-[#4F6F52]" /> Attendance today
          </h2>
          <ul className="mt-3 divide-y divide-[#E3E5E1]">
            {(classes ?? []).map((c) => {
              const done = takenToday.has(String(c.id));
              return (
                <li key={String(c.id)} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{String(c.name)}</p>
                    <p className="truncate text-sm text-[#606861]">{String(c.subject)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${done ? "bg-[#EAF0EA] text-[#1A4D2E]" : "bg-amber-100 text-amber-800"}`}
                    >
                      {done ? "Taken" : "Not yet"}
                    </span>
                    <Link
                      href={`/classes/${c.id}/attendance`}
                      className="inline-flex min-h-11 items-center rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white hover:bg-[#123820]"
                    >
                      {done ? "Review" : "Take attendance"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-[#606861]">Needs attention</p>
          <p className="mt-3 text-3xl font-bold text-[#1A4D2E]">—</p>
          <p className="mt-2 text-sm text-[#8B928C]">No class data yet</p>
        </Card>
        <Card>
          <p className="text-sm text-[#606861]">Recent change</p>
          <p className="mt-3 text-lg font-semibold">Import a class record</p>
          <p className="mt-2 text-sm text-[#8B928C]">TeacherCo will compare future versions.</p>
        </Card>
        <Card className="bg-[#E8DFCA]/55">
          <p className="text-sm text-[#606861]">Next step</p>
          <p className="mt-3 text-lg font-semibold">Create your first class</p>
          <p className="mt-2 text-sm text-[#606861]">Then import the Excel record you already use.</p>
        </Card>
      </div>
    </div>
  );
}