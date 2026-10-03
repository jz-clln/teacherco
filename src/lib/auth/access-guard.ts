import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accessDestination } from "./access-policy";
import type { AccessProfile } from "@/features/invites/types";

export async function getAccessContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data, error: profileError } = await supabase.from("profiles")
    .select("access_status,role,onboarding_completed").eq("id", user.id).maybeSingle();
  if (profileError || !data) throw new Error("Could not verify account access. Please try again.");
  return { supabase, user, profile: data as AccessProfile };
}

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
