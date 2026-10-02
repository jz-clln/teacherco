// src/features/attendance/dates.ts

// Attendance days are calendar dates in the Philippines. The server runs in UTC, so
// "today" must be worked out for Asia/Manila or teachers would see yesterday every morning.

export const TIME_ZONE = "Asia/Manila";

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today as "YYYY-MM-DD" in Philippine time. */
export function todayInManila(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True for a real calendar date written as "YYYY-MM-DD". */
export function isDateKey(value: string): boolean {
  const m = KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Moves a "YYYY-MM-DD" date by whole days. */
export function shiftDate(key: string, days: number): string {
  const m = KEY.exec(key);
  if (!m) return key;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)).toISOString().slice(0, 10);
}

/** "Friday, October 2, 2026" */
export function formatLongDate(key: string): string {
  const m = KEY.exec(key);
  if (!m) return key;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** A saved timestamp shown in Philippine time, e.g. "Oct 2, 2026, 8:15 AM". */
export function formatUpdatedAt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("en-PH", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}