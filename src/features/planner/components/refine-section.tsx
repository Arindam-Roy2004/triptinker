import { motion } from 'motion/react';
import { ArrowsLeftRight, Minus, PencilSimpleLine, Plus, type Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { LIMITS } from '@shared/schema';
import { ShimmerLabel } from '@/components/ai/shimmer';
import { Button } from '@/components/ui/button';
import { PixelButton } from '@/components/ui/pixel-button';
import { cn } from '@/lib/utils';
import type { ItineraryDiff, StopChange } from '../diff';
import { PromptCard } from './prompt-card';

const SUGGESTIONS = ['Slow down day one', 'Add vegetarian dinners', 'Add more outdoor stops', 'Start after 9am'];

export type PendingRefinement = { instruction: string; diff: ItineraryDiff; warnings: string[] };

const MARK: Record<StopChange['type'], { icon: Icon; className: string; label: string }> = {
  added: { icon: Plus, className: 'bg-ok-wash text-ok', label: 'Added' },
  removed: { icon: Minus, className: 'bg-err-wash text-err', label: 'Removed' },
  changed: { icon: PencilSimpleLine, className: 'bg-warn-wash text-warn', label: 'Changed' },
  moved: { icon: ArrowsLeftRight, className: 'bg-brand-wash text-brand', label: 'Moved' },
};

function describe(change: StopChange) {
  switch (change.type) {
    case 'added':
    case 'removed':
      return { title: change.stop.title, detail: `${change.dayTitle}${change.stop.time ? ` · ${change.stop.time}` : ''}` };
    case 'changed':
      return { title: change.after.title, detail: `${change.dayTitle} · ${change.fields.join(', ')}` };
    case 'moved':
      return { title: change.stop.title, detail: `${change.fromDay} → ${change.toDay}` };
  }
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (instruction: string) => void;
  onStop: () => void;
  running: boolean;
  error: string | null;
  onClearError: () => void;
  pending: PendingRefinement | null;
  onApply: () => void;
  onDiscard: () => void;
  disabled?: boolean;
  /** The run panel or a problem cell, when a refinement is in flight or failed. */
  status?: ReactNode;
};

/** Follow-up edits: the model revises the current plan, and nothing changes until you apply it. */
export function RefineSection({ value, onChange, onSubmit, onStop, running, error, onClearError, pending, onApply, onDiscard, disabled, status }: Props) {
  return (
    <section aria-labelledby="refine-title" className="overflow-hidden rounded-md bg-bg shadow-lift">
      <div className="grid grid-cols-1 gap-8 bg-surface px-6 py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
        <div>
          <ShimmerLabel number="02" className="text-[12px]">Make changes</ShimmerLabel>
          <h2 id="refine-title" className="mt-3 font-display text-[32px] leading-[1.1] text-balance text-ink-strong sm:text-[40px]">
            Change <em>your</em> plan.
          </h2>
          <p className="mt-3 max-w-[46ch] text-[16px] leading-6 text-muted">Tell us what to change. Review it before applying.</p>
        </div>
        <div className={cn(disabled && 'pointer-events-none opacity-60')}>
          <PromptCard
            size="compact"
            label="Describe a change to the plan"
            submitLabel="Send change request"
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            onStop={onStop}
            running={running}
            typed={SUGGESTIONS}
            minLength={LIMITS.instructionMin}
            maxLength={LIMITS.instructionMax}
            error={error}
            onClearError={onClearError}
          />
          <div className="flex flex-wrap gap-2" aria-label="Suggested changes">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={running || disabled}
                onClick={() => onSubmit(s)}
                className="h-8 rounded-xl border border-line bg-surface px-3 text-[13px] text-muted transition-[color,border-color,transform] hover:border-line-strong hover:text-ink active:scale-95 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {status}

      {pending && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          role="region"
          aria-label="Review changes"
          className="border-t border-line"
        >
          <div className="flex flex-col gap-4 bg-surface px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <div className="min-w-0">
              <p className="label text-[11px] text-muted">Review changes</p>
              <p className="mt-1 truncate text-[17px] font-medium text-ink">“{pending.instruction}”</p>
              {Object.values(pending.diff.counts).some((count) => count > 0) && (
                <p className="label tabular mt-2 flex gap-4 text-[11px]">
                  {pending.diff.counts.added > 0 && <span className="text-ok">{pending.diff.counts.added} added</span>}
                  {pending.diff.counts.removed > 0 && <span className="text-err">{pending.diff.counts.removed} removed</span>}
                  {pending.diff.counts.changed > 0 && <span className="text-warn">{pending.diff.counts.changed} changed</span>}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={onDiscard}>
                Discard
              </Button>
              <PixelButton variant="primary" onClick={onApply}>
                Apply changes
              </PixelButton>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto border-t border-line bg-surface">
            {pending.diff.summaryChanged && pending.diff.changes.length === 0 && <li className="px-6 py-3 text-[15px] text-muted lg:px-8">Trip details updated. Your stops are unchanged.</li>}
            {pending.diff.changes.map((change, i) => {
              const mark = MARK[change.type];
              const ChangeIcon = mark.icon;
              const { title, detail } = describe(change);
              return (
                <li key={i} className="flex items-start gap-3 border-b border-line px-6 py-3 last:border-b-0 lg:px-8">
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md', mark.className)} role="img" aria-label={mark.label}>
                    <ChangeIcon size={12} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[15px] font-medium', change.type === 'removed' && 'text-subtle line-through')}>{title}</span>
                    <span className="block truncate text-[13px] text-muted">{detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {pending.warnings.length > 0 && <p className="border-t border-line bg-warn-wash px-6 py-3 text-[13px] text-ink lg:px-8">{pending.warnings.join(' ')}</p>}
        </motion.div>
      )}
    </section>
  );
}
