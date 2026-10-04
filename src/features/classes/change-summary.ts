import type { Change, Snapshot } from "@/features/records/sync-model";
import { scoreAverages } from "./stats";

export type LatestUpdate = {
  id: string; version_number: number; filename: string; created_at: string;
  changes: Change[];
  before_learners: Snapshot["learners"]; after_learners: Snapshot["learners"];
  before_scores: Snapshot["scores"]; after_scores: Snapshot["scores"];
};
export type ClassroomChange = { id: string; title: string; detail?: string; priority: number };
export type ChangeSummary = { versionId: string; timestamp: string; insights: ClassroomChange[]; evidence: string };
const countText = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Same points-based average as the current overview; never substitutes printed term grades. */
export function summarizeUpdate(update: LatestUpdate, benchmark: number): ChangeSummary {
  const beforeIds = update.before_learners.filter(l => l.status === "active").map(l => l.id);
  const afterIds = update.after_learners.filter(l => l.status === "active").map(l => l.id);
  const before = scoreAverages(update.before_scores, beforeIds), after = scoreAverages(update.after_scores, afterIds);
  const insights: ClassroomChange[] = [];
  const down = afterIds.filter(id => before[id] !== undefined && after[id] !== undefined && before[id] >= benchmark && after[id] < benchmark).length;
  const up = afterIds.filter(id => before[id] !== undefined && after[id] !== undefined && before[id] < benchmark && after[id] >= benchmark).length;
  if (down) insights.push({ id: "below", title: `${countText(down, "learner moved", "learners moved")} below ${benchmark}%`, detail: "Using the current class benchmark", priority: 100 });
  const mean = (values: Record<string, number>) => Object.values(values).length ? Object.values(values).reduce((a, b) => a + b, 0) / Object.values(values).length : null;
  const oldAverage = mean(before), newAverage = mean(after);
  if (oldAverage !== null && newAverage !== null && Math.abs(newAverage - oldAverage) >= 0.05) insights.push({ id: "average", title: `Class average ${newAverage > oldAverage ? "increased" : "decreased"}`, detail: `${pct(oldAverage)} → ${pct(newAverage)}`, priority: Math.abs(newAverage - oldAverage) >= 1 ? 90 : 55 });
  if (up) insights.push({ id: "above", title: `${countText(up, "learner reached", "learners reached")} ${benchmark}% or above`, detail: "Using the current class benchmark", priority: 80 });
  const added = afterIds.filter(id => !update.before_learners.some(l => l.id === id)).length;
  if (added) insights.push({ id: "learners", title: `${countText(added, "learner was", "learners were")} added`, priority: 70 });
  const previousScores = new Map(update.before_scores.map(s => [`${s.assessment_id}|${s.learner_id}`, s]));
  const newlyScored = new Set<string>();
  let corrected = 0;
  for (const score of update.after_scores) {
    if (score.score === null || !afterIds.includes(score.learner_id)) continue;
    const old = previousScores.get(`${score.assessment_id}|${score.learner_id}`);
    if (old?.score == null) newlyScored.add(score.learner_id);
    else if (old.score !== score.score || old.max_score !== score.max_score) corrected++;
  }
  if (newlyScored.size) insights.push({ id: "scores", title: `${countText(newlyScored.size, "learner received", "learners received")} new scores`, priority: 65 });
  if (corrected) insights.push({ id: "corrected", title: `${countText(corrected, "score was", "scores were")} corrected`, priority: 60 });
  const attendance = update.changes.filter(c => c.kind === "attendance").length;
  if (attendance) insights.push({ id: "attendance", title: `${countText(attendance, "attendance record", "attendance records")} changed`, priority: 60 });
  const grades = update.changes.filter(c => c.kind === "grade").length;
  if (grades) insights.push({ id: "grades", title: `${countText(grades, "grade value", "grade values")} updated`, priority: 50 });
  const activities = update.changes.filter(c => c.kind === "activity" && c.before === "New activity").length;
  if (activities) insights.push({ id: "activities", title: `${countText(activities, "activity was", "activities were")} added`, priority: 50 });
  return {
    versionId: update.id, timestamp: update.created_at,
    insights: insights.sort((a, b) => b.priority - a.priority).slice(0, 4),
    evidence: `Compares records immediately before and after this sync. Class average is the mean of each active learner’s total earned points divided by total possible points, using recorded scores only. Before: ${Object.keys(before).length} scored learners${oldAverage === null ? "" : `, ${pct(oldAverage)}`}. After: ${Object.keys(after).length} scored learners${newAverage === null ? "" : `, ${pct(newAverage)}`}. Enrollment and activity changes can also affect the average. Benchmark crossings use the current ${benchmark}% benchmark. Later manual edits are not included.`,
  };
}
