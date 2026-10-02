// src/app/(dashboard)/classes/[classId]/records/page.tsx

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RosterImport } from "@/features/learners/roster-import";

export default async function RecordImportPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/classes/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52] hover:underline"
      >
        <ArrowLeft size={16} /> Back to class
      </Link>
      <div>
        <p className="text-sm font-medium text-[#4F6F52]">Import learners</p>
        <h1 className="mt-1 text-3xl font-bold">Bring in the class record you already use</h1>
        <p className="mt-2 text-[#606861]">
          Upload your Excel record or paste a list of names. TeacherCo finds the learners, you check them, then they are added to this class.
        </p>
      </div>
      <RosterImport classId={classId} />
    </div>
  );
}