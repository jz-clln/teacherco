// src/app/(dashboard)/check/[assessmentId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { analyze, formatItemRange } from "@/lib/exams/analytics";
import { choiceLabel } from "@/lib/exams/types";
import { ResultsTable } from "@/features/exams/components/results-table";
import { getAssessmentBundle } from "@/features/exams/queries";
import { btnPrimary, btnSecondary } from "@/features/exams/ui";

export const metadata = { title: "Assessment results" };

const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

export default async function AssessmentPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const bundle = await getAssessmentBundle(assessmentId);
  if (!bundle) notFound();

  const { assessment, items, roster, submissions } = bundle;
  const { classStats, itemStats, gaps, competencyStats } = analyze(items, submissions, {
    benchmark: assessment.benchmark,
    rosterSize: roster.length,
  });
  const hasResults = classStats.checked > 0;

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: "Checked", value: `${classStats.checked} of ${classStats.roster}` },
    { label: "Class average", value: pct(classStats.mean) },
    { label: "Median", value: pct(classStats.median) },
    {
      label: "Below benchmark",
      value: String(classStats.belowBenchmark),
      hint: `under ${assessment.benchmark}%`,
    },
    { label: "Highest", value: pct(classStats.highest) },
    { label: "Lowest", value: pct(classStats.lowest) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/check" className="text-sm font-medium text-[#4F6F52] hover:underline">← All assessments</Link>
          <h1 className="mt-2 text-3xl font-bold">{assessment.title}</h1>
          <p className="mt-1 text-[#606861]">
            {assessment.className}
            {assessment.date ? ` · ${assessment.date}` : ""}
            {assessment.status === "closed" ? " · closed" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/check/${assessment.id}/key`} className={btnSecondary}>Answer key</Link>
          <Link href={`/check/${assessment.id}/score`} className={btnPrimary}>Check answer sheets</Link>
        </div>
      </div>

      <dl className="tc-group grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="border-b border-[#E3E5E1] p-5">
            <dt className="text-sm text-[#606861]">{s.label}</dt>
            <dd className="mt-1 text-2xl font-bold">{s.value}</dd>
            {s.hint ? <p className="text-sm text-[#606861]">{s.hint}</p> : null}
          </div>
        ))}
      </dl>

      {!hasResults ? (
        <Card>
          <h2 className="font-semibold">No scores yet</h2>
          <Link href={`/check/${assessment.id}/score`} className={`${btnPrimary} mt-4`}>Check the first sheet</Link>
        </Card>
      ) : (
        <>
          <section aria-labelledby="gaps-heading" className="space-y-3">
            <h2 id="gaps-heading" className="text-xl font-semibold">Possible learning gaps</h2>
            {gaps.length === 0 && competencyStats.length === 0 ? (
              <Card>
                <p className="text-sm text-[#606861]">No item was missed by most learners.</p>
              </Card>
            ) : null}

            {competencyStats.length ? (
              <ul className="tc-group tc-rows">
                {competencyStats.map((c) => (
                  <li key={c.name}>
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-semibold">{c.name}</h3>
                        <span className={`text-lg font-bold ${c.percentCorrect < assessment.benchmark ? "text-[#9B2C2C]" : "text-[#1A4D2E]"}`}>
                          {c.percentCorrect}%
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#606861]">
                        Items {formatItemRange(c.itemNumbers)} · {c.learnersBelow} of {c.learnersMeasured} learners below {assessment.benchmark}%
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {gaps.length ? (
              <ul className="tc-group tc-rows">
                {gaps.map((g) => (
                  <li key={g.itemId}>
                    <div className="p-5">
                      <p className="font-medium">
                        Item {g.itemNumber}: {g.wrong} of {g.total} learners missed it
                        {g.competencies.length ? ` (${g.competencies.join(", ")})` : ""}
                      </p>
                      <p className="mt-1 text-sm text-[#606861]">
                        {g.topWrong
                          ? `Most picked ${choiceLabel(g.topWrong.answer, assessment.format)} instead of ${choiceLabel(g.expected, assessment.format)} (${g.topWrong.count} learners).`
                          : "Many left it blank."}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-labelledby="items-heading" className="space-y-3">
            <h2 id="items-heading" className="text-xl font-semibold">Item analysis</h2>
            <Card>
              <ul className="divide-y divide-[#E8DFCA]">
                {itemStats.map((s) => (
                  <li key={s.itemId} className="py-2.5">
                    <details>
                      <summary className="flex cursor-pointer items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-[#1A4D2E]">
                        <span className="w-14 shrink-0 text-sm font-medium">Item {s.itemNumber}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E8DFCA]" aria-hidden>
                          <span
                            className={`block h-full ${s.isGap ? "bg-[#9B2C2C]" : "bg-[#4F6F52]"}`}
                            style={{ width: `${s.percentCorrect}%` }}
                          />
                        </span>
                        <span className="w-24 shrink-0 text-right text-sm">
                          {s.percentCorrect}% correct
                        </span>
                      </summary>
                      <div className="mt-2 pl-17 text-sm text-[#606861]">
                        <p>
                          Key: {choiceLabel(s.expected, assessment.format)} · {s.correct} correct, {s.wrong - s.blank} wrong, {s.blank} blank
                        </p>
                        <p className="mt-1">
                          Picks:{" "}
                          {Object.entries(s.distribution)
                            .sort((a, b) => b[1] - a[1])
                            .map(([answer, count]) => `${answer === "" ? "No answer" : choiceLabel(answer, assessment.format)} ${count}`)
                            .join(" · ")}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </>
      )}

      <section aria-labelledby="learners-heading" className="space-y-3">
        <h2 id="learners-heading" className="text-xl font-semibold">Learners</h2>
        <Card>
          <ResultsTable assessmentId={assessment.id} rows={roster} benchmark={assessment.benchmark} />
        </Card>
      </section>
    </div>
  );
}
