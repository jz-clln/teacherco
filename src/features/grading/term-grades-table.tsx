"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { COMPONENT_LABEL, type Component } from "@/lib/grading/deped";
import type { ClassTermGrades } from "./queries";

const components: Component[] = ["written_work", "performance_task", "assessment"];
const TERMS = [1, 2, 3];
/** DepEd passing grade. A term grade of 75 or higher is a pass. */
const PASSING_GRADE = 75;
const gradeText = (value: number | null) => value == null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

function comparisonText(status: string, gap: number | null) {
  if (status === "match") return "Matches workbook";
  if (status === "differs") return `Differs${gap == null ? "" : ` by ${gap > 0 ? "+" : ""}${gap}`}`;
  if (status === "app_only") return "No printed grade";
  if (status === "record_only") return "Scores incomplete";
  return "Pending";
}

/** Term Grade cell: green when passed, red when failed. An icon and hidden text back up the color. */
function TermGradeCell({ value }: { value: number | null }) {
  if (value == null) {
    return <td className="border-l border-[#E3E5E1] px-3 py-3 font-semibold tabular-nums">—</td>;
  }
  const passed = value >= PASSING_GRADE;
  return (
    <td className={`border-l border-[#E3E5E1] px-3 py-3 ${passed ? "bg-green-50" : "bg-red-50"}`}>
      <span className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${passed ? "text-green-800" : "text-red-700"}`}>
        {passed ? <Check size={16} aria-hidden /> : <X size={16} aria-hidden />}
        {value}
        <span className="sr-only">{passed ? "Passed" : "Failed"}</span>
      </span>
    </td>
  );
}

function MobileTermGrades({ classroom, term }: { classroom: ClassTermGrades; term: number }) {
  const [search, setSearch] = useState("");
  const learners = classroom.learners.filter((learner) => learner.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <section className="min-w-0 space-y-3 md:hidden" aria-label="Learner grades">
    <label className="block text-sm font-medium">
      Find a learner
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="mt-2 min-h-11 w-full rounded-xl border border-[#E3E5E1] bg-white px-3 text-base" />
    </label>
    <p role="status" className="text-xs text-[#606861]">{learners.length} of {classroom.learners.length} learners · Tap a learner for the breakdown</p>
    <div className="space-y-3">
      {learners.map((learner) => {
        const grade = learner.terms.find((entry) => entry.term === term)!;
        const value = grade.result.termGrade;
        const passed = value != null && value >= PASSING_GRADE;
        return <details key={`${learner.id}-${term}`} className="group min-w-0 rounded-xl border border-[#E3E5E1] bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-[#1A4D2E] [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-[#28332B]">{learner.name}</span>
              <span className="mt-1 block text-xs text-[#606861]">{grade.result.descriptor ?? "Not yet graded"}</span>
              <span className="mt-3 block text-xs font-medium text-[#1A4D2E] group-open:hidden">View breakdown +</span>
              <span className="mt-3 hidden text-xs font-medium text-[#1A4D2E] group-open:block">Hide breakdown −</span>
            </span>
            <span className={`shrink-0 rounded-lg px-3 py-2 text-center ${value == null ? "bg-[#F4F7F4] text-[#606861]" : passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              <span className="block text-xs">Term {term}</span>
              <span className="block text-xl font-bold tabular-nums">{gradeText(value ?? null)}</span>
              <span className="block text-xs">{value == null ? "Pending" : passed ? "Passed" : "Failed"}</span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-[#E3E5E1] p-4 text-sm">
            {components.map((component) => {
              const result = grade.result.components.find((item) => item.component === component);
              return <div key={component}>
                <p className="font-medium">{COMPONENT_LABEL[component]} <span className="text-xs text-[#606861]">({Math.round(classroom.config.weights[component] * 100)}%)</span></p>
                <dl className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-[#606861]">Percentage score</dt><dd className="mt-1 tabular-nums">{result?.ps == null ? "—" : `${result.ps.toFixed(2)}%`}</dd></div>
                  <div><dt className="text-[#606861]">Weighted score</dt><dd className="mt-1 tabular-nums">{result?.ws?.toFixed(2) ?? "—"}</dd></div>
                </dl>
              </div>;
            })}
            <dl className="space-y-2 border-t border-[#E3E5E1] pt-3 text-xs">
              <div className="flex justify-between gap-3"><dt>Initial grade</dt><dd className="font-medium tabular-nums">{gradeText(grade.result.initialGrade)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Workbook</dt><dd className="text-right">{comparisonText(grade.comparison.status, grade.comparison.termGap)}</dd></div>
            </dl>
          </div>
        </details>;
      })}
      {!learners.length && <p className="py-5 text-sm text-[#606861]">No learners match your search.</p>}
    </div>
  </section>;
}

export function TermGradesTable({ classroom }: { classroom: ClassTermGrades }) {
  const [term, setTerm] = useState(1);
  const records = classroom.learners.map((learner) => ({ learner, grade: learner.terms.find((entry) => entry.term === term)! }));
  const withScores = records.filter(({ grade }) => grade.result.status === "graded");
  const matches = withScores.filter(({ grade }) => grade.comparison.status === "match").length;
  const warnings = [...new Set(records.flatMap(({ grade }) => grade.result.warnings))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#4F6F52]">CALCULATED FROM CLASS RECORDS</p>
          <h1 className="mt-1 text-3xl font-bold">Term grades</h1>
          <p className="mt-2 text-sm text-[#606861]">{classroom.name} · {classroom.subject}</p>
        </div>
        <Link href={`/settings?class=${classroom.id}#grading`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#4F6F52]/40 bg-white px-4 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F4F7F4]">
          Edit grading rules <ArrowRight size={16} />
        </Link>
      </div>

      {!classroom.hasTermData ? (
        <section className="border-t border-[#E3E5E1] py-6" role="status">
          <h2 className="font-semibold">No term-tagged grade columns yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#606861]">
            {classroom.unassignedActivityCount > 0
              ? `TeacherCo found ${classroom.unassignedActivityCount} scored ${classroom.unassignedActivityCount === 1 ? "activity" : "activities"}, but their records are not assigned to a term and grading component. Import the class record’s Term 1, 2, or 3 sheets to calculate DepEd term grades.`
              : "Import a class record with term sheets to calculate Initial Grade, Term Grade, and descriptor from its score columns."}
          </p>
          <Link href={`/classes/${classroom.id}/records`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white hover:bg-[#123820]">
            Import class record <ArrowRight size={16} />
          </Link>
        </section>
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#E3E5E1] py-3">
        <div role="tablist" aria-label="Term" className="inline-flex rounded-xl border border-[#E3E5E1] bg-white p-1">
          {TERMS.map((number) => (
            <button
              key={number}
              type="button"
              role="tab"
              aria-selected={term === number}
              onClick={() => setTerm(number)}
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${term === number ? "bg-[#1A4D2E] text-white" : "text-[#606861] hover:bg-[#F4F7F4]"}`}
            >
              Term {number}
            </button>
          ))}
        </div>
        <p className="text-sm text-[#606861]">
          {withScores.length} of {classroom.learners.length} learners graded
          {withScores.length ? ` · ${matches} match workbook` : ""}
        </p>
      </div>

      {!classroom.learners.length ? (
        <p className="py-8 text-center text-sm text-[#606861]">Import a class roster before calculating term grades.</p>
      ) : (
        <>
        <MobileTermGrades classroom={classroom} term={term} />
        <div className="hidden overflow-x-auto rounded-xl border border-[#E3E5E1] bg-white md:block">
          <table className="w-full min-w-280 border-collapse text-left text-sm">
            <thead className="bg-[#F4F7F4] text-xs font-semibold text-[#4F5D52]">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 min-w-56 border-b border-[#E3E5E1] bg-[#F4F7F4] px-3 py-3">Learner</th>
                {components.map((component) => (
                  <th key={component} colSpan={2} className="border-b border-l border-[#E3E5E1] px-3 py-2 text-center">{COMPONENT_LABEL[component]}</th>
                ))}
                <th rowSpan={2} className="border-b border-l border-[#E3E5E1] px-3 py-3">Initial Grade</th>
                <th rowSpan={2} className="border-b border-l border-[#E3E5E1] px-3 py-3">Term Grade</th>
                <th rowSpan={2} className="border-b border-l border-[#E3E5E1] px-3 py-3">Descriptor</th>
                <th rowSpan={2} className="border-b border-l border-[#E3E5E1] px-3 py-3">Workbook</th>
              </tr>
              <tr>
                {components.flatMap((component) => [
                  <th key={`${component}-ps`} className="border-b border-l border-[#E3E5E1] px-3 py-2 text-center">PS</th>,
                  <th key={`${component}-ws`} className="border-b border-[#E3E5E1] px-3 py-2 text-center">WS · {Math.round(classroom.config.weights[component] * 100)}%</th>,
                ])}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E5E1]">
              {records.map(({ learner, grade }) => (
                <tr key={learner.id} className="hover:bg-[#FAFAF8]">
                  <th scope="row" className="sticky left-0 bg-white px-3 py-3 font-medium text-[#28332B]">{learner.name}</th>
                  {components.flatMap((component) => {
                    const value = grade.result.components.find((item) => item.component === component);
                    return [
                      <td key={`${component}-ps`} className="border-l border-[#E3E5E1] px-3 py-3 text-center tabular-nums">{value?.ps == null ? "—" : `${value.ps.toFixed(2)}%`}</td>,
                      <td key={`${component}-ws`} className="px-3 py-3 text-center tabular-nums">{value?.ws?.toFixed(2) ?? "—"}</td>,
                    ];
                  })}
                  <td className="border-l border-[#E3E5E1] px-3 py-3 font-medium tabular-nums">{gradeText(grade.result.initialGrade)}</td>
                  <TermGradeCell value={grade.result.termGrade ?? null} />
                  <td className="border-l border-[#E3E5E1] px-3 py-3">{grade.result.descriptor ?? "—"}</td>
                  <td className="border-l border-[#E3E5E1] px-3 py-3">
                    <span className={grade.comparison.status === "match" ? "font-medium text-[#1A4D2E]" : "text-[#606861]"}>
                      {comparisonText(grade.comparison.status, grade.comparison.termGap)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {warnings.length > 0 ? (
        <section aria-label="Calculation notes" className="border-t border-[#E3E5E1] pt-4">
          <h2 className="font-semibold">Calculation notes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[#606861]">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      ) : null}
      </>
      )}
    </div>
  );
}
