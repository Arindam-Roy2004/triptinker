import { ArrowCounterClockwise, CalendarDots, MapPinLine, PencilSimpleLine, WarningCircle, type Icon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import type { ErrorCode } from '@shared/schema';
import { Button } from '@/components/ui/button';
import type { GenerationState } from '../use-generation';

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  { icon: CalendarDots, title: 'Day by day', body: 'See your stops in a clear daily plan.' },
  { icon: MapPinLine, title: 'Made for you', body: 'Match your pace and interests.' },
  { icon: PencilSimpleLine, title: 'Easy to change', body: 'Move stops or ask for a new idea.' },
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
  INVALID_INPUT: 'Check your trip details',
  NOT_CONFIGURED: 'AI planning is unavailable',
  RATE_LIMITED: 'Too many requests',
  PROVIDER_AUTH: 'AI planning is unavailable',
  PROVIDER_REJECTED: 'Try a different description',
  PROVIDER_UNAVAILABLE: 'AI planning is temporarily unavailable',
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
  TIMEOUT: 'Try again or ask for a shorter trip.',
  RATE_LIMITED: 'Wait a few seconds, then try again.',
};

type Problem = Extract<GenerationState, { status: 'error' | 'unplannable' }>;

/** A failure, explained: what happened, what to do, and whether the current plan survived. */
export function ProblemCell({ problem, hasTrip, onRetry, onEdit, onSample }: { problem: Problem; hasTrip: boolean; onRetry: () => void; onEdit: () => void; onSample?: () => void }) {
  const unplannable = problem.status === 'unplannable';
  const Icon = WarningCircle;
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-5 border-t border-line bg-surface px-6 py-6 sm:flex-row sm:items-start"
    >
      <span className={unplannable ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-warn-wash text-warn' : 'grid size-10 shrink-0 place-items-center rounded-xl bg-err-wash text-err'}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium text-ink">{unplannable ? 'Tell us more about your trip' : TITLES[problem.code]}</p>
        {unplannable ? (
          <>
            <p className="mt-1 text-[15px] leading-[22px] text-muted">{problem.reason}</p>
            <p className="mt-1 text-[15px] leading-[22px] text-muted">Add a destination, number of days, and a few interests.</p>
          </>
        ) : (
          <p className="mt-1 text-[15px] leading-[22px] text-muted">{NEXT[problem.code] ?? problem.message}</p>
        )}
        {hasTrip && <p className="mt-3 text-[13px] text-muted">Your current trip is unchanged.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {!unplannable && problem.retryable && (
          <Button variant="primary" onClick={onRetry}>
            <ArrowCounterClockwise /> Try again
          </Button>
        )}
        <Button variant="secondary" onClick={onEdit}>
          <PencilSimpleLine /> {problem.kind === 'refine' ? 'Edit request' : 'Edit trip'}
        </Button>
        {!unplannable && problem.code === 'NOT_CONFIGURED' && onSample && (
          <Button variant="ghost" onClick={onSample}>
            View sample
          </Button>
        )}
      </div>
    </motion.div>
  );
}
