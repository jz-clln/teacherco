import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/auth/access-guard", () => ({ requireAccess: mocks.access }));
import { latestClassChanges, ownedClass } from "@/features/classes/overview-data";
const id = "a973122e-2d97-41f4-99c1-57f91ba97cb2";
beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: mocks.select, eq: mocks.eq, order: mocks.order, limit: mocks.limit, maybeSingle: mocks.maybeSingle };
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.order, mocks.limit]) fn.mockReturnValue(chain);
  mocks.access.mockResolvedValue({ supabase: { from: mocks.from }, user: { id: "owner" } });
  mocks.maybeSingle.mockResolvedValue({ data: { id, benchmark: 75 }, error: null });
});
it("verifies active access before issuing a class query", async () => {
  mocks.access.mockRejectedValue(new Error("SUSPENDED"));
  await expect(ownedClass(id)).rejects.toThrow("SUSPENDED"); expect(mocks.from).not.toHaveBeenCalled();
});
it("checks class ownership explicitly and fails closed for nonowners", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(ownedClass(id)).rejects.toThrow("NOT_FOUND"); expect(mocks.eq).toHaveBeenCalledWith("teacher_id", "owner");
});
it("loads one latest version with only required projections", async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: { id, benchmark: 75 }, error: null }).mockResolvedValueOnce({ data: null, error: null });
  expect(await latestClassChanges(id)).toEqual({ status: "empty" });
  expect(mocks.limit).toHaveBeenCalledWith(1);
  const fields = mocks.select.mock.calls[1][0];
  expect(fields).toContain("before_snapshot->scores"); expect(fields).not.toContain("uploaded_snapshot"); expect(fields).not.toContain("attendance"); expect(fields).not.toContain("*");
});
it("does not disguise a history read failure as an empty history", async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: { id, benchmark: 75 }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "network" } });
  expect(await latestClassChanges(id)).toEqual({ status: "error" });
});
