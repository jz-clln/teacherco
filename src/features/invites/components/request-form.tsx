//src\features\invites\components\request-form.tsx

"use client";

import { Spinner } from "@/components/ui/loading-state";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field } from "@/features/exams/ui";
import { cn } from "@/lib/utils";
import { requestAccess } from "../actions";
import type { InviteState } from "../types";

const labelText = "mb-1.5 block text-sm font-medium text-[#1F2A22]";

export function RequestAccessForm({ name, email }: { name: string; email: string }) {
  const [state, setState] = useState<InviteState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || state.success) return;
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          try { setState(await requestAccess({ name: data.get("name"), email, message: data.get("message") })); }
          catch { setState({ error: "Could not connect. Please try again." }); }
        });
      }}
    >
      <label className="block">
        <span className={labelText}>Name</span>
        <input name="name" required maxLength={120} defaultValue={name} className={field} />
      </label>

      <label className="block">
        <span className={labelText}>Account email</span>
        <input
          type="email"
          value={email}
          readOnly
          className={cn(field, "cursor-default bg-[#F4F7F4] text-[#606861]")}
        />
      </label>

      <label className="block">
        <span className={labelText}>
          Message <span className="text-sm font-normal text-[#606861]">(optional)</span>
        </span>
        <textarea name="message" maxLength={1000} rows={3} className={cn(field, "resize-none")} />
      </label>

      {state.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#FBEAEA] p-3 text-sm text-[#9B2C2C]">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-[#EAF0EA] p-3 text-sm text-[#1A4D2E]">
          <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.success}</span>
        </p>
      ) : null}

      <Button disabled={pending || !!state.success} className="w-full">
        {pending ? (
          <>
            <Spinner className="mr-2"/>
            Sending…
          </>
        ) : "Request access"}
      </Button>

      <p className="text-center">
        <Link href="/invite" className="tc-button tc-quiet inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-[#1A4D2E]">
          <ArrowLeft size={16} aria-hidden />
          Back to invite code
        </Link>
      </p>
    </form>
  );
}