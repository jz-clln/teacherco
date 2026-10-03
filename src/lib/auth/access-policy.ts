import type { AccessProfile } from "@/features/invites/types";

export function accessDestination(verified: boolean, profile: AccessProfile | null): string {
  if (!verified) return "/verify-email";
  if (!profile) return "/invite";
  if (profile.access_status === "suspended") return "/suspended";
  if (profile.access_status !== "active") return "/invite";
  return profile.onboarding_completed ? "/today" : "/onboarding";
}

export function routeAccessRedirect(path: string, verified: boolean, profile: AccessProfile | null): string | null {
  const destination = accessDestination(verified, profile);
  if (path === "/login" || path === "/signup" || path === "/") return destination;
  if (destination === "/verify-email") return path === destination ? null : destination;
  if (destination === "/suspended") return path === destination ? null : destination;
  if (destination === "/invite") return path === "/invite" || path === "/request-access" ? null : destination;
  if (["/invite", "/request-access", "/suspended", "/verify-email"].includes(path)) return destination;
  if (destination === "/onboarding" && path !== "/onboarding") return destination;
  if (destination === "/today" && path === "/onboarding") return destination;
  return null;
}
