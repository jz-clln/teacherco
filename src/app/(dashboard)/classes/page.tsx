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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#4F6F52]">CLASSES</p>
          <h1 className="mt-1 text-3xl font-bold">Your Classrooms</h1>
        </div>
        <Link
          href="/classes/new"
          className="tc-button tc-primary shrink-0"
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
        <div className="tc-group tc-rows">
          {classes.map((item) => (
            // The whole row opens the class. The class name link stretches over the row, and the
            // "Term grades" link sits above it so it still goes to its own page.
            // The row keeps its normal look on hover: no tint and no underline.
            <div key={item.id} className="tc-row relative flex-wrap justify-between">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-xs font-semibold tracking-wide text-[#4F6F52] uppercase">{item.grade_level}</p>
                <h2 className="tc-item-title mt-2">
                  <Link
                    href={`/classes/${item.id}`}
                    className="inline-flex min-h-11 items-center wrap-break-word no-underline hover:no-underline! after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[#1A4D2E]"
                  >
                    {item.name}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-[#606861]">
                  {item.subject} · {item.school_year}
                </p>
              </div>
              <div className="relative z-10 flex">
                <Link
                  href={`/classes/${item.id}/term-grades`}
                  className="tc-button tc-quiet"
                >
                  <GraduationCap size={16} className="shrink-0" aria-hidden />
                  Term grades
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
