// src/features/reports/generate-report-form.tsx

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";
import { StatusMessage } from "@/features/settings/settings-ui";
import { generateReport, type ReportState } from "./actions";
import type { ReportType } from "./format";

const initialState: ReportState = {};

export type GenerateClassOption = {
  id: string;
  name: string;
  subject: string;
  gradeLevel: string;
  schoolYear: string;
  learners: { id: string; name: string }[];
};

const typeOptions = [
  { value: "class_performance", label: "Class Performance Summary", text: "Average, learners below benchmark, weakest competency, attendance.", icon: Users },
  { value: "learner_progress", label: "Learner Progress Summary", text: "One learner's results, change over time, and strengths.", icon: User },
] as const;

export function GenerateReportForm({ classes, aiEnabled }: { classes: GenerateClassOption[]; aiEnabled: boolean }) {
  const [state, formAction, pending] = useActionState(generateReport, initialState);
  const [reportType, setReportType] = useState<ReportType>("class_performance");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");

  const selectedClass = classes.find((item) => item.id === classId);

  if (classes.length === 0) {
    return (
      <p className="text-sm leading-6 text-[#606861]">
        Create a class and import its record first, then you can prepare reports here.{" "}
        <Link href="/classes/new" className="tc-button tc-quiet font-semibold text-[#1A4D2E]">
          Create a class
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <div className="tc-group tc-rows">
        {typeOptions.map(({ value, label, text, icon: Icon }) => (
          <label
            key={value}
            className="flex min-w-0 cursor-pointer items-start gap-3 p-4 transition hover:bg-[#F4F7F4] has-checked:bg-[#F4F7F4] has-focus-visible:outline-2 has-focus-visible:outline-[#1A4D2E]"
          >
            <input
              type="radio"
              name="reportType"
              value={value}
              checked={reportType === value}
              onChange={() => setReportType(value)}
              className="mt-1 size-4 shrink-0 accent-[#1A4D2E]"
            />
            <span className="grid size-6 shrink-0 place-items-center text-[#606861]">
              <Icon size={19} />
            </span>
            <span className="min-w-0 break-words">
              <span className="block text-sm font-semibold text-[#313832]">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#606861]">{text}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          name="classId"
          label="Class"
          required
          defaultValue={classId}
          onChange={setClassId}
          options={classes.map((item) => ({ value: item.id, label: `${item.name} — ${item.subject}` }))}
        />

        {reportType === "learner_progress" ? (
          <SearchableSelect
            key={classId}
            name="learnerId"
            label="Learner"
            required
            placeholder={selectedClass && selectedClass.learners.length > 0 ? "Choose a learner" : "No learners in this class"}
            searchPlaceholder="Search learners…"
            emptyText="No learner matches your search."
            options={(selectedClass?.learners ?? []).map((learner) => ({ value: learner.id, label: learner.name }))}
          />
        ) : null}
      </div>

      <p className="text-xs leading-5 text-[#606861]">
        {aiEnabled ? (
          <>
            TeacherCo calculates every number from your confirmed scores. AI only writes the wording, and it never receives learner names.
          </>
        ) : (
          <>
            AI is off, so you will get a facts-only summary written from your records.{" "}
            <Link href="/settings#ai" className="tc-button tc-quiet font-semibold text-[#1A4D2E]">
              Change in Settings
            </Link>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button loading={Boolean(pending)} type="submit" disabled={pending}>
          {pending ? "Preparing your report…" : "Generate report"}
        </Button>
        {pending ? <p className="text-sm text-[#606861]">Calculating from your records. This can take a few seconds.</p> : null}
        <StatusMessage state={state} />
      </div>
    </form>
  );
}
