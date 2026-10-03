"use client";

import { useEffect, useId, useRef } from "react";
import { Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IOSInstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, [open]);

  return <dialog ref={ref} className="pwa-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <p className="pwa-dialog-brand">TeacherCo</p>
    <h2 id={`${id}-title`}>Install TeacherCo</h2>
    <p id={`${id}-description`}>Keep your classroom companion on your iPhone or iPad Home Screen.</p>
    <ol>
      <li><Share aria-hidden="true" size={22} /><span>Tap your browser’s <strong>Share</strong> button.</span></li>
      <li><SquarePlus aria-hidden="true" size={22} /><span>Choose <strong>Add to Home Screen</strong>.</span></li>
      <li><span className="pwa-step-number" aria-hidden="true">3</span><span>Keep <strong>Open as Web App</strong> enabled if shown, then tap <strong>Add</strong>.</span></li>
    </ol>
    <p className="pwa-guidance">Don’t see that option? Open teacherco.vercel.app in Safari and try again.</p>
    <Button type="button" autoFocus onClick={onClose}>Got it</Button>
  </dialog>;
}
