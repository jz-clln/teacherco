import { createClient } from "@/lib/supabase/server";
import { activitySlotSchema, defaultActivitySlots, type ActivityChoice } from "@/lib/exams/activity-slots";

type Db = Awaited<ReturnType<typeof createClient>>;
export async function getActivityChoices(classId: string, db?: Db): Promise<ActivityChoice[]> {
  const supabase = db ?? await createClient();
  const [config, assessments] = await Promise.all([
    supabase.from("class_grading_config").select("activity_slots").eq("class_id", classId).maybeSingle(),
    supabase.from("assessments").select("id,title,source,activity_slot,exported_title").eq("class_id", classId).limit(1000),
  ]);
  if (config.error || assessments.error) throw new Error("Could not load activity choices. Please try again.");
  const parsed = activitySlotSchema.array().safeParse(config.data?.activity_slots);
  const slots = parsed.success && parsed.data.length ? parsed.data : defaultActivitySlots();
  return slots.map((slot) => {
    const used = assessments.data?.find((a) => (a.activity_slot ?? a.exported_title ?? (a.source === "imported" ? a.title : null)) === slot.title);
    return { ...slot, ...(used ? { assessmentId: String(used.id), assessmentTitle: String(used.title), source: String(used.source) } : {}) };
  });
}
export async function resolveActivitySlot(classId: string, title: string, db: Db) {
  let choices: ActivityChoice[];
  try { choices = await getActivityChoices(classId, db); }
  catch { return { error: "Could not check activity choices. Please try again." } as const; }
  const slot = choices.find((s) => s.title === title);
  if (!slot) return { error: "Choose an activity from this class record." } as const;
  if (slot.assessmentId) return { error: "That activity already has an assessment. Open it or choose another activity." } as const;
  return { slot } as const;
}
