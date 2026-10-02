// src/features/reports/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buildClassReportEvidence, buildLearnerReportEvidence } from "@/lib/evidence/reports";
import { writeNarrative, type GenerationMeta, type NarrativeLanguage } from "@/lib/ai/report-narrative";
import { createClient } from "@/lib/supabase/server";
import { loadLearnerNotes, loadReportInput } from "./queries";

export type ReportState = {
  error?: string;
  success?: string;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const GenerateSchema = z.object({
  reportType: z.enum(["class_performance", "learner_progress"]),
  classId: z.string().uuid(),
  learnerId: z.string().uuid().optional(),
});

export async function generateReport(_previousState: ReportState, formData: FormData): Promise<ReportState> {
  const parsed = GenerateSchema.safeParse({
    reportType: formData.get("reportType"),
    classId: formData.get("classId"),
    learnerId: String(formData.get("learnerId") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "Choose a class to report on." };

  const { reportType, classId, learnerId } = parsed.data;
  if (reportType === "learner_progress" && !learnerId) {
    return { error: "Choose a learner for the Learner Progress Summary." };
  }

  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language, ai_reply_language, ai_enabled, ai_include_notes, absence_threshold, performance_drop_threshold")
    .eq("id", user.id)
    .maybeSingle();

  const thresholds = {
    absences: Number(profile?.absence_threshold ?? 5),
    dropPoints: Number(profile?.performance_drop_threshold ?? 10),
  };

  let input;
  try {
    input = await loadReportInput(supabase, classId, thresholds);
  } catch {
    return { error: "TeacherCo could not read your class records. Please try again." };
  }
  if (!input) return { error: "That class could not be found." };
  if (input.scores.length === 0) {
    return {
      error:
        "This class has no confirmed scores yet. Import a record or check an assessment first, then come back to generate the report.",
    };
  }

  const evidence =
    reportType === "class_performance" ? buildClassReportEvidence(input) : buildLearnerReportEvidence(input, learnerId!);
  if (!evidence) return { error: "That learner is not in this class." };
  if (evidence.kind === "learner_progress" && evidence.average == null) {
    return { error: "This learner has no confirmed scores yet." };
  }

  const language: NarrativeLanguage =
    profile?.ai_reply_language === "en" || profile?.ai_reply_language === "fil"
      ? profile.ai_reply_language
      : profile?.preferred_language === "fil"
        ? "fil"
        : "en";

  const notes =
    evidence.kind === "learner_progress" && profile?.ai_include_notes === true
      ? await loadLearnerNotes(supabase, evidence.learner.id)
      : [];

  const narrative = await writeNarrative(evidence, {
    aiEnabled: profile?.ai_enabled !== false,
    language,
    notes,
  });

  const generation: GenerationMeta = {
    source: narrative.source,
    provider: narrative.provider,
    model: narrative.model,
    fallbackReason: narrative.fallbackReason,
    language,
    generatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("reports")
    .insert({
      teacher_id: user.id,
      class_id: classId,
      learner_id: reportType === "learner_progress" ? learnerId : null,
      report_type: reportType,
      evidence_snapshot: { ...evidence, generation },
      generated_content: narrative.text,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: "TeacherCo could not save the report. Please try again." };

  revalidatePath("/reports");
  redirect(`/reports/${data.id}`);
}

const SaveSchema = z.object({
  reportId: z.string().uuid(),
  content: z.string().min(1).max(20000),
  status: z.enum(["draft", "final"]),
});

export async function saveReport(_previousState: ReportState, formData: FormData): Promise<ReportState> {
  const reportId = z.string().uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) return { error: "That report could not be found." };

  const { supabase } = await requireUser();

  if (formData.get("intent") === "restore") {
    const { error } = await supabase.from("reports").update({ teacher_edited_content: null }).eq("id", reportId.data);
    if (error) return { error: "TeacherCo could not restore the original text." };
    revalidatePath(`/reports/${reportId.data}`);
    return { success: "Original text restored." };
  }

  // Browsers submit textarea line breaks as CRLF.
  const content = String(formData.get("content") ?? "").replace(/\r\n/g, "\n").trim();
  const parsed = SaveSchema.safeParse({ reportId: reportId.data, content, status: formData.get("status") });
  if (!parsed.success) return { error: "Write something before saving (up to 20,000 characters)." };

  const { data: report } = await supabase.from("reports").select("generated_content").eq("id", parsed.data.reportId).maybeSingle();
  if (!report) return { error: "That report could not be found." };

  // Identical to the original means the teacher did not edit anything.
  const edited = parsed.data.content === String(report.generated_content ?? "").trim() ? null : parsed.data.content;

  const { error } = await supabase
    .from("reports")
    .update({ teacher_edited_content: edited, status: parsed.data.status })
    .eq("id", parsed.data.reportId);
  if (error) return { error: "TeacherCo could not save your changes. Please try again." };

  revalidatePath(`/reports/${parsed.data.reportId}`);
  revalidatePath("/reports");
  return { success: "Saved." };
}

export async function deleteReport(formData: FormData) {
  const reportId = z.string().uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) redirect("/reports");

  const { supabase } = await requireUser();
  await supabase.from("reports").delete().eq("id", reportId.data);

  revalidatePath("/reports");
  redirect("/reports?deleted=1");
}