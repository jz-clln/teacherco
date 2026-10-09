"use client";

import { Spinner } from "@/components/ui/loading-state";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { IOSInstallDialog } from "./ios-install-dialog";

export function InstallTeacherCoButton({ destination }: { destination: string | null }) {
  const { available, standalone, installed, ios, busy, message, install } = usePwaInstall();
  const [instructions, setInstructions] = useState(false);
  const open = standalone || installed;
  return <div className="pwa-install-control">
    {open || (!available && !ios && !busy) ? (
      <Link href={destination ?? "/login"} prefetch={false} className="landing-button landing-button-secondary">
        {open ? "Open TeacherCo" : "Continue in browser"}<ArrowRight size={17} aria-hidden="true" />
      </Link>
    ) : (
      <button type="button" className="landing-button landing-button-secondary" disabled={busy} onClick={() => {
        if (ios) setInstructions(true); else if (available) void install();
      }}>
        {busy ? <Spinner/> : <Download size={17} aria-hidden="true" />}
        {busy ? "Opening installer…" : "Install TeacherCo"}
      </button>
    )}
    {message && <p className="pwa-install-message" role="status">{message}</p>}
    <IOSInstallDialog open={instructions} onClose={() => setInstructions(false)} />
  </div>;
}
