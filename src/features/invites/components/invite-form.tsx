//src\features\invites\components\invite-form.tsx

"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field, label } from "@/features/exams/ui";
import { cn } from "@/lib/utils";
import { redeemInvite } from "../actions";
import { formatInviteKeystroke, INVALID_INVITE, inviteCodeSchema } from "../validation";

export function InviteForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => { router.replace("/onboarding"); router.refresh(); }, 800);
    return () => clearTimeout(timer);
  }, [success, router]);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || success) return;
        setError("");
        if (!inviteCodeSchema.safeParse(code).success) { setError(INVALID_INVITE); return; }
        startTransition(async () => {
          try {
            const result = await redeemInvite(code);
            if (result.success) setSuccess(true); else setError(result.error ?? INVALID_INVITE);
          } catch { setError("Could not connect. Please try again."); }
        });
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="invite-code" className={label}>Invite code</label>
        <input
          id="invite-code"
          name="code"
          value={code}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={14}
          disabled={pending || success}
          aria-invalid={!!error}
          aria-describedby={error ? "invite-error" : "invite-hint"}
          onPaste={(event) => {
            event.preventDefault();
            const input = event.currentTarget;
            const pasted = code.slice(0, input.selectionStart ?? 0) + event.clipboardData.getData("text") + code.slice(input.selectionEnd ?? code.length);
            // Prevent maxLength from truncating a malformed paste into a valid code.
            if (!inviteCodeSchema.safeParse(pasted).success) { setCode(""); setError(INVALID_INVITE); return; }
            setCode(pasted); setError("");
          }}
          onChange={(event) => {
            const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
            setCode(formatInviteKeystroke(code, event.target.value, inputType));
            setError("");
          }}
          className={cn(
            field,
            "h-14 text-center font-mono text-lg tracking-widest placeholder:text-[#B5BBB6] focus:border-[#4F6F52] aria-invalid:border-[#9B2C2C] disabled:bg-[#F4F7F4] disabled:opacity-70",
          )}
        />
        <p id="invite-hint" className="mt-2 text-center text-xs text-[#606861]">Codes are case-sensitive. Include both hyphens when pasting.</p>
      </div>

      {error ? (
        <p id="invite-error" role="alert" className="flex items-start gap-2 rounded-xl bg-[#FBEAEA] p-3 text-sm text-[#9B2C2C]">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      {success ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-[#EAF0EA] p-3 font-semibold text-[#1A4D2E]">
          <CircleCheck size={18} className="shrink-0" aria-hidden />
          Access activated
        </p>
      ) : null}

      <Button className="w-full" disabled={pending || success}>
        {pending ? (
          <>
            <span className="mr-2 size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            Checking…
          </>
        ) : success ? "Continuing…" : "Continue"}
      </Button>

      <p className="text-center">
        <Link href="/request-access" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#1A4D2E] hover:underline">
          I don&apos;t have a code
        </Link>
      </p>
    </form>
  );
}