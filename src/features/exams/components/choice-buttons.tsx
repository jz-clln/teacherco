// src/features/exams/components/choice-buttons.tsx

"use client";

import { choiceLabel, type AssessmentFormat } from "@/lib/exams/types";

interface Props {
  choices: string[];
  format: AssessmentFormat;
  value: string | undefined;
  onChange: (value: string) => void;
  /** Adds a "No answer" option (a blank sheet item). */
  allowBlank?: boolean;
  suggestion?: string | null;
  describedBy?: string;
  groupLabel: string;
}

export function ChoiceButtons({ choices, format, value, onChange, allowBlank, suggestion, groupLabel }: Props) {
  const base =
    "min-w-10 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]";
  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-1.5">
      {choices.map((c) => {
        const selected = value === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(c)}
            className={`${base} ${
              selected
                ? "border-[#1A4D2E] bg-[#1A4D2E] text-white"
                : suggestion === c
                  ? "border-[#4F6F52] border-dashed bg-[#F5EFE6] text-[#1A4D2E] hover:bg-[#E8DFCA]"
                  : "border-[#E8DFCA] bg-white text-[#1F2A22] hover:bg-[#F5EFE6]"
            }`}
          >
            {choiceLabel(c, format)}
          </button>
        );
      })}
      {allowBlank ? (
        <button
          type="button"
          aria-pressed={value === ""}
          onClick={() => onChange("")}
          className={`${base} ${
            value === "" ? "border-[#4F6F52] bg-[#4F6F52] text-white" : "border-[#E8DFCA] bg-white text-[#606861] hover:bg-[#F5EFE6]"
          }`}
        >
          No answer
        </button>
      ) : null}
    </div>
  );
}