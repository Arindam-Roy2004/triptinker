import { ArrowCounterClockwise, CalendarBlank, MapPin, PencilSimpleLine, WarningCircle, type Icon } from '@phosphor-icons/react';
import { AnimateIcon } from '@animate-ui/react/icons';
import { motion, type Variants } from 'motion/react';
import { Cancel01 } from '@/components/animate-ui/icons/hugeicons/cancel-01';
import { Refresh } from '@/components/animate-ui/icons/hugeicons/refresh';
import { Button } from '@/components/ui/button';
import { describeProblem, type Problem } from '../problem-copy';

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  { icon: CalendarBlank, title: 'Day by day', body: 'See your stops in a clear daily plan.' },
  { icon: MapPin, title: 'Made for you', body: 'Match your pace and interests.' },
  { icon: PencilSimpleLine, title: 'Easy to change', body: 'Move stops or ask for a new idea.' },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/** The cells settle back in one after another when a run is stopped (not on first load: the parent sets initial={false}). */
const CELLS: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.06 } } };
const CELL: Variants = {
  hidden: { opacity: 0, y: 8, filter: 'blur(3px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.32, ease: EASE } },
};

/** autosend-style cell row under the scene, explaining what happens when you press send. */
export function FeatureCells() {
  return (
    <motion.ul variants={CELLS} initial="hidden" animate="shown" className="grid grid-cols-1 border-t border-line sm:grid-cols-3">
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <motion.li key={title} variants={CELL} className="flex flex-col items-center gap-2 border-b border-line bg-surface px-6 py-6 text-center last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
          <p className="flex items-center gap-2 font-sans text-[15px] font-medium text-ink">
            <span className="grid size-6 place-items-center rounded-md bg-brand text-brand-ink shadow-md ring-1 shadow-black/10 ring-surface">
              <Icon size={14} weight="bold" />
            </span>
            {title}
          </p>
          <p className="text-[15px] leading-[22px] text-balance text-muted">{body}</p>
        </motion.li>
      ))}
    </motion.ul>
  );
}

/**
 * Shown under the prompt for a few seconds after a run is stopped: the cross draws itself in, and
 * the brief is still in the box above, so planning again is one press away.
 */
export function StoppedNote({ onPlanAgain }: { onPlanAgain: () => void }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -4, scale: 0.98, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.28, ease: EASE } }}
      exit={{ opacity: 0, y: -4, scale: 0.98, filter: 'blur(4px)', transition: { duration: 0.2, ease: EASE } }}
      className="glass-card mt-1 flex max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 rounded-xl py-1 pr-1 pl-3 text-[13px] text-ink"
    >
      <span className="flex items-center gap-2">
        <Cancel01 size={14} animate animation="path" persistOnAnimateEnd className="shrink-0 text-signal-text" aria-hidden />
        Planning stopped. Your brief is still here.
      </span>
      <AnimateIcon animateOnHover animation="rotate" asChild>
        <button type="button" onClick={onPlanAgain} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-surface px-2.5 font-medium shadow-chip transition-[box-shadow,transform] hover:shadow-control active:scale-[0.97]">
          <Refresh size={13} aria-hidden />
          Plan again
        </button>
      </AnimateIcon>
    </motion.div>
  );
}

/** A failure, explained: what happened, what to do, and whether the current plan survived. */
export function ProblemCell({ problem, hasTrip, onRetry, onEdit, onSample }: { problem: Problem; hasTrip: boolean; onRetry: () => void; onEdit: () => void; onSample?: () => void }) {
  const unplannable = problem.status === 'unplannable';
  const copy = describeProblem(problem);
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
        <p className="text-[17px] font-medium text-ink">{copy.title}</p>
        <p className="mt-1 text-[15px] leading-[22px] text-muted">{copy.body}</p>
        {unplannable && <p className="mt-1 text-[15px] leading-[22px] text-muted">Add a destination, number of days, and a few interests.</p>}
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
