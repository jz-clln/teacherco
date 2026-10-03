// src/features/attendance/attendance-sheet.tsx

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Clock, FileText, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { saveAttendance } from "./actions";
import { formatLongDate, shiftDate } from "./dates";
import type { AttendanceStatus } from "./types";

type Learner = { id: string; name: string };

const LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

const ROW_TONE: Record<AttendanceStatus, string> = {
  present: "border-[#E3E5E1] bg-white",
  absent: "border-red-200 bg-red-50",
  late: "border-amber-200 bg-amber-50",
  excused: "border-sky-200 bg-sky-50",
};

const BADGE_TONE: Record<AttendanceStatus, string> = {
  present: "bg-[#EAF0EA] text-[#1A4D2E]",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-800",
  excused: "bg-sky-100 text-sky-800",
};

const ICON: Record<AttendanceStatus, React.ReactNode> = {
  present: <Check size={18} aria-hidden />,
  absent: <X size={18} aria-hidden />,
  late: <Clock size={18} aria-hidden />,
  excused: <FileText size={18} aria-hidden />,
};

const chip =
  "inline-flex min-h-12 min-w-16 items-center justify-center rounded-xl border px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E] disabled:opacity-50";

/** "Oct 3, 2026, 3:46 PM" in Philippine time, so the server and the browser print the same text. */
function formatSavedAt(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AttendanceSheet({
  classId,
  date,
  today,
  learners,
  initial,
  taken: initiallyTaken,
  updatedAt,
}: {
  classId: string;
  date: string;
  today: string;
  learners: Learner[];
  /** Marks already saved for this day. Anyone missing starts as present. */
  initial: Record<string, AttendanceStatus>;
  taken: boolean;
  /** Newest save time among this day's saved rows. null when nothing is saved yet. */
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const startMarks = useMemo(
    () => Object.fromEntries(learners.map((l) => [l.id, initial[l.id] ?? "present"])) as Record<string, AttendanceStatus>,
    [learners, initial],
  );
  const [marks, setMarks] = useState(startMarks);
  const [baseline, setBaseline] = useState(startMarks);
  const [taken, setTaken] = useState(initiallyTaken);
  // Set the moment a save succeeds, so "Last updated" changes before the page refreshes.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // A day the teacher tried to open while there were unsaved changes.
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const l of learners) c[marks[l.id]]++;
    return c;
  }, [learners, marks]);
  const dirty = learners.some((l) => marks[l.id] !== baseline[l.id]);
  const lastUpdated = taken ? formatSavedAt(savedAt ?? updatedAt ?? "") : null;

  function setStatus(id: string, status: AttendanceStatus) {
    setMessage(null);
    setMarks((cur) => ({ ...cur, [id]: status }));
  }

  function setEveryone(status: AttendanceStatus) {
    setMessage(null);
    setMarks(Object.fromEntries(learners.map((l) => [l.id, status])) as Record<string, AttendanceStatus>);
  }

  function goTo(next: string) {
    if (next === date || next > today) return;
    if (dirty) {
      setLeaveTo(next);
      return;
    }
    router.push(`/classes/${classId}/attendance?date=${next}`);
  }

  function save() {
    setMessage(null);
    start(async () => {
      const result = await saveAttendance({
        classId,
        date,
        marks: learners.map((l) => ({ learnerId: l.id, status: marks[l.id] })),
      });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setBaseline(marks);
      setTaken(true);
      setSavedAt(new Date().toISOString());
      setMessage({ kind: "ok", text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* date */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => goTo(shiftDate(date, -1))}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E3E5E1] bg-white text-[#1A4D2E] hover:bg-[#F5F6F4]"
        >
          <ChevronLeft size={20} />
        </button>
        <DatePicker
          name="attendanceDate"
          label="Attendance date"
          hideLabel
          clearable={false}
          value={date}
          onChange={(v) => v && goTo(v > today ? today : v)}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => goTo(shiftDate(date, 1))}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E3E5E1] bg-white text-[#1A4D2E] hover:bg-[#F5F6F4] disabled:opacity-40"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#313832]">
          {formatLongDate(date)}
          {date === today ? <span className="ml-2 rounded-full bg-[#EAF0EA] px-2 py-0.5 text-xs text-[#1A4D2E]">Today</span> : null}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            taken ? "bg-[#EAF0EA] text-[#1A4D2E]" : "bg-amber-100 text-amber-800",
          )}
        >
          {taken ? "Attendance saved" : "Not taken yet"}
        </span>
      </div>
      {lastUpdated ? <p className="-mt-2 text-xs text-[#606861]">Last updated {lastUpdated}</p> : null}

      {/* quick actions */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEveryone("present")} disabled={pending} className={cn(chip, "border-[#E3E5E1] bg-white text-[#1A4D2E] hover:bg-[#F5F6F4]")}>
          All present
        </button>
        <button type="button" onClick={() => setEveryone("absent")} disabled={pending} className={cn(chip, "border-[#E3E5E1] bg-white text-[#606861] hover:bg-[#F5F6F4]")}>
          All absent
        </button>
        <p className="self-center text-xs text-[#606861]">Tap a name to mark absent. Tap again to undo.</p>
      </div>

      {/* learners */}
      <ul className="space-y-2">
        {learners.map((l) => {
          const status = marks[l.id];
          return (
            <li key={l.id} className={cn("flex items-stretch gap-2 rounded-2xl border p-1.5 transition-colors", ROW_TONE[status])}>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus(l.id, status === "present" ? "absent" : "present")}
                aria-label={`${l.name}: ${LABEL[status]}. Tap to ${status === "present" ? "mark absent" : "mark present"}.`}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]"
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", BADGE_TONE[status])}>{ICON[status]}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="block text-xs text-[#606861]">{LABEL[status]}</span>
                </span>
              </button>
              <button
                type="button"
                disabled={pending}
                aria-pressed={status === "late"}
                onClick={() => setStatus(l.id, status === "late" ? "present" : "late")}
                className={cn(chip, status === "late" ? "border-amber-500 bg-amber-500 text-white" : "border-[#E3E5E1] bg-white text-[#606861] hover:bg-amber-50")}
              >
                Late
              </button>
              <button
                type="button"
                disabled={pending}
                aria-pressed={status === "excused"}
                onClick={() => setStatus(l.id, status === "excused" ? "present" : "excused")}
                className={cn(chip, status === "excused" ? "border-sky-600 bg-sky-600 text-white" : "border-[#E3E5E1] bg-white text-[#606861] hover:bg-sky-50")}
              >
                Excused
              </button>
            </li>
          );
        })}
      </ul>

      {/* save bar */}
      <div className="sticky bottom-0 -mx-4 border-t border-[#E3E5E1] bg-[#F5EFE6]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        {message ? (
          <p role={message.kind === "error" ? "alert" : "status"} className={cn("mb-2 text-sm", message.kind === "error" ? "text-red-700" : "text-[#1A4D2E]")}>
            {message.text}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#313832]" aria-live="polite">
            <strong>{counts.present}</strong> present · <strong className={counts.absent ? "text-red-700" : ""}>{counts.absent}</strong> absent
            {counts.late ? <> · <strong>{counts.late}</strong> late</> : null}
            {counts.excused ? <> · <strong>{counts.excused}</strong> excused</> : null}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={pending || (taken && !dirty)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1A4D2E] px-5 text-sm font-semibold text-white transition hover:bg-[#123820] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : taken ? (dirty ? "Update attendance" : "Saved") : "Save attendance"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={leaveTo !== null}
        title="Leave without saving?"
        description="You marked some learners but did not save. If you leave, those changes are lost."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          const next = leaveTo;
          setLeaveTo(null);
          if (next) router.push(`/classes/${classId}/attendance?date=${next}`);
        }}
        onCancel={() => setLeaveTo(null)}
      />
    </div>
  );
}