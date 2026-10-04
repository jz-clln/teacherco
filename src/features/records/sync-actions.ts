"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccessContext } from "@/lib/auth/access-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSyncPlan, changeCount, syncInputSchema, type Change, type Snapshot } from "./sync-model";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type SyncPreview = { revision: number; changes: Change[]; count: number };
export type SyncVersion = { id: string; version_number: number; filename: string; created_at: string; change_count: number };
const setupError = "Class record sync is not available yet. The database update (0015) must be installed before using this feature.";

async function authorized(classId: string) {
  if (!z.uuid().safeParse(classId).success) throw new Error("Class not found.");
  const context = await getAccessContext();
  if (!context?.user.email_confirmed_at || context.profile.access_status !== "active") throw new Error("Sign in with an active teacher account to sync records.");
  const db = await createClient();
  const { data, error } = await db.from("classes").select("id").eq("id", classId).eq("teacher_id", context.user.id).maybeSingle();
  if (error || !data) throw new Error("Class not found.");
  return { db, userId: context.user.id };
}
function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Could not complete the sync. Please try again." };
}
async function snapshot(db: Awaited<ReturnType<typeof createClient>>, classId: string): Promise<Snapshot> {
  const { data, error } = await db.rpc("class_record_snapshot", { p_class_id: classId });
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883" ? setupError : "Could not read the class record. Please try again.");
  if (!data) throw new Error("Class not found.");
  return data as Snapshot;
}
function parseInput(raw: unknown) {
  const parsed = syncInputSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the workbook data.");
  return parsed.data;
}

export async function previewRecordSync(classId: string, raw: unknown): Promise<Result<SyncPreview>> {
  try {
    const { db } = await authorized(classId);
    const input = parseInput(raw), current = await snapshot(db, classId);
    const plan = buildSyncPlan(input, current);
    return { ok: true, data: { revision: current.revision, changes: plan.changes, count: changeCount(plan) } };
  } catch (error) { return failure(error); }
}

export async function applyRecordSync(classId: string, raw: unknown, revision: number, requestId: string): Promise<Result<{ version: number }>> {
  try {
    const { db, userId } = await authorized(classId);
    if (!z.uuid().safeParse(requestId).success || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Compare the workbook again before applying.");
    const input = parseInput(raw);
    // A retry after a lost response returns the original success, even if the class has since changed.
    const prior = await db.from("class_record_sync_versions").select("version_number").eq("class_id", classId).eq("request_id", requestId).maybeSingle();
    if (prior.error) throw new Error("Could not check sync history. Please try again.");
    if (prior.data) return { ok: true, data: { version: prior.data.version_number } };
    const current = await snapshot(db, classId);
    if (current.revision !== revision) throw new Error("The class changed while you were reviewing. Compare the workbook again before applying.");
    // Recompute from validated data; never trust changes or IDs submitted by the browser.
    const plan = buildSyncPlan(input, current);
    if (!changeCount(plan)) throw new Error("There are no changes to apply.");
    const { data, error } = await createAdminClient().rpc("apply_class_record_sync", {
      p_teacher_id: userId, p_class_id: classId, p_request_id: requestId,
      p_revision: revision, p_input: input, p_plan: plan,
    });
    if (error) throw new Error(error.code === "40001" || error.code === "40P01" ? "The class changed during saving. Compare the workbook again before applying." : "Could not confirm the sync. Retry to check its status; the same request will not create duplicates.");
    for (const path of [`/classes/${classId}`, `/classes/${classId}/records`, `/classes/${classId}/records/sync`, `/classes/${classId}/term-grades`, "/classes", "/reports", "/today"]) revalidatePath(path);
    return { ok: true, data: { version: Number(data.version) } };
  } catch (error) { return failure(error); }
}

export async function listSyncVersions(classId: string, beforeVersion?: number): Promise<Result<SyncVersion[]>> {
  try {
    const { db } = await authorized(classId);
    if (beforeVersion !== undefined && (!Number.isSafeInteger(beforeVersion) || beforeVersion < 1)) throw new Error("Invalid history page.");
    let query = db.from("class_record_sync_versions").select("id,version_number,filename,created_at,change_count").eq("class_id", classId).order("version_number", { ascending: false }).limit(50);
    if (beforeVersion !== undefined) query = query.lt("version_number", beforeVersion);
    const { data, error } = await query;
    if (error) throw new Error(error.code === "PGRST205" || error.code === "42P01" ? setupError : "Could not load version history.");
    return { ok: true, data: data as SyncVersion[] };
  } catch (error) { return failure(error); }
}

export async function readSyncChanges(classId: string, versionId: string): Promise<Result<Change[]>> {
  try {
    const { db } = await authorized(classId);
    if (!z.uuid().safeParse(versionId).success) throw new Error("Version not found.");
    const { data, error } = await db.from("class_record_sync_versions").select("changes").eq("class_id", classId).eq("id", versionId).single();
    if (error || !data) throw new Error("Could not load this version.");
    return { ok: true, data: data.changes as Change[] };
  } catch (error) { return failure(error); }
}

export async function readSyncVersionHeader(classId: string, versionId: string): Promise<Result<SyncVersion>> {
  try {
    const { db } = await authorized(classId);
    if (!z.uuid().safeParse(versionId).success) throw new Error("Version not found.");
    const { data, error } = await db.from("class_record_sync_versions").select("id,version_number,filename,created_at,change_count").eq("class_id", classId).eq("id", versionId).single();
    if (error || !data) throw new Error("Could not load this version.");
    return { ok: true, data: data as SyncVersion };
  } catch (error) { return failure(error); }
}

export async function readSyncVersion(classId: string, versionId: string): Promise<Result<{ version_number: number; filename: string; created_at: string; changes: Change[]; before_snapshot: Snapshot; after_snapshot: Snapshot }>> {
  try {
    const { db } = await authorized(classId);
    if (!z.uuid().safeParse(versionId).success) throw new Error("Version not found.");
    const { data, error } = await db.from("class_record_sync_versions").select("version_number,filename,created_at,changes,before_snapshot,after_snapshot").eq("class_id", classId).eq("id", versionId).single();
    if (error || !data) throw new Error("Could not load this version.");
    return { ok: true, data: data as { version_number: number; filename: string; created_at: string; changes: Change[]; before_snapshot: Snapshot; after_snapshot: Snapshot } };
  } catch (error) { return failure(error); }
}
