import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/lib/auth/access-guard", () => ({ getAccessContext: mocks.context }));
vi.mock("@/components/landing/landing-page", () => ({ LandingPage: () => null }));
import HomePage from "@/app/page";
import { routeAccessRedirect } from "@/lib/auth/access-policy";

beforeEach(() => vi.clearAllMocks());
describe("public landing access", () => {
  it("shows the public page for logged-out visitors", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await HomePage()).props.destination).toBeNull();
  });
  it.each([
    ["pending", false, "/invite"],
    ["active", false, "/onboarding"],
    ["active", true, "/today"],
    ["suspended", true, "/suspended"],
  ] as const)("keeps %s accounts on the landing page with a %s onboarding state", async (access_status, onboarding_completed, destination) => {
    const profile = { access_status, onboarding_completed, role: "teacher" as const };
    mocks.context.mockResolvedValue({ user: { email_confirmed_at: "2026-10-03" }, profile });
    expect((await HomePage()).props.destination).toBe(destination);
    expect(routeAccessRedirect("/", true, profile)).toBeNull();
  });
  it("preserves verification for unverified accounts", async () => {
    mocks.context.mockResolvedValue({ user: { email_confirmed_at: null }, profile: { access_status: "pending" } });
    expect((await HomePage()).props.destination).toBe("/verify-email");
  });
  it("still renders public content if account lookup fails", async () => {
    mocks.context.mockRejectedValue(new Error("offline"));
    expect((await HomePage()).props.destination).toBeNull();
  });
});
