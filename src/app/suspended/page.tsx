import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/access-guard";
import { accessDestination } from "@/lib/auth/access-policy";
import { AccessCard } from "@/features/invites/components/access-card";

export const metadata = { title: "Access suspended" };
export default async function SuspendedPage() {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  const destination = accessDestination(!!context.user.email_confirmed_at, context.profile);
  if (destination !== "/suspended") redirect(destination);
  return <AccessCard title="Access suspended" description="Your TeacherCo access has been suspended. Contact the TeacherCo administrator who provided your invitation for assistance.">
    <p className="text-sm text-[#606861]">Entering another invite code will not restore a suspended account.</p>
  </AccessCard>;
}
