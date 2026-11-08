import { ArrowCounterClockwise, BracketsCurly, ListChecks, PencilSimpleLine, ProhibitInset, ShieldCheck, WarningDiamond, type Icon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import type { ErrorCode } from '@shared/schema';
import { Button } from '@/components/ui/button';
import type { GenerationState } from '../use-generation';

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  { icon: BracketsCurly, title: 'Structured JSON', body: 'The model returns data, not chat. You can watch it stream in.' },
  { icon: ShieldCheck, title: 'Validated', body: 'Every day and stop is checked before anything is shown.' },
  { icon: ListChecks, title: 'Yours to edit', body: 'Reorder, move, remove and refine. Undo anything.' },
];

/** autosend-style cell row under the scene, explaining what happens when you press send. */
export function FeatureCells() {
  return (
    <ul className="grid grid-cols-1 border-t border-line sm:grid-cols-3">
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex flex-col gap-2 border-b border-line bg-surface px-6 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
          <p className="flex items-center gap-2 font-sans text-[15px] font-medium text-ink">
            <Icon size={16} className="text-brand" /> {title}
          </p>
          <p className="text-[15px] leading-[22px] text-muted">{body}</p>
        </li>
      ))}
    </ul>
  );
}

const TITLES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'That request was not accepted',
  NOT_CONFIGURED: 'No model connected yet',
  RATE_LIMITED: 'Too many requests right now',
  PROVIDER_AUTH: 'The provider refused our key',
  PROVIDER_REJECTED: 'The provider refused the request',
  PROVIDER_UNAVAILABLE: 'The model provider is having trouble',
  NETWORK: 'The connection dropped',
  TIMEOUT: 'The model took too long',
  EMPTY_OUTPUT: 'The model came back empty',
  MALFORMED_JSON: 'The answer wasn’t valid JSON',
  SCHEMA_MISMATCH: 'The answer had the wrong shape',
  TRUNCATED: 'The model ran out of room',
  INTERNAL: 'Something went wrong on our side',
};

/** What to do next. Where a code has none, the server's message is shown instead — never both, so nothing repeats the title. */
const NEXT: Partial<Record<ErrorCode, string>> = {
  NOT_CONFIGURED: 'Add LLM_API_KEY to .env and restart. The sample trip and the failure lab work without a key.',
  PROVIDER_UNAVAILABLE: 'This is on the provider’s side. Try again in a moment.',
  PROVIDER_REJECTED: 'Try rewording the brief, then send it again.',
  NETWORK: 'Check your connection, then try again.',
  INTERNAL: 'Try again. If it keeps happening, reload the page.',
  MALFORMED_JSON: 'We already asked the model to repair it once. Trying again usually works.',
  SCHEMA_MISMATCH: 'We already asked the model to repair it once. Trying again usually works.',
  TRUNCATED: 'Try fewer days or a lighter pace so the plan fits in one answer.',
  EMPTY_OUTPUT: 'Trying again usually works.',
  PROVIDER_AUTH: 'Check LLM_API_KEY and LLM_BASE_URL in .env.',
  TIMEOUT: 'Try again, or ask for a shorter trip.',
  RATE_LIMITED: 'Wait a few seconds, then try again.',
};

type Problem = Extract<GenerationState, { status: 'error' | 'unplannable' }>;

/** A failure, explained: what happened, what to do, and whether the current plan survived. */
export function ProblemCell({ problem, hasTrip, onRetry, onEdit, onSample }: { problem: Problem; hasTrip: boolean; onRetry: () => void; onEdit: () => void; onSample?: () => void }) {
  const unplannable = problem.status === 'unplannable';
  const Icon = unplannable ? ProhibitInset : WarningDiamond;
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-5 border-t border-line bg-surface px-6 py-6 sm:flex-row sm:items-start"
    >
      <span className={unplannable ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-warn-wash text-warn' : 'grid size-10 shrink-0 place-items-center rounded-xl bg-err-wash text-err'}>
        <Icon size={20} weight="duotone" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium text-ink">{unplannable ? 'That brief needs a little more' : TITLES[problem.code]}</p>
        {unplannable ? (
          <>
            <p className="mt-1 text-[15px] leading-[22px] text-muted">{problem.reason}</p>
            <p className="mt-1 text-[15px] leading-[22px] text-muted">Say where you are going, roughly how long, and what you enjoy.</p>
          </>
        ) : (
          <p className="mt-1 text-[15px] leading-[22px] text-muted">{NEXT[problem.code] ?? problem.message}</p>
        )}
        <p className="label mt-3 text-[11px] text-subtle">
          {!unplannable && <>error · {problem.code}</>}
          {hasTrip && <span className="normal-case">{!unplannable && ' — '}your current plan is unchanged</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {!unplannable && problem.retryable && (
          <Button variant="primary" onClick={onRetry}>
            <ArrowCounterClockwise /> Try again
          </Button>
        )}
        <Button variant="secondary" onClick={onEdit}>
          <PencilSimpleLine /> {problem.kind === 'refine' ? 'Edit request' : 'Edit brief'}
        </Button>
        {!unplannable && problem.code === 'NOT_CONFIGURED' && onSample && (
          <Button variant="ghost" onClick={onSample}>
            Open sample
          </Button>
        )}
      </div>
    </motion.div>
  );
}
