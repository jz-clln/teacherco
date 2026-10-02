//src\app\(dashboard)\check\[assessmentId]\key\page.tsx - carlo

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EditKeyForm } from "@/features/exams/components/edit-key-form";
import { getAssessmentBundle } from "@/features/exams/queries";

export const metadata = { title: "Answer key" };

export default async function KeyPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const bundle = await getAssessmentBundle(assessmentId);
  if (!bundle) notFound();
  const { assessment, items, submissions, competencyNames } = bundle;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/check/${assessment.id}`} className="text-sm font-medium text-[#4F6F52] hover:underline">
          ← {assessment.title}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Answer key</h1>
        <p className="mt-1 text-[#606861]">{assessment.className}</p>
      </div>
      <Card>
        <EditKeyForm
          assessmentId={assessment.id}
          title={assessment.title}
          status={assessment.status}
          format={assessment.format}
          choices={assessment.choices}
          pointsPerItem={assessment.pointsPerItem}
          checkedCount={submissions.length}
          competencySuggestions={competencyNames}
          initialItems={items.map((i) => ({
            itemNumber: i.itemNumber,
            answer: i.expected,
            competency: i.competencies[0] ?? null,
            points: i.points,
          }))}
        />
      </Card>
    </div>
  );
}