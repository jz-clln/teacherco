import type { LearnerMatch } from './import-actions';

// Only fill unanswered rows with one unique match. Ambiguous names and the
// teacher's existing choices must remain an individual review decision.
export function unansweredLearnerLinks(matches: Record<string, LearnerMatch[]>, decisions: Record<string, string>) {
  const occurrences = new Map<string, number>();
  for (const candidates of Object.values(matches)) {
    for (const id of new Set(candidates.map(candidate => candidate.learnerId))) {
      occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
    }
  }
  const selected = new Set(Object.values(decisions));
  return Object.fromEntries(Object.entries(matches)
    .filter(([index, candidates]) => !decisions[index] && candidates.length === 1 &&
      occurrences.get(candidates[0].learnerId) === 1 && !selected.has(candidates[0].learnerId))
    .map(([index, candidates]) => [index, candidates[0].learnerId]));
}
