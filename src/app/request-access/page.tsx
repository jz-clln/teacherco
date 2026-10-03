import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/access-guard";
import { accessDestination } from "@/lib/auth/access-policy";
import { AccessCard } from "@/features/invites/components/access-card";
import { RequestAccessForm } from "@/features/invites/components/request-form";

export const metadata = { title: "Request access" };
export default async function RequestAccessPage() {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  const destination = accessDestination(!!context.user.email_confirmed_at, context.profile);
  if (destination !== "/invite") redirect(destination);
  return <AccessCard title="Request access" description="Tell us who you are. Requests are reviewed manually and do not automatically activate your account.">
    <RequestAccessForm name={String(context.user.user_metadata?.full_name ?? "")} email={context.user.email ?? ""} />
  </AccessCard>;
}
