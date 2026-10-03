import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/access-guard";
import { accessDestination } from "@/lib/auth/access-policy";
import { AccessCard } from "@/features/invites/components/access-card";

export const metadata = { title: "Verify your email" };
export default async function VerifyEmailPage() {
  const context = await getAccessContext();
  if (context?.user.email_confirmed_at) redirect(accessDestination(true, context.profile));
  return <AccessCard title="Check your email" description="Open the TeacherCo confirmation email and verify your address. Then sign in to enter your invite code.">
    <p className="text-sm text-[#606861]">Check your spam folder if the message has not arrived.</p>
    <Link href="/login" className="mt-5 inline-block font-semibold text-[#1A4D2E] hover:underline">Return to sign in</Link>
  </AccessCard>;
}
