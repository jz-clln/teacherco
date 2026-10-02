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
  return { classes, learners, pendingChanges };
}

/** Clears cached classroom data. Changes still waiting to sync are kept. */
export async function clearOfflineCache() {
  const db = offlineDb;
  if (!db) return;
  await db.transaction("rw", db.classes, db.learners, db.enrollments, async () => {
    await Promise.all([db.classes.clear(), db.learners.clear(), db.enrollments.clear()]);
  });
}

/** Clears everything, including unsynced changes. Used after the teacher deletes all data. */
export async function clearAllOfflineData() {
  const db = offlineDb;
  if (!db) return;
  await db.transaction("rw", db.classes, db.learners, db.enrollments, db.syncQueue, async () => {
    await Promise.all([db.classes.clear(), db.learners.clear(), db.enrollments.clear(), db.syncQueue.clear()]);
  });
}

/** Removes one deleted class from the device, plus learners who are no longer in any cached class. */
export async function clearOfflineClass(classId: string) {
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