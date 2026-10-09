// src/components/ui/confirm-dialog.tsx

"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for actions that throw something away. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  /** Called by the cancel button, the Escape key and a click outside the box. */
  onCancel: () => void;
};

/** In-app replacement for window.confirm. Safe to open on top of another popup. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl border border-[#E8DFCA] bg-white p-0 text-[#1F2A22] shadow-xl backdrop:bg-black/50"
    >
      {open ? (
        <div className="p-5">
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-2 text-sm text-[#606861]">{description}</p> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" autoFocus onClick={onCancel} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button loading={Boolean(pending)}
              type="button"
              className={destructive ? "bg-[#9B2C2C] text-white hover:bg-[#7F2323]" : undefined}
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? 'Saving…' : confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
