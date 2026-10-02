// src/app/(dashboard)/check/page.tsx

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CheckFolders } from "@/features/exams/components/check-folders";
import { getCheckFolders } from "@/features/exams/queries";
import { btnPrimary } from "@/features/exams/ui";

export const metadata = { title: "Check" };

export default async function CheckPage() {
  const folders = await getCheckFolders();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#4F6F52]">Check</p>
          <h1 className="mt-1 text-3xl font-bold">Assessment checking</h1>
          <p className="mt-2 max-w-xl text-[#606861]">Photograph answer sheets. Scores land on each learner’s record.</p>
        </div>
        <Link href="/check/new" className={btnPrimary}>New assessment</Link>
      </div>

      {folders.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No classes yet</h2>
          <p className="mt-2 text-sm text-[#606861]">Create a class first, then add an assessment.</p>
          <Link href="/classes/new" className={`${btnPrimary} mt-4`}>Create a class</Link>
        </Card>
      ) : (
        <CheckFolders folders={folders} />
      )}
    </div>
  );
}