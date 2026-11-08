import { ArrowCircleRight, CaretUp, CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

export type PlanningTask = { id: string; label: string; detail?: string; status: 'done' | 'active' | 'todo' };

/** The count tracks finished planning stages, rather than guessing a completion percentage. */
export function TaskList({ tasks }: { tasks: PlanningTask[] }) {
  const [open, setOpen] = useState(true);
  const reduce = useReducedMotion();
  const id = useId();
  const completed = tasks.filter((task) => task.status === 'done').length;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.025)]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} aria-label={open ? 'Hide trip tasks' : 'Show trip tasks'} className="flex min-h-12 w-full items-center gap-2.5 px-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
        <CircleNotch size={15} className="shrink-0 text-muted motion-safe:animate-spin" aria-hidden />
        <span className="flex-1 text-[13px] font-medium text-ink">Trip tasks</span>
        <span className="tabular text-[12px] text-subtle" aria-label={`${completed} of ${tasks.length} tasks complete`}>{completed}/{tasks.length}</span>
        <CaretUp size={12} className={cn('text-subtle transition-transform motion-reduce:transition-none', !open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <ol aria-label="Stages" aria-live="polite" aria-relevant="additions" className="flex flex-col gap-1 px-4 pb-3">
              {tasks.map((task) => (
                <li key={task.id} aria-current={task.status === 'active' ? 'step' : undefined} className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2.5 py-1">
                  <span className="grid h-5 place-items-center" aria-hidden>
                    {task.status === 'done' ? <CheckCircle size={15} weight="fill" className="text-subtle" /> : task.status === 'active' ? <ArrowCircleRight size={15} className="text-brand" /> : <span className="size-3.5 rounded-full border border-dashed border-line-strong" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[13px] leading-5', task.status === 'done' ? 'text-subtle line-through decoration-subtle/60' : task.status === 'active' ? 'font-medium text-ink' : 'text-muted')}><span className="sr-only">{task.status === 'done' ? 'Completed: ' : task.status === 'active' ? 'In progress: ' : 'Pending: '}</span>{task.label}</span>
                    {task.status === 'active' && task.detail && <span className="mt-0.5 block text-[11px] leading-[18px] text-subtle">{task.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
