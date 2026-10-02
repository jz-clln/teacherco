// src/app/(dashboard)/settings/page.tsx

import { redirect } from "next/navigation";
import { Database, KeyRound, Languages, ListChecks, Sparkles, User, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { DataControls } from "@/features/settings/data-controls";
import { OfflineControls } from "@/features/settings/offline-controls";
import { PasswordForm } from "@/features/settings/password-form";
import { AiPrivacyForm, AttentionForm, LanguageForm } from "@/features/settings/preference-forms";
import { ProfileForm } from "@/features/settings/profile-form";
import { SettingsSection } from "@/features/settings/settings-ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

const sections = [
  { id: "profile", label: "Profile" },
  { id: "language", label: "Language" },
  { id: "attention", label: "Attention rules" },
  { id: "ai", label: "AI & privacy" },
  { id: "data", label: "Data & storage" },
  { id: "offline", label: "Offline" },
  { id: "account", label: "Account" },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: classes }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, preferred_name, school_type, school_name, grade_bands, preferred_language, ai_reply_language, ai_enabled, ai_include_notes, default_retention_mode, default_benchmark, absence_threshold, missing_work_threshold, performance_drop_threshold",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("classes")
      .select("id, name, subject, grade_level, school_year")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const classRows = (classes ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    subject: row.subject as string,
    gradeLevel: row.grade_level as string,
    schoolYear: row.school_year as string,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[#4F6F52]">SETTINGS</p>
        <h1 className="mt-1 text-3xl font-bold">TeacherCo preferences</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#606861]">
          Your profile, your attention rules, and what happens to your data. Privacy controls are always here, not buried.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:gap-8">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:h-fit lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#606861] transition hover:bg-[#EAF0EA] hover:text-[#1A4D2E]"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="grid min-w-0 gap-6">
          <SettingsSection id="profile" icon={User} title="Profile" description="How TeacherCo addresses you and which levels you teach.">
            <ProfileForm
              values={{
                fullName: profile?.full_name ?? "",
                preferredName: profile?.preferred_name ?? "",
                schoolType: profile?.school_type === "public" || profile?.school_type === "private" ? profile.school_type : null,
                schoolName: profile?.school_name ?? "",
                gradeBands: profile?.grade_bands ?? [],
              }}
            />
          </SettingsSection>

          <SettingsSection id="language" icon={Languages} title="Language" description="English, Filipino, or a mix of both.">
            <LanguageForm
              preferredLanguage={profile?.preferred_language === "fil" ? "fil" : "en"}
              aiReplyLanguage={profile?.ai_reply_language === "en" || profile?.ai_reply_language === "fil" ? profile.ai_reply_language : "auto"}
            />
          </SettingsSection>

          <SettingsSection
            id="attention"
            icon={ListChecks}
            title="Attention rules"
            description="These rules decide who appears under Needs Attention and on Today. They are plain numbers, so you can always see why a learner was flagged."
          >
            <AttentionForm
              benchmark={Number(profile?.default_benchmark ?? 75)}
              absenceThreshold={profile?.absence_threshold ?? 5}
              missingWorkThreshold={profile?.missing_work_threshold ?? 3}
              dropThreshold={Number(profile?.performance_drop_threshold ?? 10)}
              classCount={classRows.length}
            />
          </SettingsSection>

          <SettingsSection id="ai" icon={Sparkles} title="AI & privacy" description="AI explains and summarizes. TeacherCo's calculation engine produces every number.">
            <AiPrivacyForm aiEnabled={profile?.ai_enabled ?? true} includeNotes={profile?.ai_include_notes ?? false} />
          </SettingsSection>

          <SettingsSection id="data" icon={Database} title="Data & storage" description="Keep, export, or permanently delete your classroom information.">
            <DataControls
              classes={classRows}
              retentionMode={profile?.default_retention_mode === "delete_after_processing" ? "delete_after_processing" : "keep"}
            />
          </SettingsSection>

          <SettingsSection id="offline" icon={WifiOff} title="Offline" description="What TeacherCo has saved on this device.">
            <OfflineControls />
          </SettingsSection>

          <SettingsSection id="account" icon={KeyRound} title="Account" description={`Signed in as ${user.email ?? "your account"}.`}>
            <PasswordForm />
            <form action={signOut} className="mt-8 border-t border-[#E3E5E1] pt-6">
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}