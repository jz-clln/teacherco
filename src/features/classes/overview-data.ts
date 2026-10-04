import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth/access-guard";
import { getClassStats } from "./stats";
import { buildInsights, readRecentAttendance, type InsightLearner } from "./insights";
import { summarizeUpdate, type LatestUpdate } from "./change-summary";

export const ownedClass = cache(async (classId: string) => {
  const context = await requireAccess({ onboarded: true });
  if (!z.uuid().safeParse(classId).success) notFound();
  const { data, error } = await context.supabase.from("classes")
    .select("id,name,subject,grade_level,school_year,benchmark,school_name,school_id,adviser,section")
    .eq("id", classId).eq("teacher_id", context.user.id).maybeSingle();
  if (error) throw new Error("Could not load this class. Please try again.");
  if (!data) notFound();
  return { db: context.supabase, classroom: data };
});

export const classRoster = cache(async (classId: string): Promise<InsightLearner[]> => {
  const { db } = await ownedClass(classId);
  const learners: InsightLearner[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("class_enrollments").select("created_at,learner:learners(id,display_name)")
      .eq("class_id", classId).eq("status", "active").order("id").range(offset, offset + 499);
    if (error || !data) throw new Error("Could not load learners. Please try again.");
    for (const entry of data) {
      const l = Array.isArray(entry.learner) ? entry.learner[0] : entry.learner;
      if (l) learners.push({ id: String(l.id), name: String(l.display_name), addedAt: entry.created_at });
    }
    if (data.length < 500) return learners.sort((a, b) => a.name.localeCompare(b.name));
  }
});

export const currentOverview = cache(async (classId: string) => {
  const { db, classroom } = await ownedClass(classId);
  const roster = await classRoster(classId).catch(() => null);
  const [stats, attendance] = await Promise.allSettled([
    roster ? getClassStats(db, classId, roster.map(l => l.id), Number(classroom.benchmark)) : Promise.reject(new Error("Roster unavailable")),
    readRecentAttendance(db, classId),
  ]);
  const metrics = stats.status === "fulfilled" ? stats.value : null;
  const insights = roster && metrics && attendance.status === "fulfilled" ? buildInsights({ learners: roster, learnerPercents: metrics.learnerPercents, benchmark: Number(classroom.benchmark), attendance: attendance.value }) : null;
  return { total: roster?.length ?? null, metrics, insights };
});

export async function latestClassChanges(classId: string) {
  const { db, classroom } = await ownedClass(classId);
  // One version only, projected to the fields needed for counts and the existing score-average formula.
  // No full snapshots, raw uploaded record, attendance history or grading configuration is loaded.
  const { data, error } = await db.from("class_record_sync_versions")
    .select("id,version_number,filename,created_at,changes,before_learners:before_snapshot->learners,after_learners:after_snapshot->learners,before_scores:before_snapshot->scores,after_scores:after_snapshot->scores")
    .eq("class_id", classId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error) return { status: "error" as const };
  if (!data) return { status: "empty" as const };
  try { return { status: "ready" as const, summary: summarizeUpdate(data as unknown as LatestUpdate, Number(classroom.benchmark)) }; }
  catch { return { status: "error" as const }; }
}

export async function recentAssessments(classId: string) {
  const { db } = await ownedClass(classId);
  const { data, error } = await db.from("assessments").select("id,title,source,created_at").eq("class_id", classId).order("created_at", { ascending: false }).limit(3);
  return error ? null : data;
}
