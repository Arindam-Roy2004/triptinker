import { ArrowCounterClockwise, CalendarBlank, MapPin, PencilSimpleLine, WarningCircle, type Icon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { describeProblem, type Problem } from '../problem-copy';

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  { icon: CalendarBlank, title: 'Day by day', body: 'See your stops in a clear daily plan.' },
  { icon: MapPin, title: 'Made for you', body: 'Match your pace and interests.' },
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
