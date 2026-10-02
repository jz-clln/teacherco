// src/app/(dashboard)/classes/[classId]/export/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ExportRecord } from "@/features/export/export-record";

export const metadata = { title: "Export record" };

export default async function ExportRecordPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  const supabase = await createClient();
  const { data: classroom } = await supabase.from("classes").select("id,name,subject").eq("id", classId).single();
  if (!classroom) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/classes/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52] hover:underline"
      >
        <ArrowLeft size={16} /> Back to class
      </Link>
      <div>
        <p className="text-sm font-medium text-[#4F6F52]">Export record</p>
        <h1 className="mt-1 text-3xl font-bold">Put your scores back into your own Excel record</h1>
        <p className="mt-2 text-[#606861]">
          {classroom.name} · {classroom.subject}. No retyping: TeacherCo fills in the scores it has, and your E-Class Record does the rest.
        </p>
      </div>
      <ExportRecord classId={classId} />
    </div>
  );
}