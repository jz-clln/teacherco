// POST multipart: assessmentId, image
// Stores the photo in the private assessment-images bucket, asks the vision
// model to read the marks, and returns detections. Nothing is scored or saved
// to the learner here. The teacher confirms first.
// src/app/api/exams/read-sheet/route.ts - carlo


import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { readAnswerSheet } from "@/lib/exams/vision";
import { choiceCountOf, choicesFor, formatOf } from "@/lib/exams/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const form = await request.formData();
  const id = z.string().uuid().safeParse(form.get("assessmentId"));
  const file = form.get("image");
  if (!id.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Send an assessment and an image." }, { status: 400 });
  }
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo is over 6 MB." }, { status: 413 });

  // RLS makes this return nothing for another teacher's assessment.
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,class_id,kind,answer_key")
    .eq("id", id.data)
    .maybeSingle();
  if (!assessment) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });

  const { count } = await supabase
    .from("assessment_items")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessment.id);
  const itemCount = count ?? 0;
  if (!itemCount) return NextResponse.json({ error: "This assessment has no items." }, { status: 409 });

  const format = formatOf(assessment.kind);
  const allowed = choicesFor(format, choiceCountOf(assessment.answer_key));
  const bytes = new Uint8Array(await file.arrayBuffer());

  const imagePath = `${user.id}/${assessment.class_id}/${assessment.id}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("assessment-images")
    .upload(imagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: "Could not store the photo." }, { status: 500 });

  try {
    const detections = await readAnswerSheet({ image: bytes, mediaType: file.type, itemCount, format, allowed });
    return NextResponse.json({ imagePath, detections });
  } catch (error) {
    console.error("read-sheet failed", error instanceof Error ? error.message : error);
    // Photo stays stored. UI falls back to manual entry beside the photo.
    return NextResponse.json({
      imagePath,
      detections: null,
      error: "TeacherCo could not read this photo. Enter the answers by hand while looking at it.",
    });
  }
}
