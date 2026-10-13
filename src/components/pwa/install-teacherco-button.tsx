"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { IOSInstallDialog } from "./ios-install-dialog";
import { WindowsInstallDialog } from './windows-install-dialog';

export function InstallTeacherCoButton({ destination }: { destination: string | null }) {
  const { available, standalone, installed, ios, windows, busy, message, install } = usePwaInstall();
  const [instructions, setInstructions] = useState(false);
  const open = standalone || installed;
  return <div className="pwa-install-control">
    {open || (!available && !ios && !windows && !busy) ? (
      <Link href={destination ?? "/login"} prefetch={false} className="landing-button landing-button-secondary">
        {open ? "Open TeacherCo" : "Continue in browser"}<ArrowRight size={17} aria-hidden="true" />
      </Link>
    ) : (
      <button type="button" className="landing-button landing-button-secondary disabled:opacity-50" disabled={busy} aria-busy={busy||undefined} onClick={() => {
        if (ios) setInstructions(true); else if (available) void install(); else if(windows) setInstructions(true);
      }}>
        <Download size={17} aria-hidden="true" />
        {busy ? "Opening installer…" : windows ? "Install for Windows" : "Install TeacherCo"}
      </button>
    )}
    {message && <p className="pwa-install-message" role="status">{message}</p>}
    <IOSInstallDialog open={instructions&&ios} onClose={() => setInstructions(false)} />
    <WindowsInstallDialog open={instructions&&windows} onClose={() => setInstructions(false)} destination={destination}/>
  </div>;
}
