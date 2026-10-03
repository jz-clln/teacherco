import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActivityChoicesByClass } from "@/features/exams/activity-slots";
import { defaultActivitySlots } from "@/lib/exams/activity-slots";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
type Db = NonNullable<Parameters<typeof getActivityChoicesByClass>[1]>;
type Assessment = { class_id: string; id: string; title: string; source: string; activity_slot: string | null; exported_title: string | null };
const slot = defaultActivitySlots()[0];
let rows: Assessment[];
let configError: boolean;

function fakeDatabase() {
  const ranges = vi.fn(async (ids: string[], from: number, to: number) => ({
    data: rows.filter((row) => ids.includes(row.class_id)).slice(from, to + 1), error: null,
  }));
  const from = vi.fn((table: string) => ({ select: () => ({ in: (_column: string, ids: string[]) => table === "class_grading_config"
    ? Promise.resolve({ data: [], error: configError ? { message: "unavailable" } : null })
    : { order: () => ({ range: (start: number, end: number) => ranges(ids, start, end) }) },
  }) }));
  return { db: { from } as unknown as Db, from, ranges };
}

beforeEach(() => { rows = []; configError = false; });

describe("batched class record activity reads", () => {
  it("uses two queries for ten classes and keeps assignments scoped to the correct class", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `class-${i}`);
    rows = ids.map((class_id, i) => ({ class_id, id: `assessment-${i}`, title: `Project ${i}`, source: "manual", activity_slot: slot.title, exported_title: null }));
    const { db, from } = fakeDatabase();
    const result = await getActivityChoicesByClass(ids, db);
    expect(from).toHaveBeenCalledTimes(2);
    for (const [i, id] of ids.entries()) {
      expect(result.get(id)?.[0].assessmentId).toBe(`assessment-${i}`);
      expect(result.get(id)?.[1].assessmentId).toBeUndefined();
    }
  });
  it("reads subsequent pages so occupied slots beyond the first 1000 rows stay unavailable", async () => {
    rows = Array.from({ length: 1000 }, (_, i) => ({ class_id: "class-1", id: String(i), title: "Legacy activity", source: "manual", activity_slot: null, exported_title: null }));
    rows.push({ class_id: "class-1", id: "last", title: "Existing project", source: "manual", activity_slot: slot.title, exported_title: null });
    const { db, ranges } = fakeDatabase();
    const result = await getActivityChoicesByClass(["class-1"], db);
    expect(ranges).toHaveBeenCalledTimes(2);
    expect(result.get("class-1")?.[0].assessmentId).toBe("last");
  });
  it("fails closed when activity configuration cannot be read", async () => {
    configError = true;
    const { db } = fakeDatabase();
    await expect(getActivityChoicesByClass(["class-1"], db)).rejects.toThrow("Could not load activity choices");
  });
  it("does no work for an empty class list", async () => {
    const { db, from } = fakeDatabase();
    expect((await getActivityChoicesByClass([], db)).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});
