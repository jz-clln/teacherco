// src/app/api/ai/class-summary/route.ts

import { NextResponse } from "next/server";
import { ClassEvidenceSchema } from "@/lib/ai/schemas";
import { buildPseudonymizedEvidence } from "@/lib/ai/privacy";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_enabled, ai_include_notes, ai_reply_language")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.ai_enabled === false) {
    return NextResponse.json(
      { status: "ai_disabled", message: "AI assistance is turned off in Settings." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ClassEvidenceSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid evidence payload", details: parsed.error.flatten() }, { status: 400 });

  const safeEvidence = buildPseudonymizedEvidence(parsed.data, {
    includeNotes: profile?.ai_include_notes === true,
  });

  // Provider intentionally not wired yet. This route demonstrates the boundary:
  // validated deterministic evidence -> privacy minimization -> AI provider.
  return NextResponse.json({
    status: "provider_not_configured",
    replyLanguage: profile?.ai_reply_language ?? "auto",
    safeEvidence,
    message: "Connect an AI provider in src/lib/ai/provider.ts after the evidence layer is implemented.",
  }, { status: 501 });
}