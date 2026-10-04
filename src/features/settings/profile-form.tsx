// src/features/settings/profile-form.tsx

"use client";

import { useActionState } from "react";
import { Building2, Check } from "lucide-react";
import { updateProfile, type SettingsState } from "./actions";
import { FormFooter, inputClass, labelClass } from "./settings-ui";

const initialState: SettingsState = {};

const schoolTypes = [
  { value: "public", label: "Public school" },
  { value: "private", label: "Private school" },
] as const;

const gradeBandOptions = [
  { value: "elementary", label: "Elementary" },
  { value: "jhs", label: "Junior High" },
  { value: "shs", label: "Senior High" },
] as const;

export type ProfileValues = {
  fullName: string;
  preferredName: string;
  schoolType: "public" | "private" | null;
  schoolName: string;
  gradeBands: string[];
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          Full name
          <input name="fullName" defaultValue={values.fullName} required maxLength={120} className={inputClass} />
        </label>
        <label className={labelClass}>
          What should TeacherCo call you?
          <input name="preferredName" defaultValue={values.preferredName} required maxLength={80} className={inputClass} />
        </label>
      </div>

      <div>
        <p className="text-sm font-semibold text-[#313832]">Where do you teach?</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {schoolTypes.map(({ value, label }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E3E5E1] bg-white p-4 transition hover:border-[#D5E0D5] has-checked:border-[#4F6F52] has-checked:bg-[#F4F7F4]"
            >
              <input type="radio" name="schoolType" value={value} defaultChecked={values.schoolType === value} className="peer sr-only" />
              <span className="grid size-10 place-items-center rounded-xl bg-[#EAF0EA] text-[#1A4D2E]">
                <Building2 size={19} />
              </span>
              <span className="text-sm font-semibold text-[#313832]">{label}</span>
              <Check size={18} className="ml-auto hidden text-[#1A4D2E] peer-checked:block" />
            </label>
          ))}
        </div>
      </div>

      <label className={labelClass}>
        School name <span className="font-normal text-[#606861]">(optional)</span>
        <input name="schoolName" defaultValue={values.schoolName} maxLength={160} placeholder="e.g. San Isidro Elementary School" className={inputClass} />
      </label>

      <div>
        <p className="text-sm font-semibold text-[#313832]">Which levels do you teach?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {gradeBandOptions.map((option) => (
            <label
              key={option.value}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[#E3E5E1] bg-white px-4 py-2.5 text-sm font-medium text-[#606861] transition hover:border-[#D5E0D5] has-checked:border-[#4F6F52] has-checked:bg-[#1A4D2E] has-checked:text-white"
            >
              <input type="checkbox" name="gradeBands" value={option.value} defaultChecked={values.gradeBands.includes(option.value)} className="sr-only" />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <FormFooter state={state} pending={pending} />
    </form>
  );
}
