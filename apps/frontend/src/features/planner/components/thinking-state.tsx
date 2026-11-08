import { CaretDown } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { Shimmer } from '@/components/ai/shimmer';
import { cn } from '@/lib/utils';

const ease = [0.22, 1, 0.36, 1] as const;

/** A small pixel mark; its diagonal wave stops when reduced motion is requested. */
export function ThinkingMark() {
  const reduce = useReducedMotion();
  return (
    <span className="grid size-5 shrink-0 grid-cols-3 gap-[3px] p-px text-brand" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <motion.span
          key={i}
          className="rounded-[1px] bg-current"
          style={{ opacity: 0.25 + (i % 3) * 0.2 }}
          animate={reduce ? undefined : { opacity: [0.2, 0.9, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: (Math.floor(i / 3) + i % 3) * 0.12 }}
        />
      ))}
    </span>
  );
}

/** The live timer and stop control remain available when the activity is folded away. */
export function ThinkingState({ label, detail, elapsed, onStop, children }: { label: string; detail: string; elapsed: number; onStop: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const seconds = Math.max(0, Math.floor(elapsed / 1000));
  const time = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-start gap-3 pb-4">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-label={open ? 'Hide thinking steps' : 'Show thinking steps'}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="group flex min-h-8 max-w-full items-center gap-2.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <ThinkingMark />
            <Shimmer as="span" duration={1.8} className="text-[14px] font-medium">{label}</Shimmer>
            <span className="tabular font-mono text-[11px] text-subtle" aria-label={`Elapsed ${seconds} seconds`}>{time}</span>
            <CaretDown size={12} aria-hidden className={cn('shrink-0 text-subtle transition-all group-hover:text-ink motion-reduce:transition-none', !open && '-rotate-90')} />
          </button>
          <p className="mt-1 truncate pl-[30px] text-[12px] leading-5 text-subtle" aria-live="polite">{detail}</p>
        </div>
        <button type="button" onClick={onStop} className="mt-0.5 min-h-8 shrink-0 rounded-md px-2 text-[12px] text-muted transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">Stop</button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="activity"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="flex min-h-0 flex-col gap-4 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
