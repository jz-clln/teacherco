import { ClassTabs } from "@/features/classes/class-tabs";
// src/app/(dashboard)/classes/[classId]/records/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { toClassDetails } from "@/features/classes/details";
import { RosterImport } from "@/features/learners/roster-import";

export default async function RecordImportPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  const supabase = await createClient();
  const { data: classroom } = await supabase
    .from("classes")
    .select("id,name,subject,grade_level,school_year,benchmark,school_name,school_id,adviser,section")
    .eq("id", classId)
    .single();
  if (!classroom) notFound();

  return (
    <div className="min-w-0 w-full space-y-6">
      <Link
        href={`/classes/${classId}`}
        className="tc-button tc-quiet inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52]"
      >
        <ArrowLeft size={16} /> Back to class
      </Link>
      <div>
        <p className="text-sm font-medium text-[#4F6F52]">Import learners</p>
        <h1 className="mt-1 text-3xl font-bold">Bring in the class record you already use</h1>
        <p className="mt-2 text-[#606861]">
          Upload your Excel record or paste a list of names. TeacherCo finds the learners, grades and class details, you check them, then
          they are added to this class.
        </p>
      </div>
      <Link href={`/classes/${classId}/records/sync`} className="block rounded-2xl border border-[#D5E0D5] bg-[#EAF0EA] p-5 text-[#1A4D2E] hover:bg-[#D5E0D5]">
        <span className="font-semibold">Updating an existing class record?</span>
        <span className="mt-1 block text-sm">Review new scores, corrected grades, learners and attendance before applying.</span>
      </Link>
      <ClassTabs classId={classId} />
      <RosterImport classId={classId} currentClass={toClassDetails(classroom)} />
    </div>
  );
}
