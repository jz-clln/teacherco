import { describe, expect, it } from "vitest";
import { activitySlotSchema, defaultActivitySlots } from "@/lib/exams/activity-slots";

describe("three-term class record", () => {
  it("matches the sample record's eleven activities in each of three terms", () => {
    const slots = defaultActivitySlots();
    expect(slots).toHaveLength(33);
    expect([...new Set(slots.map((s) => s.term))]).toEqual([1, 2, 3]);
    for (const term of [1, 2, 3]) {
      const activities = slots.filter((s) => s.term === term);
      expect(activities.filter((s) => s.component === "written_work")).toHaveLength(5);
      expect(activities.filter((s) => s.component === "performance_task")).toHaveLength(3);
      expect(activities.filter((s) => s.component === "assessment")).toHaveLength(3);
    }
  });
  it("rejects a fourth term", () => {
    expect(activitySlotSchema.safeParse({ title: "Term 4 · Written Work 1", term: 4, component: "written_work" }).success).toBe(false);
  });
});
