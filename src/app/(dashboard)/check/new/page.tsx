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
        <Link href="/check" className="text-sm font-medium text-[#4F6F52] hover:underline">← All assessments</Link>
        <h1 className="mt-2 text-3xl font-bold">New assessment</h1>
        <p className="mt-2 max-w-xl text-[#606861]">
          Set the answer key once. TeacherCo compares each learner’s answers against it, so every score comes from your key, not from AI.
        </p>
      </div>
      <NewAssessmentForm classes={classes} initialClassId={classId} />
    </div>
  );
}
