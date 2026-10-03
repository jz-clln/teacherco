import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), existing: vi.fn(), eq: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "teacher" } } }) },
  from: (table: string) => table === "profiles"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_benchmark: 80 } }) }) }) }
    : {
      insert: (value: unknown) => { mocks.insert(value); return { select: () => ({ single: async () => ({ error: { code: "23505" } }) }) }; },
      select: () => { const query = { eq: (...args: unknown[]) => { mocks.eq(...args); return query; }, maybeSingle: mocks.existing }; return query; },
    },
}) }));
import { createClass } from "@/features/classes/actions";
beforeEach(() => vi.clearAllMocks());
function data() {
  const form = new FormData();
  Object.entries({ requestId: "e576c715-3818-4d34-92fc-cd9b5a8b841e", name: "Einstein", subject: "Science", schoolYear: "2026-2027", gradeLevel: "Grade 6" }).forEach(([key, value]) => form.set(key, value));
  return form;
}
it("returns the already-created class for a repeated request", async () => {
  const form = data();
  mocks.existing.mockResolvedValue({ data: { id: form.get("requestId") } });
  expect(await createClass(form)).toEqual({ id: form.get("requestId") });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ id: form.get("requestId"), teacher_id: "teacher", benchmark: 80 }));
  expect(mocks.eq).toHaveBeenCalledWith("teacher_id", "teacher");
});
it("does not return a conflicting class inaccessible to the teacher", async () => {
  mocks.existing.mockResolvedValue({ data: null });
  expect(await createClass(data())).toEqual({ error: expect.any(String) });
});
it("rejects submissions without a valid request ID", async () => {
  const form = data();
  form.delete("requestId");
  expect(await createClass(form)).toEqual({ error: expect.any(String) });
  expect(mocks.insert).not.toHaveBeenCalled();
});
