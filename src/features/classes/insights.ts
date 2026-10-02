// src/features/classes/insights.ts
//
// Turns real class data into the "Needs attention" and "Recent changes" cards.
// Nothing here is guessed: every flag shows the numbers behind it.
//
// Attendance counting: "present" and "late" count as here, "absent" counts as away.
// "Excused" days are left out of the rate, and an excused day breaks an absence streak.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUpdatedAt, shiftDate, todayInManila } from "@/features/attendance/dates";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/features/attendance/types";

/** The rules behind "Needs attention". Shown to the teacher on the card, so keep them in one place. */
export const ATTENTION_RULES = {
  /** Absent this many recorded days in a row, ending on the latest recorded day. */
  streak: 3,
  /** How many of the latest recorded days are looked at. */
  recentDays: 10,
  /** Fewest recorded days needed before the attendance rate is judged. */
  minDaysForRate: 5,
  /** Flag a learner who was here less than this % of the recent days. */
  lowAttendance: 80,
} as const;

const WINDOW_DAYS = 60; // only look back this far on the calendar
const PAGE = 1000; // Supabase returns at most 1000 rows per request.
const MAX_PAGES = 10;
const STATUSES = new Set<string>(ATTENDANCE_STATUSES);

export type AttendanceRow = {
  learnerId: string;
  /** "YYYY-MM-DD" */
  date: string;
  status: AttendanceStatus;
  /** When this row was last saved, if it was recorded. */
  updatedAt: string | null;
};

export type InsightLearner = { id: string; name: string; addedAt: string };

export type AttentionItem = { learnerId: string; name: string; reasons: string[] };

export type ChangeItem = {
  id: string;
  title: string;
  details: string[];
  tone: "good" | "warn" | "neutral";
};

export type ClassInsights = {
  /** Learners to look at, most urgent first. */
  attention: AttentionItem[];
  /** How many recorded attendance days exist in the look-back window. */
  attendanceDays: number;
  changes: ChangeItem[];
};

/** Reads the newest attendance rows for a class (most recent days first). */
export async function readRecentAttendance(supabase: SupabaseClient, classId: string): Promise<AttendanceRow[]> {
  const since = shiftDate(todayInManila(), -WINDOW_DAYS);
  const out: AttendanceRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("attendance_entries")
      .select("learner_id,status,attendance_date,updated_at")
      .eq("class_id", classId)
      .gte("attendance_date", since)
      .order("attendance_date", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data) {
      const status = String(r.status);
      if (!STATUSES.has(status)) continue;
      out.push({
        learnerId: String(r.learner_id),
        date: String(r.attendance_date),
        status: status as AttendanceStatus,
        updatedAt: r.updated_at ? String(r.updated_at) : null,
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

function shortDate(key: string): string {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { timeZone: "UTC", month: "short", day: "numeric" });
}

function nameList(names: string[], max = 4): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;

function countStatuses(rows: AttendanceRow[]): Record<AttendanceStatus, number> {
  const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

/** % of learners here (present or late), leaving out excused. Null if nobody counts. */
function rateOf(c: Record<AttendanceStatus, number>): number | null {
  const here = c.present + c.late;
  const counted = here + c.absent;
  return counted ? (here / counted) * 100 : null;
}

export function buildInsights(input: {
  learners: InsightLearner[];
  /** Each learner's own score average (0-100), only for learners that have scores. */
  learnerPercents: Record<string, number>;
  benchmark: number;
  attendance: AttendanceRow[];
}): ClassInsights {
  const { learners, learnerPercents, benchmark } = input;
  const roster = new Set(learners.map((l) => l.id));
  const rows = input.attendance.filter((r) => roster.has(r.learnerId));

  // Recorded days, newest first.
  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();
  const recent = dates.slice(0, ATTENTION_RULES.recentDays);

  const marks = new Map<string, Map<string, AttendanceStatus>>();
  for (const r of rows) {
    let m = marks.get(r.learnerId);
    if (!m) {
      m = new Map();
      marks.set(r.learnerId, m);
    }
    m.set(r.date, r.status);
  }

  // ---- Needs attention ----
  const attention: AttentionItem[] = [];
  for (const l of learners) {
    const reasons: string[] = [];

    const percent = learnerPercents[l.id];
    if (percent !== undefined && percent < benchmark) {
      reasons.push(`Score average ${pct1(percent)}, under the ${benchmark}% benchmark`);
    }

    const m = marks.get(l.id);
    if (m && recent.length > 0) {
      let streak = 0;
      for (const d of recent) {
        if (m.get(d) === "absent") streak++;
        else break;
      }
      if (streak >= ATTENTION_RULES.streak) {
        reasons.push(`Absent ${streak} recorded days in a row, up to ${shortDate(recent[0])}`);
      }

      let here = 0;
      let counted = 0;
      for (const d of recent) {
        const s = m.get(d);
        if (s === "present" || s === "late") {
          here++;
          counted++;
        } else if (s === "absent") {
          counted++;
        }
      }
      if (counted >= ATTENTION_RULES.minDaysForRate && (here / counted) * 100 < ATTENTION_RULES.lowAttendance) {
        reasons.push(`Here ${here} of the last ${counted} recorded days (${Math.round((here / counted) * 100)}%)`);
      }
    }

    if (reasons.length > 0) attention.push({ learnerId: l.id, name: l.name, reasons });
  }
  attention.sort(
    (a, b) =>
      b.reasons.length - a.reasons.length ||
      (learnerPercents[a.learnerId] ?? 101) - (learnerPercents[b.learnerId] ?? 101) ||
      a.name.localeCompare(b.name),
  );

  // ---- Recent changes ----
  const changes: ChangeItem[] = [];
  const latest = dates[0];
  const previous = dates[1];

  if (latest) {
    const latestRows = rows.filter((r) => r.date === latest);
    const c = countStatuses(latestRows);
    const parts = [`${c.present} present`, `${c.absent} absent`];
    if (c.late > 0) parts.push(`${c.late} late`);
    if (c.excused > 0) parts.push(`${c.excused} excused`);
    const details = [parts.join(", ")];

    const rate = rateOf(c);
    const previousRows = previous ? rows.filter((r) => r.date === previous) : [];
    const previousRate = previous ? rateOf(countStatuses(previousRows)) : null;
    if (rate !== null && previousRate !== null && previous) {
      const diff = Math.round(rate) - Math.round(previousRate);
      details.push(
        diff === 0
          ? `Same attendance rate as ${shortDate(previous)} (${Math.round(rate)}%)`
          : `Attendance rate ${Math.round(rate)}%, ${diff > 0 ? "up" : "down"} ${Math.abs(diff)} ${
              Math.abs(diff) === 1 ? "point" : "points"
            } from ${shortDate(previous)}`,
      );
    } else if (rate !== null) {
      details.push(`Attendance rate ${Math.round(rate)}%`);
    }

    let savedAt: string | null = null;
    for (const r of latestRows) {
      if (r.updatedAt && (savedAt === null || Date.parse(r.updatedAt) > Date.parse(savedAt))) savedAt = r.updatedAt;
    }
    if (savedAt) {
      const when = formatUpdatedAt(savedAt);
      if (when) details.push(`Last updated ${when}`);
    }

    changes.push({ id: `attendance-${latest}`, title: `Attendance on ${shortDate(latest)}`, details, tone: "neutral" });

    if (previous) {
      const now = new Map(latestRows.map((r) => [r.learnerId, r.status]));
      const before = new Map(previousRows.map((r) => [r.learnerId, r.status]));
      const nameOf = (id: string) => learners.find((l) => l.id === id)?.name ?? "";

      const newlyAbsent = learners
        .filter((l) => now.get(l.id) === "absent" && before.has(l.id) && before.get(l.id) !== "absent")
        .map((l) => l.name);
      if (newlyAbsent.length > 0) {
        changes.push({
          id: "newly-absent",
          title: `Newly absent since ${shortDate(previous)}`,
          details: [nameList(newlyAbsent)],
          tone: "warn",
        });
      }

      const back = learners
        .filter((l) => before.get(l.id) === "absent" && (now.get(l.id) === "present" || now.get(l.id) === "late"))
        .map((l) => nameOf(l.id));
      if (back.length > 0) {
        changes.push({
          id: "back-in-class",
          title: `Back in class since ${shortDate(previous)}`,
          details: [nameList(back)],
          tone: "good",
        });
      }
    }
  }

  // Students added in the last two weeks, grouped by day (Philippine time).
  const cutoff = shiftDate(todayInManila(), -14);
  const addedByDay = new Map<string, number>();
  for (const l of learners) {
    if (Number.isNaN(Date.parse(l.addedAt))) continue;
    const day = todayInManila(new Date(l.addedAt));
    if (day >= cutoff) addedByDay.set(day, (addedByDay.get(day) ?? 0) + 1);
  }
  [...addedByDay]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 2)
    .forEach(([day, n]) => {
      changes.push({
        id: `added-${day}`,
        title: `${n} ${n === 1 ? "student" : "students"} added`,
        details: [shortDate(day)],
        tone: "neutral",
      });
    });

  return { attention, attendanceDays: dates.length, changes };
}