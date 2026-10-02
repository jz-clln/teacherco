// src/components/ui/date-picker.tsx

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-10-02" → local Date (no timezone shifting). */
function parseKey(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function addMonths(d: Date, n: number) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

const fmt = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

type DatePickerProps = {
  name: string;
  label: string;
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Small text after the label, e.g. "(optional)". */
  hint?: string;
  /** Show a Clear button. Defaults to true. */
  clearable?: boolean;
  className?: string;
};

export function DatePicker({
  name,
  label,
  value,
  onChange,
  placeholder = "Select a date",
  hint,
  clearable = true,
  className,
}: DatePickerProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);

  const selected = parseKey(value);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Date>(() => selected ?? new Date());
  const [view, setView] = useState({ y: focus.getFullYear(), m: focus.getMonth() });

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Move keyboard focus onto the active day after open / arrow keys.
  useEffect(() => {
    if (open && moveFocus.current) {
      moveFocus.current = false;
      document.getElementById(`${id}-d-${toKey(focus)}`)?.focus();
    }
  }, [open, focus, view, id]);

  function openCalendar() {
    const base = selected ?? new Date();
    setFocus(base);
    setView({ y: base.getFullYear(), m: base.getMonth() });
    moveFocus.current = true;
    setOpen(true);
  }

  function goTo(next: Date) {
    moveFocus.current = true;
    setFocus(next);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  }

  function pick(d: Date | null) {
    onChange(d ? toKey(d) : "");
    setOpen(false);
    trigger.current?.focus();
  }

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, Date> = {
      ArrowLeft: addDays(focus, -1),
      ArrowRight: addDays(focus, 1),
      ArrowUp: addDays(focus, -7),
      ArrowDown: addDays(focus, 7),
      PageUp: addMonths(focus, -1),
      PageDown: addMonths(focus, 1),
      Home: addDays(focus, -focus.getDay()),
      End: addDays(focus, 6 - focus.getDay()),
    };
    const next = moves[e.key];
    if (next) {
      e.preventDefault();
      goTo(next);
    }
  }

  function shiftMonth(n: number) {
    const d = addMonths(new Date(view.y, view.m, 1), n);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  const today = new Date();
  const todayKey = toKey(today);
  const selectedKey = selected ? toKey(selected) : "";
  const lead = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const inView = focus.getFullYear() === view.y && focus.getMonth() === view.m;
  const tabDay = inView ? focus.getDate() : 1;

  const thisYear = today.getFullYear();
  const yearOptions: { value: string; label: string }[] = [];
  for (let y = Math.min(thisYear - 5, view.y); y <= Math.max(thisYear + 5, view.y); y++) {
    yearOptions.push({ value: String(y), label: String(y) });
  }

  return (
    <div className={cn("block", className)}>
      <span id={`${id}-label`} className="text-sm font-medium">
        {label}
        {hint ? <span className="ml-1 font-normal text-[#606861]">{hint}</span> : null}
      </span>

      <div
        ref={root}
        className="relative mt-1.5"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open && !e.defaultPrevented) {
            e.preventDefault();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          onClick={() => (open ? setOpen(false) : openCalendar())}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-[#E3E5E1] bg-white px-3 py-3 text-left outline-none transition focus:border-[#4F6F52]",
            open && "border-[#4F6F52]",
          )}
        >
          <span className={cn("truncate", !selected && "text-[#8B928C]")}>{selected ? fmt(selected) : placeholder}</span>
          <CalendarDays size={18} className="shrink-0 text-[#606861]" />
        </button>

        <input type="hidden" name={name} value={value} />

        {open ? (
          <div
            role="dialog"
            aria-label={`Choose ${label.toLowerCase()}`}
            className="teacherco-card absolute z-30 mt-1.5 w-78 max-w-[90vw] p-3"
          >
            {/* month / year */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#606861] hover:bg-[#EAF0EA]"
              >
                <ChevronLeft size={18} />
              </button>
              <Select
                name={`${name}-month`}
                label="Month"
                hideLabel
                compact
                className="min-w-0 flex-1"
                value={String(view.m)}
                onChange={(v) => setView((cur) => ({ ...cur, m: Number(v) }))}
                options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
              />
              <Select
                name={`${name}-year`}
                label="Year"
                hideLabel
                compact
                className="w-24 shrink-0"
                value={String(view.y)}
                onChange={(v) => setView((cur) => ({ ...cur, y: Number(v) }))}
                options={yearOptions}
              />
              <button
                type="button"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#606861] hover:bg-[#EAF0EA]"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* weekdays */}
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-[#8B928C]" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>

            {/* days */}
            <div
              role="group"
              aria-label={`${MONTHS[view.m]} ${view.y}`}
              onKeyDown={onGridKey}
              className="mt-1 grid grid-cols-7 gap-1"
            >
              {Array.from({ length: lead }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const day = i + 1;
                const date = new Date(view.y, view.m, day);
                const key = toKey(date);
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    id={`${id}-d-${key}`}
                    type="button"
                    tabIndex={day === tabDay ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
                    aria-current={key === todayKey ? "date" : undefined}
                    onClick={() => pick(date)}
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-lg text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#1A4D2E]",
                      isSelected
                        ? "bg-[#1A4D2E] font-semibold text-white"
                        : "text-[#1E2420] hover:bg-[#EAF0EA]",
                      key === todayKey && !isSelected && "font-semibold text-[#1A4D2E] ring-1 ring-[#4F6F52]",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* footer */}
            <div className="mt-3 flex items-center justify-between border-t border-[#E3E5E1] pt-2">
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#1A4D2E] hover:bg-[#EAF0EA]"
              >
                Today
              </button>
              {clearable && value ? (
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#606861] hover:bg-[#EAF0EA]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}