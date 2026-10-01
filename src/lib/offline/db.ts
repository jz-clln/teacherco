import Dexie, { type Table } from "dexie";

export type OfflineClass = { id: string; name: string; subject: string; gradeLevel: string; schoolYear: string; updatedAt: string };
export type OfflineLearner = { id: string; teacherId: string; displayName: string; updatedAt: string };
export type OfflineEnrollment = { id: string; classId: string; learnerId: string; status: "active" | "inactive"; updatedAt: string };
export type SyncQueueItem = { id?: number; entity: string; entityId: string; operation: "upsert" | "delete"; payload: unknown; createdAt: string };

class TeacherCoDB extends Dexie {
  classes!: Table<OfflineClass, string>;
  learners!: Table<OfflineLearner, string>;
  enrollments!: Table<OfflineEnrollment, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("teacherco");
    this.version(1).stores({
      classes: "id, updatedAt",
      learners: "id, teacherId, updatedAt",
      enrollments: "id, classId, learnerId, updatedAt",
      syncQueue: "++id, entity, entityId, createdAt",
    });
  }
}

export const offlineDb = typeof window === "undefined" ? null : new TeacherCoDB();
