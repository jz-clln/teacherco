import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/access-guard";
import { accessDestination, accessExpired } from "@/lib/auth/access-policy";
import { AccessCard } from "@/features/invites/components/access-card";
import { InviteForm } from "@/features/invites/components/invite-form";

export const metadata = { title: "Enter Invite Code" };
export default async function InvitePage() {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  const destination = accessDestination(!!context.user.email_confirmed_at, context.profile);
  const expired=accessExpired(context.profile)&&!!context.user.email_confirmed_at;
  if (destination !== "/invite"&&!expired) redirect(destination);
  return <AccessCard title={expired?'Renew your access':'Enter Invite Code'} description={expired?'Your access has expired. Your records are safe and remain viewable. Enter a new 7-day or 30-day code to enable editing again.':'Enter an invite code to start your 7-day or 30-day access period.'}><InviteForm /><a href="/today" className="tc-button tc-quiet">Back to TeacherCo</a></AccessCard>;
}
