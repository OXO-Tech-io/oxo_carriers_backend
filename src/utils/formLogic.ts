// Server-side port of Marketrix forms-app's `src/lib/logic.ts` (isQuestionVisible/matches) -
// same comparator semantics. Marketrix's own API never validates required/visibility server-side
// (frontend-only enforcement); this repo closes that gap by running the identical evaluator here
// at final-submit time (see formService.submitResponse), not just in the (separate) frontend copy.

export type LogicComparator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';
export type LogicAction = 'show' | 'hide';
export type LogicCombinator = 'all' | 'any';

export interface LogicRuleLike {
  targetQuestionId: number;
  sourceQuestionId: number;
  comparator: LogicComparator;
  comparisonValue: unknown;
  action: LogicAction;
  combinator: LogicCombinator;
}

function matches(comparator: LogicComparator, answer: unknown, comparisonValue: unknown): boolean {
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

/** Resolves whether `questionId` should be visible given the rules that target it and the current answers. */
export function isQuestionVisible(
  questionId: number,
  rules: LogicRuleLike[],
  answers: Record<number, unknown>
): boolean {
  const targeting = rules.filter((r) => r.targetQuestionId === questionId);
  if (targeting.length === 0) return true;

  const results = targeting.map((r) => {
    const matched = matches(r.comparator, answers[r.sourceQuestionId], r.comparisonValue);
    // A "hide" rule's outcome is inverted: matching the condition means HIDE, so visibility is !matched.
    return r.action === 'hide' ? !matched : matched;
  });

  // Rules with different combinators on the same target: 'any' wins if present (a single 'any'
  // rule matching is enough to decide), otherwise require every rule ('all', the common case).
  const anyRule = targeting.some((r) => r.combinator === 'any');
  return anyRule ? results.some(Boolean) : results.every(Boolean);
}
