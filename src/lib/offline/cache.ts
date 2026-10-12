import {activeTeacher,listDays,clearDays} from "../../../public/offline-attendance.js";
// src/lib/offline/cache.ts

import { offlineDb } from "./db";

export type OfflineSummary = {
  classes: number;
  learners: number;
  pendingChanges: number;
};

export async function getOfflineSummary(): Promise<OfflineSummary> {
  if (!offlineDb) return { classes: 0, learners: 0, pendingChanges: 0 };
  const [classes, learners, pendingChanges] = await Promise.all([
    offlineDb.classes.count(),
    offlineDb.learners.count(),
    offlineDb.syncQueue.count(),
  ]);
  const days=await listDays(activeTeacher());
  return {classes:classes+new Set(days.map(d=>d.classId)).size,learners:learners+new Set(days.flatMap(d=>d.learners.map(l=>l.id))).size,pendingChanges:pendingChanges+days.filter(d=>d.pending).length};
}

/** Clears cached classroom data. Changes still waiting to sync are kept. */
export async function clearOfflineCache() {
  await clearDays(activeTeacher());
  const db = offlineDb;
  if (!db) return;
  await db.transaction("rw", db.classes, db.learners, db.enrollments, async () => {
    await Promise.all([db.classes.clear(), db.learners.clear(), db.enrollments.clear()]);
  });
}

/** Clears everything, including unsynced changes. Used after the teacher deletes all data. */
export async function clearAllOfflineData() {
  await clearDays(activeTeacher(),true);
  const db = offlineDb;
  if (!db) return;
  await db.transaction("rw", db.classes, db.learners, db.enrollments, db.syncQueue, async () => {
    await Promise.all([db.classes.clear(), db.learners.clear(), db.enrollments.clear(), db.syncQueue.clear()]);
  });
}

/** Removes one deleted class from the device, plus learners who are no longer in any cached class. */
export async function clearOfflineClass(classId: string) {
  await clearDays(activeTeacher(),true,classId);
  const db = offlineDb;
  if (!db) return;
  await db.transaction("rw", db.classes, db.learners, db.enrollments, db.syncQueue, async () => {
    const enrollments = await db.enrollments.where("classId").equals(classId).toArray();
    const learnerIds = [...new Set(enrollments.map((enrollment) => enrollment.learnerId))];

    await db.enrollments.where("classId").equals(classId).delete();
    await db.classes.delete(classId);
    await db.syncQueue.where("entityId").equals(classId).delete();

    for (const learnerId of learnerIds) {
      const remaining = await db.enrollments.where("learnerId").equals(learnerId).count();
      if (remaining === 0) await db.learners.delete(learnerId);
    }
  });
}