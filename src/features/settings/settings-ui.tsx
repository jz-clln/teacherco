// src/features/settings/settings-ui.tsx

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SettingsState } from "./actions";

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#A0A6A1] focus:border-[#4F6F52] focus-visible:outline-2 focus-visible:outline-[#1A4D2E]";

export const labelClass = "block text-sm font-semibold text-[#313832]";

export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-6">
      <Card className="sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-6 shrink-0 place-items-center text-[#606861]">
            <Icon size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-[#1E2420]">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#606861]">{description}</p>
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}

export function StatusMessage({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm leading-6 text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="inline-flex items-center gap-1.5 text-sm leading-6 text-[#1A4D2E]">
        <Check size={16} className="shrink-0" />
        {state.success}
      </p>
    );
  }
  return null;
}

export function FormFooter({ state, pending, label = "Save changes" }: { state: SettingsState; pending: boolean; label?: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      <StatusMessage state={state} />
    </div>
  );
}

export function ToggleRow({
  name,
  title,
  description,
  defaultChecked,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-[#E3E5E1] py-4">
      <span>
        <span className="block text-sm font-semibold text-[#313832]">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-[#606861]">{description}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 shrink-0 accent-[#1A4D2E]" />
    </label>
  );
}

export function DangerButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
