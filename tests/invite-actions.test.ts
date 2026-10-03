// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const state = vi.hoisted(() => ({
  user: { id: "teacher-id", email: "teacher@example.com", email_confirmed_at: "2026-10-03" } as { id: string; email: string; email_confirmed_at: string | null } | null,
  profile: { access_status: "active", role: "teacher", onboarding_completed: true },
  admin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => state.user, createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }),
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }));

import { generateCode, manageCode, redeemInvite, requestAccess } from "@/features/invites/actions";
import { generateInviteCode } from "@/features/invites/code-generator";
import { requireAccess } from "@/lib/auth/access-guard";
import { INVALID_INVITE } from "@/features/invites/validation";

beforeEach(() => {
  state.user = { id: "teacher-id", email: "teacher@example.com", email_confirmed_at: "2026-10-03" };
  state.profile = { access_status: "active", role: "teacher", onboarding_completed: true };
  state.admin.mockReset();
});

describe("server authorization", () => {
  it("rejects non-admin generation before accessing privileged credentials", async () => {
    await expect(generateCode("")).rejects.toThrow("Administrator access required");
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("rejects non-admin deletion before accessing privileged credentials", async () => {
    await expect(manageCode(randomUUID(), "delete")).rejects.toThrow("Administrator access required");
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("rejects suspended admins", async () => {
    state.profile.role = "admin"; state.profile.access_status = "suspended";
    await expect(generateCode("")).rejects.toThrow("REDIRECT:/suspended");
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("redirects unauthenticated guards to login", async () => {
    state.user = null;
    await expect(requireAccess()).rejects.toThrow("REDIRECT:/login");
  });
  it("retries a generated collision and returns the successfully stored code", async () => {
    state.profile.role = "admin";
    const insert = vi.fn().mockResolvedValueOnce({ error: { code: "23505" } }).mockResolvedValueOnce({ error: null });
    state.admin.mockReturnValue({ from: (table: string) => table === "invite_codes" ? { insert } : { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) } });
    const result = await generateCode("teacher@example.com");
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0].email_restriction).toBe("teacher@example.com");
    expect(result.success).toContain(insert.mock.calls[1][0].code);
  });
  it("passes only the verified session user id to the redemption transaction", async () => {
    state.profile.access_status = "pending";
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    state.admin.mockReturnValue({ rpc });
    expect(await redeemInvite("A7K2-P9XM-4QTR")).toEqual({ success: "Access activated" });
    expect(rpc).toHaveBeenCalledWith("redeem_invite_code", { p_user_id: "teacher-id", p_code: "A7K2-P9XM-4QTR" });
  });
  it("uses the same generic failure for malformed and unavailable codes", async () => {
    state.profile.access_status = "pending";
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    state.admin.mockReturnValue({ rpc });
    expect(await redeemInvite("A7K2P9XM4QTR")).toEqual({ error: INVALID_INVITE });
    expect(rpc).not.toHaveBeenCalled();
    expect(await redeemInvite("A7K2-P9XM-4QTR")).toEqual({ error: INVALID_INVITE });
  });
  it("handles already-active users without consuming another code", async () => {
    expect(await redeemInvite("A7K2-P9XM-4QTR")).toEqual({ success: "Access activated" });
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("does not accept an access request for someone else's email", async () => {
    state.profile.access_status = "pending";
    expect((await requestAccess({ name: "Teacher", email: "other@example.com", message: "" })).error).toBeTruthy();
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("stores requests without activating accounts or generating codes", async () => {
    state.profile.access_status = "pending";
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    state.admin.mockReturnValue({ from });
    expect((await requestAccess({ name: "Teacher", email: "teacher@example.com", message: "Please invite me" })).success).toBeTruthy();
    expect(from).toHaveBeenCalledExactlyOnceWith("access_requests");
    expect(insert).toHaveBeenCalledWith({ user_id: "teacher-id", name: "Teacher", email: "teacher@example.com", message: "Please invite me" });
  });
});

it("generates uppercase 12-character codes without ambiguous characters", () => {
  const codes = new Set(Array.from({ length: 500 }, generateInviteCode));
  expect(codes.size).toBe(500);
  for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
});
