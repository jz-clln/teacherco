// src/features/scores/new-activity-form.tsx

"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { inputClass, labelClass, StatusMessage } from "@/features/settings/settings-ui";
import { createManualAssessment, type ScoreState } from "./actions";

const initialState: ScoreState = {};

export function NewActivityForm({ classId }: { classId: string }) {
  const [state, formAction, pending] = useActionState(createManualAssessment, initialState);
  const [date, setDate] = useState("");

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="classId" value={classId} />

      <label className={labelClass}>
        Activity name
        <input name="title" required maxLength={120} placeholder="Oral Recitation 1" autoComplete="off" className={inputClass} />
      </label>

      <label className={labelClass}>
        Highest possible score
        <input name="total" required inputMode="decimal" placeholder="20" autoComplete="off" className={inputClass} />
      </label>

      <DatePicker name="date" label="Date" hint="(optional)" value={date} onChange={setDate} />

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create activity"}
        </Button>
        <StatusMessage state={state} />
      </div>
    </form>
  );
}