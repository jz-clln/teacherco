// src/features/reports/generate-report-form.tsx

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <Link href="/classes/new" className="font-semibold text-[#1A4D2E] hover:underline">
          Create a class
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {typeOptions.map(({ value, label, text, icon: Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#E3E5E1] bg-white p-4 transition hover:border-[#D5E0D5] has-checked:border-[#4F6F52] has-checked:bg-[#F4F7F4] has-checked:ring-4 has-checked:ring-[#4F6F52]/10"
          >
            <input
              type="radio"
              name="reportType"
              value={value}
              checked={reportType === value}
              onChange={() => setReportType(value)}
              className="sr-only"
            />
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF0EA] text-[#1A4D2E]">
              <Icon size={19} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#313832]">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#8B928C]">{text}</span>
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
          <Select
            key={classId}
            name="learnerId"
            label="Learner"
            required
            placeholder={selectedClass && selectedClass.learners.length > 0 ? "Choose a learner" : "No learners in this class"}
            options={(selectedClass?.learners ?? []).map((learner) => ({ value: learner.id, label: learner.name }))}
          />
        ) : null}
      </div>

      <p className="text-xs leading-5 text-[#8B928C]">
        {aiEnabled ? (
          <>
            TeacherCo calculates every number from your confirmed scores. AI only writes the wording, and it never receives learner names.
          </>
        ) : (
          <>
            AI is off, so you will get a facts-only summary written from your records.{" "}
            <Link href="/settings#ai" className="font-semibold text-[#1A4D2E] hover:underline">
              Change in Settings
            </Link>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Preparing your report…" : "Generate report"}
        </Button>
        {pending ? <p className="text-sm text-[#606861]">Calculating from your records. This can take a few seconds.</p> : null}
        <StatusMessage state={state} />
      </div>
    </form>
  );
}