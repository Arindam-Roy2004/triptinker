import type { ErrorCode } from '@triptinker/contracts';
import type { GenerationState } from './use-generation';

export type Problem = Extract<GenerationState, { status: 'error' | 'unplannable' }>;

const TITLES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'Check your trip details',
  NOT_CONFIGURED: 'AI planning is unavailable',
  RATE_LIMITED: 'Too many requests',
  OVERLOADED: 'Planning is busy right now',
  PROVIDER_AUTH: 'AI planning is unavailable',
  PROVIDER_REJECTED: 'Try a different description',
  PROVIDER_UNAVAILABLE: 'AI planning is temporarily unavailable',
  CONTENT_FILTERED: 'This brief can’t be planned',
  NETWORK: 'Connection lost',
  TIMEOUT: 'This is taking too long',
  EMPTY_OUTPUT: 'No plan came through',
  MALFORMED_JSON: 'We couldn’t finish your plan',
  SCHEMA_MISMATCH: 'We couldn’t finish your plan',
  TRUNCATED: 'Your plan was cut short',
  INTERNAL: 'Something went wrong',
};

/** What to do next. Where a code has none, the server's message is shown instead — never both, so nothing repeats the title. */
const NEXT: Partial<Record<ErrorCode, string>> = {
  INVALID_INPUT: 'Add a destination and a few details about your trip.',
  NOT_CONFIGURED: 'View a sample trip while planning is unavailable.',
  PROVIDER_UNAVAILABLE: 'Please try again in a moment.',
  PROVIDER_REJECTED: 'Describe your trip in a different way, then try again.',
  NETWORK: 'Check your connection, then try again.',
  INTERNAL: 'Try again. If it keeps happening, reload the page.',
  MALFORMED_JSON: 'Try again or ask for a shorter trip.',
  SCHEMA_MISMATCH: 'Try again or ask for a shorter trip.',
  TRUNCATED: 'Try fewer days or fewer stops.',
  EMPTY_OUTPUT: 'Please try again.',
  PROVIDER_AUTH: 'Please try again later. You can still view a sample trip.',
  TIMEOUT: 'Planning timed out. Try again with the same trip details.',
  RATE_LIMITED: 'Wait a few seconds, then try again.',
  OVERLOADED: 'Please try again in a moment.',
  CONTENT_FILTERED: 'Rephrase the brief, then try again.',
};

/** A failure in two lines: what happened, and what to do next. */
export function describeProblem(problem: Problem): { title: string; body: string } {
  if (problem.status === 'unplannable') {
    return problem.kind === 'refine' ? { title: 'Try a more specific change', body: problem.reason } : { title: 'Tell us more about your trip', body: problem.reason };
  }
  return { title: TITLES[problem.code], body: NEXT[problem.code] ?? problem.message };
}
