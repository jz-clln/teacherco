import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/access-guard";
import { accessDestination } from "@/lib/auth/access-policy";
import { AccessCard } from "@/features/invites/components/access-card";
import { InviteForm } from "@/features/invites/components/invite-form";

export const metadata = { title: "Enter Invite Code" };
export default async function InvitePage() {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  const destination = accessDestination(!!context.user.email_confirmed_at, context.profile);
  if (destination !== "/invite") redirect(destination);
  return <AccessCard title="Enter Invite Code" description="TeacherCo is currently available by invitation. Enter your invite code to continue."><InviteForm /></AccessCard>;
}
