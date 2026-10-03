import { describe, expect, it } from "vitest";
import { accessDestination, routeAccessRedirect } from "@/lib/auth/access-policy";
import { formatInviteKeystroke, inviteCodeSchema } from "@/features/invites/validation";
import type { AccessProfile } from "@/features/invites/types";

const profile = (access_status: AccessProfile["access_status"], onboarding_completed = false): AccessProfile => ({ access_status, onboarding_completed, role: "teacher" });
describe("access routing", () => {
  it("sends pending accounts to invite and lets them return later", () => {
    expect(routeAccessRedirect("/today", true, profile("pending"))).toBe("/invite");
    expect(routeAccessRedirect("/login", true, profile("pending"))).toBe("/invite");
    expect(routeAccessRedirect("/invite", true, profile("pending"))).toBeNull();
    expect(routeAccessRedirect("/request-access", true, profile("pending"))).toBeNull();
  });
  it("keeps active accounts out of invite and completes onboarding first", () => {
    expect(routeAccessRedirect("/invite", true, profile("active"))).toBe("/onboarding");
    expect(routeAccessRedirect("/invite", true, profile("active", true))).toBe("/today");
    expect(routeAccessRedirect("/onboarding", true, profile("active"))).toBeNull();
    expect(routeAccessRedirect("/onboarding", true, profile("active", true))).toBe("/today");
    expect(routeAccessRedirect("/classes", true, profile("active", true))).toBeNull();
  });
  it("blocks suspended accounts without a redirect loop", () => {
    expect(routeAccessRedirect("/today", true, profile("suspended", true))).toBe("/suspended");
    expect(routeAccessRedirect("/invite", true, profile("suspended"))).toBe("/suspended");
    expect(routeAccessRedirect("/suspended", true, profile("suspended"))).toBeNull();
  });
  it("requires email verification and never assumes a missing profile is active", () => {
    expect(accessDestination(false, profile("active", true))).toBe("/verify-email");
    expect(accessDestination(true, null)).toBe("/invite");
  });
});
describe("case-sensitive invite input", () => {
  it("inserts hyphens while typing without changing letter case", () => {
    let value = "";
    for (const letter of "a7K2P9XM4QTR") value = formatInviteKeystroke(value, value + letter, "insertText");
    expect(value).toBe("a7K2-P9XM-4QTR");
  });
  it("does not repair malformed pasted text", () => {
    for (const value of ["A7K2P9XM4QTR", "A7K2--P9XM-4QTR", " A7K2-P9XM-4QTR", "A7K2 P9XM 4QTR"]) {
      expect(formatInviteKeystroke("", value, "insertFromPaste")).toBe(value);
      expect(inviteCodeSchema.safeParse(value).success).toBe(false);
    }
    expect(inviteCodeSchema.safeParse("A7K2-P9XM-4QTR").success).toBe(true);
  });
  it("limits typed alphanumerics to twelve", () => {
    expect(formatInviteKeystroke("A7K2-P9XM-4QTR", "A7K2-P9XM-4QTRX", "insertText")).toBe("A7K2-P9XM-4QTR");
  });
});
