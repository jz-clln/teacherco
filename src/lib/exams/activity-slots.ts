import { z } from "zod";

export const activitySlotSchema = z.object({
  title: z.string().trim().min(1).max(160),
  term: z.number().int().min(1).max(3),
  component: z.enum(["written_work", "performance_task", "assessment"]),
});
export type ActivitySlot = z.infer<typeof activitySlotSchema>;
export type ActivityChoice = ActivitySlot & { assessmentId?: string; assessmentTitle?: string; source?: string };
export {defaultActivitySlots} from "@/lib/grading/deped";
export function activityDisplayTitle(title: string, slot?: string | null) {
  return slot && slot !== title ? `${slot} — ${title}` : title;
}
