// src/features/exams/components/results-table.tsx

"use client";
import {Spinner} from '@/components/ui/loading-state';

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteSubmissionAction } from "../actions";
import { btnDanger, btnQuiet, muted } from "../ui";

interface Row {
  learnerId: string;
  name: string;
  score: number | null;
  maxScore: number | null;
}

export function ResultsTable({ assessmentId, rows, benchmark }: { assessmentId: string; rows: Row[]; benchmark: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove(row: Row) {
    if (!window.confirm(`Remove ${row.name}'s score? You can check the sheet again afterwards.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSubmissionAction({ assessmentId, learnerId: row.learnerId });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      {pending&&<p role="status" className="mb-2 flex items-center gap-2"><Spinner/>Removing score...</p>}
      {error ? <p role="alert" className="mb-2 text-sm text-[#9B2C2C]">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-md text-left text-sm">
          <caption className="sr-only">Learner scores</caption>
          <thead>
            <tr className="border-b border-[#E8DFCA] text-[#606861]">
              <th scope="col" className="py-2 pr-3 font-medium">Learner</th>
              <th scope="col" className="py-2 pr-3 font-medium">Score</th>
              <th scope="col" className="py-2 pr-3 font-medium">Percent</th>
              <th scope="col" className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = row.score !== null && row.maxScore !== null;
              const percent = checked && row.maxScore ? Math.round(((row.score ?? 0) / row.maxScore) * 1000) / 10 : null;
              return (
                <tr key={row.learnerId} className="border-b border-[#E8DFCA]/70">
                  <th scope="row" className="py-2.5 pr-3 font-medium">{row.name}</th>
                  <td className="py-2.5 pr-3">{checked ? `${row.score} / ${row.maxScore}` : <span className={muted}>Not checked</span>}</td>
                  <td className="py-2.5 pr-3">
                    {percent !== null ? (
                      <span className={percent < benchmark ? "font-semibold text-[#9B2C2C]" : "text-[#1A4D2E]"}>
                        {percent}%{percent < benchmark ? " · below benchmark" : ""}
                      </span>
                    ) : "–"}
                  </td>
                  <td className="py-2.5 text-right">
                    <Link href={`/check/${assessmentId}/score?learner=${row.learnerId}`} className={btnQuiet}>
                      {checked ? "Check again" : "Check sheet"}
                    </Link>
                    {checked ? (
                      <button type="button" onClick={() => remove(row)} disabled={pending} className={btnDanger}>
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}