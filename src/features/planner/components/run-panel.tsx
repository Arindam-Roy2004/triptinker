import { CheckCircle, Clock, PlugsConnected, ShieldCheck, Sparkle, Wrench, type Icon } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Stage } from '@shared/schema';
import { Shimmer } from '@/components/ai/shimmer';
import { Button } from '@/components/ui/button';
import { PixelFill } from '@/components/ui/pixel-fill';
import { PulseLine } from '@/components/ui/pulse-line';
import { formatElapsed, pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { livePlan, type LivePlan } from '../partial-json';
import type { GenerationState } from '../use-generation';
import { highlightJson } from './json-highlight';
import { WindowFrame } from './window-frame';

type Running = Extract<GenerationState, { status: 'running' }>;
type Status = 'done' | 'active' | 'todo';
type Step = { id: string; icon: Icon; title: string; detail: string; status: Status };

const ease = [0.22, 1, 0.36, 1] as const;
const ORDER: Stage[] = ['connecting', 'drafting', 'validating'];
const TAIL = 7_000; // only the end of the stream is on screen, so only highlight the end

function steps(state: Running, model: string | null): Step[] {
  const current = state.stage === 'repairing' ? 'drafting' : state.stage;
  const at = ORDER.indexOf(current);
  const status = (i: number): Status => (i < at ? 'done' : i === at ? 'active' : 'todo');
  const { days, stops } = state.progress;
  const list: Step[] = [
    { id: 'connect', icon: PlugsConnected, title: 'Connect', detail: model ? `Streaming from ${model.split('/').at(-1)}` : 'Opening a stream to the model', status: status(0) },
    {
      id: 'draft',
      icon: Sparkle,
      title: state.repairReason ? 'Redraft' : 'Draft',
      detail: days || stops ? `${days} day${days === 1 ? '' : 's'} · ${stops} stop${stops === 1 ? '' : 's'} so far` : 'Writing the itinerary',
      status: status(1),
    },
    { id: 'validate', icon: ShieldCheck, title: 'Validate', detail: 'Checking every day and stop', status: status(2) },
  ];
  if (state.repairReason) {
    list.splice(1, 0, { id: 'repair', icon: Wrench, title: 'Repair', detail: `${state.repairReason} Asked the model to fix it — once.`, status: 'done' });
  }
  return list;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The loader shown while a plan is written (composio's run view): stages on the left, and a
 * window on a crosshatched cell on the right that previews the days and stops as they arrive.
 * The raw JSON is one tab away.
 */
export function RunPanel({ state, model, onCancel }: { state: Running; model: string | null; onCancel: () => void }) {
  const reduce = useReducedMotion();
  const now = useNow(true);
  const elapsed = now - state.startedAt;
  const list = steps(state, model);
  const [view, setView] = useState<'preview' | 'json'>('preview');
  const root = useRef<HTMLElement>(null);

  // Bring the live panel into view once when a run starts.
  useEffect(() => {
    root.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [reduce]);

  return (
    <section ref={root} aria-label="Generation progress" aria-busy="true" className="grid grid-cols-1 border-t border-line lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* Stages */}
      <div className="flex flex-col bg-surface lg:border-r lg:border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <Shimmer as="p" duration={1.8} className="text-[15px] font-medium">
              {state.kind === 'refine' ? 'Revising your plan…' : 'Planning your trip…'}
            </Shimmer>
            <p className="mt-0.5 text-[13px] text-muted">{elapsed > 20_000 ? 'Taking longer than usual. Keep waiting or stop — nothing is lost.' : 'Shown as a draft until every stop passes validation.'}</p>
          </div>
          <span className="label tabular flex shrink-0 items-center gap-1 text-[11px] text-muted" aria-label={`Elapsed ${Math.floor(elapsed / 1000)} seconds`}>
            <Clock size={13} /> {formatElapsed(elapsed)}
          </span>
        </div>
        <ol className="flex-1" aria-label="Stages">
          <AnimatePresence initial={false}>
            {list.map((step, i) => (
              <motion.li
                key={step.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3, ease }}
                aria-current={step.status === 'active' ? 'step' : undefined}
                className="relative flex gap-3 overflow-hidden border-b border-line px-6 py-4 last:border-b-0"
              >
                {step.status === 'active' && <PixelFill line={false} duration={1600} />}
                {/* The rail joining the stage icons: a quiet stub in from above, and below the icon
                    a segment whose pulse flows on to the next stage (sagewell's connector lines). */}
                {i > 0 && <span aria-hidden className="absolute top-0 left-[35.5px] h-[18px] w-px bg-line" />}
                {i < list.length - 1 && <PulseLine vertical duration={1.4} repeatDelay={0.6} delay={i * 0.35} className="absolute top-[42px] bottom-0 left-[35px] h-auto" />}
                <StepIcon step={step} reduce={!!reduce} />
                <div className="relative min-w-0">
                  <p className={cn('label text-[12px]', step.status === 'todo' ? 'text-subtle' : 'text-ink')}>{step.title}</p>
                  <p className={cn('mt-1 text-[14px] leading-5', step.status === 'todo' ? 'text-subtle' : 'text-muted')}>{step.detail}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        <div className="flex items-center justify-end border-t border-line px-6 py-3">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Stop
          </Button>
        </div>
      </div>

      {/* Live preview / raw JSON */}
      <div className="crosshatch p-4 sm:p-8">
        <WindowFrame
          title="response.json — streaming"
          action={<ViewToggle value={view} onChange={setView} />}
          className="h-[360px] lg:h-full lg:min-h-[380px]"
        >
          {view === 'preview' ? <LivePreview raw={state.raw} /> : <RawJson raw={state.raw} />}
        </WindowFrame>
      </div>
    </section>
  );
}

function ViewToggle({ value, onChange }: { value: 'preview' | 'json'; onChange: (v: 'preview' | 'json') => void }) {
  return (
    <span role="tablist" aria-label="Stream view" className="flex rounded-lg bg-sunken p-0.5">
      {(
        [
          ['preview', 'Preview'],
          ['json', 'JSON'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn('label h-6 rounded-md px-2 text-[10px] transition-colors', value === id ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:text-ink')}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

/** Keeps a scroller pinned to the bottom while content streams in. */
function usePinnedToBottom<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function RawJson({ raw }: { raw: string }) {
  const tail = raw.length > TAIL ? raw.slice(-TAIL) : raw;
  const highlighted = useMemo(() => highlightJson(tail), [tail]);
  const ref = usePinnedToBottom<HTMLPreElement>(raw);
  return (
    <pre ref={ref} className="mask-fade-top h-full overflow-auto p-4 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap text-ink">
      {raw.length > TAIL && <span className="text-subtle">…{'\n'}</span>}
      {highlighted}
      <span className="ml-px inline-block h-3.5 w-[7px] animate-caret bg-brand align-middle" aria-hidden />
      {!raw && <span className="text-subtle"> waiting for the first token…</span>}
    </pre>
  );
}

const enter = { initial: { opacity: 0, y: 6, filter: 'blur(4px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.32, ease } };

/** The plan as it is being written: destination, then each day and its stops, blurring in. */
function LivePreview({ raw }: { raw: string }) {
  const reduce = useReducedMotion();
  const deferred = useDeferredValue(raw);
  const plan: LivePlan | null = useMemo(() => livePlan(deferred), [deferred]);
  const count = plan ? plan.days.reduce((n, d) => n + d.stops.length + 1, 0) : 0;
  const ref = usePinnedToBottom<HTMLDivElement>(count);
  const motionProps = reduce ? {} : enter;

  return (
    <div ref={ref} className="mask-fade-top h-full overflow-auto px-5 pt-4 pb-6" aria-live="off">
      {plan?.destination || plan?.title ? (
        <motion.div {...motionProps} className="mb-4">
          {plan.destination && <p className="label text-[11px] text-brand">{plan.destination}</p>}
          {plan.title && <p className="mt-1 font-display text-[22px] leading-tight text-ink-strong">{plan.title}</p>}
        </motion.div>
      ) : (
        <Placeholder lines={2} className="mb-5" />
      )}
      <ol className="flex flex-col gap-4">
        {plan?.days.map((day, i) => (
          <motion.li key={i} {...motionProps}>
            <p className="label flex items-baseline gap-2 text-[11px] text-subtle">
              Day {pad2(i + 1)}
              {day.title && <span className="truncate text-[13px] font-medium tracking-normal text-ink normal-case font-sans">{day.title}</span>}
            </p>
            <ul className="mt-2 flex flex-col border-l border-line">
              {day.stops.map((stop, j) => (
                <motion.li key={j} {...motionProps} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 py-1 pl-3 text-[13px]">
                  <span className="label tabular pt-px text-[11px] text-muted">{stop.time ?? '—'}</span>
                  <span className="truncate text-ink">{stop.title}</span>
                </motion.li>
              ))}
            </ul>
          </motion.li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-subtle">
        <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden />
        <Shimmer as="span" duration={1.5}>
          {!raw ? 'Waiting for the first token…' : plan?.days.length ? 'Writing the next stop…' : 'Reading your brief…'}
        </Shimmer>
      </div>
    </div>
  );
}

function Placeholder({ lines, className }: { lines: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="h-3 animate-pulse rounded bg-sunken" style={{ width: `${70 - i * 25}%` }} />
      ))}
    </div>
  );
}

function StepIcon({ step, reduce }: { step: Step; reduce: boolean }) {
  const Icon = step.icon;
  return (
    <span
      className={cn(
        'relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300',
        step.status === 'done' ? 'bg-brand text-brand-ink' : step.status === 'active' ? 'bg-surface text-brand ring-1 ring-brand/60' : 'bg-sunken text-subtle',
      )}
    >
      {step.status === 'active' && !reduce && (
        <motion.span className="absolute inset-0 rounded-full bg-brand/30" animate={{ scale: [1, 1.8], opacity: [0.6, 0] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeOut' }} aria-hidden />
      )}
      {step.status === 'done' ? (
        <motion.span initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }} className="flex">
          <CheckCircle size={14} weight="fill" />
        </motion.span>
      ) : (
        <Icon size={12} weight={step.status === 'active' ? 'bold' : 'regular'} />
      )}
    </span>
  );
}
