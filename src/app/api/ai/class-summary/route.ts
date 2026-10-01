import { NextResponse } from "next/server";
import { ClassEvidenceSchema } from "@/lib/ai/schemas";
import { buildPseudonymizedEvidence } from "@/lib/ai/privacy";

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = ClassEvidenceSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid evidence payload", details: parsed.error.flatten() }, { status: 400 });

  const safeEvidence = buildPseudonymizedEvidence(parsed.data);

  // Provider intentionally not wired yet. This route demonstrates the boundary:
  // validated deterministic evidence -> privacy minimization -> AI provider.
  return NextResponse.json({
    status: "provider_not_configured",
    safeEvidence,
    message: "Connect an AI provider in src/lib/ai/provider.ts after the evidence layer is implemented.",
  }, { status: 501 });
}
