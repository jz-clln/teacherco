import { expect, it } from 'vitest';
import { unansweredLearnerLinks } from '@/features/learners/bulk-links';
const candidate = (learnerId: string) => ({learnerId, name:learnerId, classes:['Grade 1 Maya']});
it('selects every unanswered unique match without changing the input', () => {
  const matches={'0':[candidate('a')],'1':[candidate('b')]};
  const decisions={};
  expect(unansweredLearnerLinks(matches,decisions)).toEqual({'0':'a','1':'b'});
  expect(decisions).toEqual({});
});
it('preserves keep-separate and manually linked choices', () => {
  expect(unansweredLearnerLinks({'0':[candidate('a')],'1':[candidate('b')],'2':[candidate('c')]},{'0':'new','1':'b'})).toEqual({'2':'c'});
});
it('leaves ambiguous names and shared learner identities for individual review', () => {
  expect(unansweredLearnerLinks({'0':[candidate('a'),candidate('b')],'1':[candidate('a')],'2':[candidate('c')],'3':[]},{})).toEqual({'2':'c'});
  expect(unansweredLearnerLinks({'0':[candidate('a')],'1':[candidate('a')]},{})).toEqual({});
});
it('does not reuse an identity already selected or change completed decisions', () => {
  expect(unansweredLearnerLinks({'1':[candidate('a')]},{'0':'a'})).toEqual({});
  expect(unansweredLearnerLinks({'0':[candidate('a')]},{'0':'a'})).toEqual({});
});
