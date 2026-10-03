import { createClient } from "@/lib/supabase/server";
import { activitySlotSchema, defaultActivitySlots, type ActivityChoice } from "@/lib/exams/activity-slots";

type Db = Awaited<ReturnType<typeof createClient>>;
type SlotConfig = { class_id: string; activity_slots: unknown };
type SlotAssessment = { class_id: string; id: string; title: string; source: string; activity_slot: string | null; exported_title: string | null };

/** Fetch all classes together instead of two round trips for every class. */
export async function getActivityChoicesByClass(classIds: string[], db?: Db): Promise<Map<string, ActivityChoice[]>> {
  const ids = [...new Set(classIds)];
  if (!ids.length) return new Map();
  const supabase = db ?? await createClient();
  const configs: SlotConfig[] = [];
  const assessments: SlotAssessment[] = [];
  // Bound URL size, and paginate scores so a large class cannot hide an occupied slot.
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    await Promise.all([
      (async () => {
        const { data, error } = await supabase.from("class_grading_config").select("class_id,activity_slots").in("class_id", batch);
        if (error) throw new Error("Could not load activity choices. Please try again.");
        configs.push(...(data ?? []) as SlotConfig[]);
      })(),
      (async () => {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from("assessments")
            .select("class_id,id,title,source,activity_slot,exported_title").in("class_id", batch).order("id").range(from, from + 999);
          if (error) throw new Error("Could not load activity choices. Please try again.");
          assessments.push(...(data ?? []) as SlotAssessment[]);
          if (!data || data.length < 1000) break;
        }
      })(),
    ]);
  }
  const configByClass = new Map(configs.map((config) => [config.class_id, config.activity_slots]));
  const assigned = new Map<string, Map<string, SlotAssessment>>();
  for (const assessment of assessments) {
    const title = assessment.activity_slot ?? assessment.exported_title ?? (assessment.source === "imported" ? assessment.title : null);
    if (!title) continue;
    const byTitle = assigned.get(assessment.class_id) ?? new Map<string, SlotAssessment>();
    if (!byTitle.has(title)) byTitle.set(title, assessment);
    assigned.set(assessment.class_id, byTitle);
  }
  return new Map(ids.map((id) => {
    const parsed = activitySlotSchema.array().safeParse(configByClass.get(id));
    const slots = parsed.success && parsed.data.length ? parsed.data : defaultActivitySlots();
    return [id, slots.map((slot) => {
      const used = assigned.get(id)?.get(slot.title);
      return { ...slot, ...(used ? { assessmentId: used.id, assessmentTitle: used.title, source: used.source } : {}) };
    })];
  }));
}

export async function getActivityChoices(classId: string, db?: Db): Promise<ActivityChoice[]> {
  return (await getActivityChoicesByClass([classId], db)).get(classId) ?? [];
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
