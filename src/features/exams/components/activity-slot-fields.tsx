"use client";

import Link from "next/link";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import type { ActivityChoice } from "@/lib/exams/activity-slots";

export function ActivitySlotFields({ choices, value, onChange, classId }: {
  choices: ActivityChoice[]; value: string; onChange: (value: string) => void; classId: string;
}) {
  const [term, setTerm] = useState("1");
  const selected = choices.find((s) => s.title === value);
  return <>
    <Select name="term" label="Term" value={term} onChange={(v) => { setTerm(v); onChange(""); }}
      options={[1, 2, 3].map((n) => ({ value: String(n), label: `Term ${n}` }))} />
    <Select name="activitySlot" label="Class record activity" required value={value} onChange={onChange}
      placeholder="Choose an activity" options={choices.filter((s) => s.term === Number(term)).map((s) => ({
        value: s.title, label: `${s.title.replace(/^Term \d+ · /, "")}${s.assessmentId ? " (already assigned)" : ""}`,
      }))} />
    {selected?.assessmentId ? <p role="status" className="text-sm text-[#606861] sm:col-span-2">
      Already assigned to {selected.assessmentTitle}. <Link className="tc-button tc-quiet font-semibold text-[#1A4D2E]"
        href={selected.source === "checked" ? `/check/${selected.assessmentId}/score` : selected.source === "manual" ? `/classes/${classId}/scores?a=${selected.assessmentId}` : `/classes/${classId}/records`}>Open existing activity</Link>
    </p> : selected ? <p className="text-sm text-[#606861] sm:col-span-2">Scores will export to {selected.title}.</p> : null}
  </>;
}
