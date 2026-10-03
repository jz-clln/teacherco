"use client";

import { useSyncExternalStore } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}

// Keep install-event capture alive across app navigation, using runtime memory only.
export function PwaStatus() {
  usePwaInstall();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return online ? null : <div role="status" className="pwa-offline-status">You’re offline. Reconnect to continue using online features.</div>;
}
