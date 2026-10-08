//src\app\(dashboard)\check\new\page.tsx

import Link from "next/link";
import { NewAssessmentForm } from "@/features/exams/components/new-assessment-form";
import { getClassOptions } from "@/features/exams/queries";

export const metadata = { title: "New assessment" };

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { classId } = await searchParams;
  const classes = await getClassOptions();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/check" className="tc-button tc-quiet text-sm font-medium text-[#4F6F52]">← All assessments</Link>
        <h1 className="mt-2 text-3xl font-bold">New assessment</h1>
        <p className="mt-2 max-w-xl text-[#606861]">Scores come from your answer key, not from AI.</p>
      </div>
      <NewAssessmentForm classes={classes} initialClassId={classId} />
    </div>
  );
}