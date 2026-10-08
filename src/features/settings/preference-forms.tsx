// src/features/settings/preference-forms.tsx

"use client";

import { Select } from '@/components/ui/select';
import { useActionState } from "react";
import { Lock } from "lucide-react";
import {
  updateAiPrivacy,
  updateAttentionDefaults,
  updateLanguage,
  type SettingsState,
} from "./actions";
import { FormFooter, ToggleRow, inputClass, labelClass } from "./settings-ui";

const initialState: SettingsState = {};

export function LanguageForm({
  preferredLanguage,
  aiReplyLanguage,
}: {
  preferredLanguage: "en" | "fil";
  aiReplyLanguage: "auto" | "en" | "fil";
}) {
  const [state, formAction, pending] = useActionState(updateLanguage, initialState);

  return (
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      <Select name={"preferredLanguage"} label={"My language"} defaultValue={preferredLanguage} options={[{ value: "en", label: "English" }, { value: "fil", label: "Filipino" }]}/>

      <Select name={"aiReplyLanguage"} label={"Ask TeacherCo replies in"} defaultValue={aiReplyLanguage} options={[{ value: "auto", label: "Whatever language I ask in" }, { value: "en", label: "Always English" }, { value: "fil", label: "Always Filipino" }]}/>

      <div className="sm:col-span-2">
        <p className="text-xs leading-5 text-[#8B928C]">
          You can mix English and Filipino when you ask questions. With “Whatever language I ask in”, TeacherCo follows you.
        </p>
        <FormFooter state={state} pending={pending} />
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  hint,
  defaultValue,
  max = 100,
  step = 1,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={1}
        max={max}
        step={step}
        inputMode={step === 1 ? "numeric" : "decimal"}
        required
        className={inputClass}
      />
      <span className="mt-1.5 block text-xs font-normal leading-5 text-[#8B928C]">{hint}</span>
    </label>
  );
}

export function AttentionForm({
  benchmark,
  absenceThreshold,
  missingWorkThreshold,
  dropThreshold,
  classCount,
}: {
  benchmark: number;
  absenceThreshold: number;
  missingWorkThreshold: number;
  dropThreshold: number;
  classCount: number;
}) {
  const [state, formAction, pending] = useActionState(updateAttentionDefaults, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberField name="benchmark" label="Benchmark (%)" hint="Learners with an average below this are flagged." defaultValue={benchmark} step={0.5} />
        <NumberField name="dropThreshold" label="Performance drop (percentage points)" hint="Flag a learner whose average falls by at least this much." defaultValue={dropThreshold} step={0.5} />
        <NumberField name="absenceThreshold" label="Absences" hint="Flag a learner with this many absences or more." defaultValue={absenceThreshold} />
        <NumberField name="missingWorkThreshold" label="Missing activities" hint="Flag a learner with this many missing activities or more." defaultValue={missingWorkThreshold} />
      </div>

      {classCount > 0 ? (
        <ToggleRow
          name="applyToClasses"
          title={`Also apply this benchmark to my ${classCount === 1 ? "class" : `${classCount} classes`}`}
          description="Otherwise it only applies to classes you create from now on."
          defaultChecked={false}
        />
      ) : null}

      <FormFooter state={state} pending={pending} />
    </form>
  );
}

export function AiPrivacyForm({ aiEnabled, includeNotes }: { aiEnabled: boolean; includeNotes: boolean }) {
  const [state, formAction, pending] = useActionState(updateAiPrivacy, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <ToggleRow
        name="aiEnabled"
        title="Use AI assistance"
        description="Turn this off to stop AI summaries and explanations. Your records, dashboards, and calculations keep working."
        defaultChecked={aiEnabled}
      />
      <ToggleRow
        name="aiIncludeNotes"
        title="Include my teacher notes in AI requests"
        description="Notes are free text and may contain names or private details, so this is off by default."
        defaultChecked={includeNotes}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[#E3E5E1] bg-[#F4F7F4] p-4">
        <Lock size={18} className="mt-0.5 shrink-0 text-[#1A4D2E]" />
        <div>
          <p className="text-sm font-semibold text-[#313832]">Learner names never leave TeacherCo</p>
          <p className="mt-1 text-xs leading-5 text-[#606861]">
            Before a request goes to the AI provider, each learner becomes a code like learner_027 with only their average, absences, and missing activities. TeacherCo matches the answer back to the right learner inside your workspace. This is always on.
          </p>
        </div>
      </div>

      <FormFooter state={state} pending={pending} />
    </form>
  );
}