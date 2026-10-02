// src/features/settings/offline-controls.tsx

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearOfflineCache, getOfflineSummary, type OfflineSummary } from "@/lib/offline/cache";

function subscribeToConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineControls() {
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const [summary, setSummary] = useState<OfflineSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getOfflineSummary().then(setSummary);
  }, []);

  async function clearCache() {
    setBusy(true);
    await clearOfflineCache();
    setSummary(await getOfflineSummary());
    setConfirming(false);
    setBusy(false);
    setMessage("Cached classroom data was cleared from this device. It will download again the next time you are online.");
  }

  const hasCache = !!summary && (summary.classes > 0 || summary.learners > 0);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-2xl border border-[#E3E5E1] bg-[#FAFAF8] p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF0EA] text-[#1A4D2E]">
          {online ? <Wifi size={19} /> : <WifiOff size={19} />}
        </span>
        <div>
          <p className="text-sm font-semibold text-[#313832]">{online ? "You are online" : "You are offline"}</p>
          <p className="mt-0.5 text-xs leading-5 text-[#8B928C]">
            {online
              ? "Your classroom records are cached on this device so they stay available without internet."
              : "Your cached records are still available. AI assistance returns when you reconnect."}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Classes cached", value: summary?.classes },
          { label: "Learners cached", value: summary?.learners },
          { label: "Waiting to sync", value: summary?.pendingChanges },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#E3E5E1] bg-white p-4">
            <dd className="text-2xl font-bold text-[#1E2420]">{item.value ?? "–"}</dd>
            <dt className="mt-1 text-xs leading-5 text-[#8B928C]">{item.label}</dt>
          </div>
        ))}
      </dl>

      {summary && summary.pendingChanges > 0 ? (
        <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {summary.pendingChanges} change{summary.pendingChanges === 1 ? "" : "s"} made offline {summary.pendingChanges === 1 ? "has" : "have"} not synced yet. Clearing the cache keeps them.
        </p>
      ) : null}

      <div>
        {confirming ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm leading-6 text-red-800">
              Clear the classroom data cached on this device? Your records in your account are not affected.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={clearCache} disabled={busy}>
                {busy ? "Clearing…" : "Yes, clear cache"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" disabled={!hasCache} onClick={() => { setMessage(""); setConfirming(true); }}>
            Clear offline cache
          </Button>
        )}
        {message ? (
          <p role="status" className="mt-3 text-sm leading-6 text-[#1A4D2E]">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}