"use client";

import { Spinner } from "@/components/ui/loading-state";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClass } from "./actions";

export function CreateClassForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locked = useRef(false);
  const requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    // Keep the same key on retry, including a lost response after a successful save.
    requestId.current ??= crypto.randomUUID();
    data.set("requestId", requestId.current);
    try {
      const result = await createClass(data);
      if (result.id) {
        router.push(`/classes/${result.id}`);
        // Remain locked until navigation unmounts this form.
        return;
      }
      setError(result.error);
    } catch {
      setError("Could not connect. Please try again.");
    }
    locked.current = false;
    setPending(false);
  }

  return (
    <form onSubmit={submit} aria-busy={pending} className="teacherco-card mt-6 space-y-4 p-6">
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <fieldset disabled={pending} className="space-y-4">
        {children}
      </fieldset>
      <Button type="submit" disabled={pending} className="gap-2">
        {pending ? <Spinner/> : null}
        {pending ? "Creating class…" : "Create class"}
      </Button>
      {pending ? <p role="status" className="text-sm text-[#606861]">Saving your class. Please wait…</p> : null}
    </form>
  );
}
