import { z } from "zod";
import { inferTermAndComponent } from "@/lib/grading/deped";

export const activitySlotSchema = z.object({
  title: z.string().trim().min(1).max(160),
  term: z.number().int().min(1).max(3),
  component: z.enum(["written_work", "performance_task", "assessment"]),
});
export type ActivitySlot = z.infer<typeof activitySlotSchema>;
export type ActivityChoice = ActivitySlot & { assessmentId?: string; assessmentTitle?: string; source?: string };
export function defaultActivitySlots(): ActivitySlot[] {
  return [1, 2, 3].flatMap((term) => [
    ...[1, 2, 3, 4, 5].map((n) => `Written Work ${n}`),
    ...[1, 2, 3].map((n) => `Performance Task ${n}`),
    "Summative Test 1", "Summative Test 2", "Term Exam",
  ].map((name) => {
    const title = `Term ${term} · ${name}`;
    return { title, term, component: inferTermAndComponent(title).component! };
  }));
}
export function activityDisplayTitle(title: string, slot?: string | null) {
  return slot && slot !== title ? `${slot} — ${title}` : title;
}
