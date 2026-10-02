// src/features/reports/report-editor.tsx

"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass, labelClass, StatusMessage } from "@/features/settings/settings-ui";
import { saveReport, type ReportState } from "./actions";

const initialState: ReportState = {};

export function ReportEditor({
  reportId,
  text,
  status,
  hasEdits,
}: {
  reportId: string;
  text: string;
  status: "draft" | "final";
  hasEdits: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveReport, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(textareaRef.current?.value ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="reportId" value={reportId} />

      <label className={labelClass}>
        Report text
        <textarea
          ref={textareaRef}
          name="content"
          defaultValue={text}
          rows={14}
          required
          maxLength={20000}
          className={`${inputClass} min-h-64 resize-y leading-7`}
        />
      </label>

      <label className={`${labelClass} sm:max-w-xs`}>
        Status
        <select name="status" defaultValue={status} className={inputClass}>
          <option value="draft">Draft</option>
          <option value="final">Final</option>
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={copyText} className="gap-2">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy text"}
        </Button>
        {hasEdits ? (
          <Button type="submit" name="intent" value="restore" variant="ghost" disabled={pending}>
            Restore original
          </Button>
        ) : null}
        <StatusMessage state={state} />
      </div>
    </form>
  );
}