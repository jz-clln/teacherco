//src\features\invites\components\admin-controls.tsx

"use client";

import { useState, useTransition } from "react";
import { Ban, Check, CircleAlert, CircleCheck, Copy, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { field } from "@/features/exams/ui";
import { generateCode, manageCode, reviewRequest } from "../actions";
import type { InviteState } from "../types";

/** Compact on desktop, 44px touch targets on phones. */
const control = "min-h-11 gap-1.5 px-3 text-sm sm:min-h-9";

function Feedback({ state }: { state: InviteState }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-[#9B2C2C]">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="mt-2 flex items-start gap-1.5 text-sm text-[#1A4D2E]">
          <CircleCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.success}</span>
        </p>
      ) : null}
    </>
  );
}

export function GenerateCodeForm() {
  const [state, setState] = useState<InviteState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        startTransition(async () => {
          try { setState(await generateCode(email)); } catch { setState({ error: "Could not generate a code. Check your access and connection." }); }
        });
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="mb-1.5 block text-sm font-medium text-[#1F2A22]">
            Restrict to email <span className="text-sm font-normal text-[#606861]">(optional)</span>
          </span>
          <input name="email" type="email" maxLength={254} placeholder="teacher@example.com" className={field} />
        </label>
        <Button className="w-full sm:w-auto" disabled={pending}>
          {pending ? (
            <>
              <span className="mr-2 size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Generating…
            </>
          ) : "Generate invite code"}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#606861]">Email restrictions match the verified account email exactly, including letter case. Codes are single-use and never expire.</p>
      <Feedback state={state} />
    </form>
  );
}

export function CodeControls({ id, code, active }: { id: string; code: string; active: boolean }) {
  const [state, setState] = useState<InviteState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  function run(operation: "delete" | "disable" | "reactivate") {
    setConfirming(false);
    startTransition(async () => {
      try { setState(await manageCode(id, operation)); } catch { setState({ error: "Could not update the code. Check your access and connection." }); }
    });
  }
  return (
    <div className="min-w-48">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className={control}
          onClick={async () => {
            try { await navigator.clipboard.writeText(code); setState({ success: "Code copied." }); }
            catch { setState({ error: "Clipboard unavailable. Select and copy the code manually." }); }
          }}
        >
          <Copy size={15} aria-hidden /> Copy
        </Button>
        <Button type="button" variant="ghost" disabled={pending} className={control} onClick={() => run(active ? "disable" : "reactivate")}>
          {active ? <Ban size={15} aria-hidden /> : <RotateCcw size={15} aria-hidden />}
          {active ? "Disable" : "Reactivate"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className={`${control} text-[#9B2C2C] hover:bg-[#FBEAEA]`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={15} aria-hidden /> Delete
        </Button>
      </div>
      <Feedback state={state} />
      <ConfirmDialog open={confirming} title="Delete invite code?" description="The code will be permanently removed. Its redemption history will remain, and an activated account will keep access." confirmLabel="Delete code" destructive onConfirm={() => run("delete")} onCancel={() => setConfirming(false)} />
    </div>
  );
}

export function RequestControls({ id }: { id: string }) {
  const [state, setState] = useState<InviteState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {(["approved", "rejected"] as const).map((status) => (
          <Button
            type="button"
            key={status}
            variant={status === "approved" ? "secondary" : "ghost"}
            disabled={pending}
            className={`${control} ${status === "rejected" ? "text-[#9B2C2C] hover:bg-[#FBEAEA]" : ""}`}
            onClick={() => startTransition(async () => {
              try { setState(await reviewRequest(id, status)); } catch { setState({ error: "Could not review the request." }); }
            })}
          >
            {status === "approved" ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
            {status === "approved" ? "Approve request" : "Reject request"}
          </Button>
        ))}
      </div>
      <Feedback state={state} />
    </div>
  );
}