import type { FormLogicRule as DrizzleFormLogicRule } from '../../db/schema';

// Server-side port of the frontend's lib/formLogic.ts - kept byte-for-byte
// equivalent in behavior so a required-but-hidden question can never block
// submission here while the fill form (correctly) never showed it as
// required in the first place. See that file for the full semantics comment.

type Comparator = DrizzleFormLogicRule['comparator'];

export function matchesComparator(comparator: Comparator, answer: unknown, comparisonValue: unknown): boolean {
  const answerText = Array.isArray(answer) ? answer.join(', ') : String(answer ?? '');
  switch (comparator) {
    case 'equals':
      return Array.isArray(answer) ? answer.includes(comparisonValue) : answer === comparisonValue;
    case 'not_equals':
      return !(Array.isArray(answer) ? answer.includes(comparisonValue) : answer === comparisonValue);
    case 'contains':
      return answerText.toLowerCase().includes(String(comparisonValue ?? '').toLowerCase());
    case 'greater_than':
      return Number(answer) > Number(comparisonValue);
    case 'less_than':
      return Number(answer) < Number(comparisonValue);
    case 'is_empty':
      return answer == null || answerText.trim() === '' || (Array.isArray(answer) && answer.length === 0);
    case 'is_not_empty':
      return !(answer == null || answerText.trim() === '' || (Array.isArray(answer) && answer.length === 0));
    default:
      return true;
  }
}

export function isQuestionVisible(
  questionId: number,
  rules: DrizzleFormLogicRule[],
  answers: Record<number, unknown>,
): boolean {
  const targeting = rules.filter((r) => r.targetQuestionId === questionId);
  if (targeting.length === 0) return true;

  const results = targeting.map((r) => {
    const matched = matchesComparator(r.comparator, answers[r.sourceQuestionId], r.comparisonValue);
    return r.action === 'hide' ? !matched : matched;
  });

  const anyRule = targeting.some((r) => r.combinator === 'any');
  return anyRule ? results.some(Boolean) : results.every(Boolean);
}
