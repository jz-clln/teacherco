// src/app/(dashboard)/classes/page.tsx

import Link from "next/link";
import { GraduationCap, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Classes" };

export default async function ClassesPage() {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id,name,subject,grade_level,school_year,created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      {/* items-center keeps the button in the vertical middle of the title block, even when the title wraps. */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#4F6F52]">CLASSES</p>
          <h1 className="mt-1 text-3xl font-bold">Your Classrooms</h1>
        </div>
        <Link
          href="/classes/new"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 py-2 text-sm font-semibold whitespace-nowrap text-white"
        >
          <Plus size={18} className="shrink-0" />
          New class
        </Link>
      </div>

      {!classes?.length ? (
        <Card>
          <h2 className="font-semibold">No classes yet</h2>
          <p className="mt-2 text-sm text-[#606861]">Create a class, then import the Excel record you already use.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((item) => (
            // A link cannot sit inside another link. The class name's link is stretched over the whole
            // card, and the shortcut below sits on top of it (relative z-10) so it can be tapped on its own.
            <Card key={item.id} className="relative flex h-full flex-col transition hover:-translate-y-0.5 hover:shadow-lg">
              <p className="text-xs font-semibold tracking-wide text-[#4F6F52] uppercase">{item.grade_level}</p>
              <h2 className="mt-2 text-xl font-bold">
                <Link
                  href={`/classes/${item.id}`}
                  className="after:absolute after:inset-0 after:rounded-[1.25rem] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[#1A4D2E]"
                >
                  {item.name}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-[#606861]">
                {item.subject} · {item.school_year}
              </p>

              <div className="relative z-10 mt-auto flex pt-4">
                <Link
                  href={`/classes/${item.id}/term-grades`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-2 text-sm font-semibold text-[#1A4D2E] transition-colors hover:bg-[#EAF0EA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]"
                >
                  <GraduationCap size={16} className="shrink-0" aria-hidden />
                  Term grades
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}