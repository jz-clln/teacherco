"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Native tab-order disclosure; deliberately not an ARIA arrow-key menu. */
export function ActionDisclosure({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className="relative shrink-0" onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="tc-button tc-quiet" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{icon}<span>{label}</span></button>
    {open && <div id={id} role="group" aria-label={`${label} actions`} className="tc-floating absolute right-0 top-full z-40 mt-2 w-56 max-w-[calc(100vw-40px)] p-2" onClick={event => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>}
  </div>;
}
