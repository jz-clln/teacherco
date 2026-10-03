"use client";

import { useSyncExternalStore } from "react";
import { isIOSDevice, isStandalone } from "@/lib/pwa/platform";
import type { BeforeInstallPromptEvent, InstallState } from "@/lib/pwa/types";

const serverState: InstallState = { available: false, ios: false, standalone: false, installed: false, busy: false, message: "" };
let state = serverState;
let promptEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
function update(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    const display = window.matchMedia("(display-mode: standalone)");
    const refreshDisplay = () => update({ standalone: isStandalone() });
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      if (state.installed || isStandalone()) return;
      promptEvent = event as BeforeInstallPromptEvent;
      update({ available: true, message: "" });
    };
    const installed = () => {
      promptEvent = null;
      update({ installed: true, available: false, busy: false, message: "TeacherCo is installed. Open it from your device’s app launcher or Home Screen." });
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    display.addEventListener("change", refreshDisplay);
    stop = () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      display.removeEventListener("change", refreshDisplay);
    };
    update({ ios: window.isSecureContext && isIOSDevice(navigator), standalone: isStandalone() });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stop?.(); stop = undefined; promptEvent = null; state = serverState;
    }
  };
}

async function install() {
  if (!promptEvent || state.busy) return;
  const event = promptEvent;
  promptEvent = null; // Browser install events are single-use, including dismissal.
  update({ busy: true, available: false, message: "" });
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (!state.installed) update({ message: outcome === "accepted"
      ? "Installation requested. Follow your browser’s instructions to finish."
      : "You can keep using TeacherCo in your browser." });
  } catch {
    update({ message: "Installation is unavailable right now. You can continue in your browser." });
  } finally {
    update({ busy: false });
  }
}

export function usePwaInstall() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => serverState);
  return { ...snapshot, install };
}
