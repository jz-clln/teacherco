// src/features/reports/delete-report-button.tsx

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DangerButton } from "@/features/settings/settings-ui";
import { deleteReport } from "./actions";

export function DeleteReportButton({ reportId }: { reportId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" className="gap-2" onClick={() => setConfirming(true)}>
        <Trash2 size={16} /> Delete report
      </Button>
    );
  }

  return (
    <form action={deleteReport} className="rounded-2xl border border-red-100 bg-red-50 p-4">
      <input type="hidden" name="reportId" value={reportId} />
      <p className="text-sm leading-6 text-red-800">Delete this report permanently? Your class records are not affected.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <DangerButton type="submit">Yes, delete report</DangerButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}