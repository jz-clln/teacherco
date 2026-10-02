// src/app/(dashboard)/check/page.tsx

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getAssessmentsOverview } from "@/features/exams/queries";
import { btnPrimary } from "@/features/exams/ui";

export const metadata = { title: "Check" };

export default async function CheckPage() {
  const assessments = await getAssessmentsOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#4F6F52]">Check</p>
          <h1 className="mt-1 text-3xl font-bold">Assessment checking</h1>
          <p className="mt-2 max-w-xl text-[#606861]">
            Photograph answer sheets, review anything uncertain, and scores land on each learner’s record.
          </p>
        </div>
        <Link href="/check/new" className={btnPrimary}>New assessment</Link>
      </div>

      {assessments.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No assessments yet</h2>
          <p className="mt-2 text-sm text-[#606861]">
            Create one with its answer key. You can say the key out loud instead of typing it.
          </p>
          <Link href="/check/new" className={`${btnPrimary} mt-4`}>Create your first assessment</Link>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {assessments.map((a) => {
            const progress = a.roster ? Math.min(100, (a.checked / a.roster) * 100) : 0;
            return (
              <li key={a.id}>
                <Link
                  href={a.checked < a.roster ? `/check/${a.id}/score` : `/check/${a.id}`}
                  className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]"
                >
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{a.title}</h2>
                        <p className="mt-0.5 truncate text-sm text-[#606861]">{a.className}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#E8DFCA] px-2.5 py-1 text-xs font-medium">
                        {a.format === "true_false" ? "True or false" : "Multiple choice"}
                      </span>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#E8DFCA]">
                      <div className="h-full bg-[#1A4D2E]" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-[#606861]">
                      {a.checked} of {a.roster} checked
                      {a.mean !== null ? ` · class average ${a.mean}%` : ""}
                      {a.status === "closed" ? " · closed" : ""}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}