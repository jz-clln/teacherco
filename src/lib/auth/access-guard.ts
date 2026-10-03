import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { accessDestination } from "./access-policy";
import type { AccessProfile } from "@/features/invites/types";

// React discards this cache at the end of the render request. Status changes remain
// visible on the next request; a layout and page can share the same verified read.
export const getAccessContext = cache(async () => {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) return null;
  const { data, error: profileError } = await supabase.from("profiles")
    .select("access_status,role,onboarding_completed").eq("id", user.id).maybeSingle();
  if (profileError || !data) throw new Error("Could not verify account access. Please try again.");
  return { supabase, user, profile: data as AccessProfile };
});

export async function requireAccess(options: { onboarded?: boolean } = {}) {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  const destination = accessDestination(!!context.user.email_confirmed_at, context.profile);
  if (destination !== "/today" && !(destination === "/onboarding" && !options.onboarded)) redirect(destination);
  return context;
}

export async function requireAdmin() {
  const context = await requireAccess();
  if (context.profile.role !== "admin") throw new Error("Administrator access required.");
  return context;
}
