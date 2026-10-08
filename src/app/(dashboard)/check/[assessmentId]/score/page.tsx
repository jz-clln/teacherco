//src\app\(dashboard)\check\[assessmentId]\score\page.tsx - carlo

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckWorkspace } from "@/features/exams/components/check-workspace";
import { getAssessmentBundle } from "@/features/exams/queries";

export const metadata = { title: "Check answer sheets" };

export default async function ScorePage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<{ learner?: string }>;
}) {
  const { assessmentId } = await params;
  const { learner } = await searchParams;
  const bundle = await getAssessmentBundle(assessmentId);
  if (!bundle) notFound();

  const { assessment, items, roster } = bundle;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/check/${assessment.id}`} className="tc-button tc-quiet text-sm font-medium text-[#4F6F52]">
          ← {assessment.title}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Check answer sheets</h1>
        <p className="mt-1 text-[#606861]">{assessment.className}</p>
      </div>
      <CheckWorkspace
        assessment={{ id: assessment.id, title: assessment.title, format: assessment.format, choices: assessment.choices }}
        items={items.map((i) => ({ id: i.id, itemNumber: i.itemNumber, expected: i.expected, points: i.points }))}
        roster={roster}
        initialLearnerId={roster.some((r) => r.learnerId === learner) ? learner : undefined}
      />
    </div>
  );
}