"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccessContext, requireAdmin } from "@/lib/auth/access-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteCode } from "./code-generator";
import { INVALID_INVITE, inviteCodeSchema, requestAccessSchema } from "./validation";
import type { InviteState } from "./types";

export async function redeemInvite(raw: string): Promise<InviteState> {
  const context = await getAccessContext();
  if (!context || !context.user.email_confirmed_at) return { error: INVALID_INVITE };
  if (context.profile.access_status === "active") return { success: "Access activated" };
  if (context.profile.access_status !== "pending" || !inviteCodeSchema.safeParse(raw).success) return { error: INVALID_INVITE };
  try {
    const { data, error } = await createAdminClient().rpc("redeem_invite_code", { p_user_id: context.user.id, p_code: raw });
    if (error || data !== true) return { error: INVALID_INVITE };
    revalidatePath("/", "layout");
    return { success: "Access activated" };
  } catch {
    return { error: INVALID_INVITE };
  }
}

export async function requestAccess(input: unknown): Promise<InviteState> {
  const context = await getAccessContext();
  if (!context || !context.user.email_confirmed_at || context.profile.access_status !== "pending") return { error: "Sign in with a pending account to request access." };
  const parsed = requestAccessSchema.safeParse(input);
  if (!parsed.success || parsed.data.email !== context.user.email) return { error: "Use your account email and check the request details." };
  try {
    const { error } = await createAdminClient().from("access_requests").insert({
      user_id: context.user.id, ...parsed.data, message: parsed.data.message || null,
    });
    if (error?.code === "23505") return { success: "Your request is already on file. An administrator will review it manually." };
    if (error) return { error: "Could not submit your request. Please try again." };
    return { success: "Request received. An administrator will review it manually. This does not activate your account." };
  } catch { return { error: "Could not submit your request. Please try again." }; }
}

export async function generateCode(email: string): Promise<InviteState> {
  await requireAdmin();
  const restriction = email === "" ? null : z.string().email().max(254).safeParse(email);
  if (restriction && !restriction.success) return { error: "Enter a valid email address or leave it blank." };
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateInviteCode();
    const history = await admin.from("invite_code_redemptions").select("id").eq("code", code).limit(1);
    if (history.error) return { error: "Could not generate a code. Please try again." };
    if (history.data?.length) continue;
    const { error } = await admin.from("invite_codes").insert({ code, email_restriction: restriction?.data ?? null });
    if (error?.code === "23505") continue;
    if (error) return { error: "Could not generate a code. Please try again." };
    revalidatePath("/admin/invites");
    return { success: `Invite code generated: ${code}` };
  }
  return { error: "Could not generate a unique code. Please try again." };
}

export async function manageCode(id: string, operation: "disable" | "reactivate" | "delete"): Promise<InviteState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success || !["disable", "reactivate", "delete"].includes(operation)) return { error: "Invalid operation." };
  const admin = createAdminClient();
  const query = operation === "delete"
    ? admin.from("invite_codes").delete().eq("id", id)
    : admin.from("invite_codes").update({ is_active: operation === "reactivate" }).eq("id", id);
  const { data, error } = await query.select("id");
  if (error || !data?.length) return { error: "Could not update this code. Refresh and try again." };
  revalidatePath("/admin/invites");
  return { success: operation === "delete" ? "Code deleted. Redemption history and activated access are preserved." : "Code updated. Used codes cannot be redeemed again." };
}

export async function reviewRequest(id: string, status: "approved" | "rejected"): Promise<InviteState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success || !["approved", "rejected"].includes(status)) return { error: "Invalid request." };
  const { data, error } = await createAdminClient().from("access_requests").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "Could not update the request." };
  revalidatePath("/admin/invites");
  return { success: "Request reviewed. No code was generated and no access was granted." };
}
