import { redirect } from "next/navigation";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, preferred_name, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) redirect("/today");

  const fullName = profile?.full_name || String(user.user_metadata?.full_name ?? "Teacher");

  return (
    <OnboardingForm
      fullName={fullName}
      existingPreferredName={profile?.preferred_name}
    />
  );
}
