import { ArrowClockwise, CalendarBlank, GlobeSimple, ShieldCheck, TextAlignLeft, type Icon } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { formatTime, pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { livePlan, type LivePlan } from '../partial-json';
import type { GenerationState } from '../use-generation';
import { highlightJson } from './json-highlight';
import { WindowFrame } from './window-frame';
import { WebSearch } from './web-search';
import { ThinkingState } from './thinking-state';

type Running = Extract<GenerationState, { status: 'running' }>;
type Status = 'done' | 'active' | 'todo';
type Step = { id: string; icon: Icon; title: string; detail: string; status: Status; chips?: string[] };

const ease = [0.22, 1, 0.36, 1] as const;
const TAIL = 7_000; // only the end of the stream is on screen, so only highlight the end
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Keep the latest day chips visible without letting a ten-day plan fill the panel. */
const latest = (items: string[], max: number) => (items.length > max ? [`+${items.length - max} earlier`, ...items.slice(-max)] : items);

/** The run as a short chain of steps, filled in from what has actually streamed so far. */
function buildSteps(state: Running, plan: LivePlan | null): Step[] {
  const refine = state.kind === 'refine';
  const searched = state.stage === 'searching' || state.sources !== null;
  const order = ['read', ...(searched ? ['search'] : []), 'plan', 'check'];
  // "connecting" is the brief being read when there was no search; after a search it is the start of planning.
  const active = state.stage === 'searching' ? 'search' : state.stage === 'validating' ? 'check' : state.stage === 'connecting' && !searched ? 'read' : 'plan';
  const at = order.indexOf(active);
  const status = (id: string): Status => (order.indexOf(id) < at ? 'done' : id === active ? 'active' : 'todo');
  const days = plan?.days ?? [];
  const stops = days.reduce((n, d) => n + d.stops.length, 0);
  const list: Step[] = [
    { id: 'read', icon: TextAlignLeft, title: refine ? 'Read your change' : 'Read your brief', detail: 'Destination, length and pace', status: status('read') },
    ...(searched
      ? [
          {
            id: 'search',
            icon: GlobeSimple,
            title: 'Search the web',
            detail: '',
            status: status('search'),
          },
        ]
      : []),
    {
      id: 'plan',
      icon: CalendarBlank,
      title: refine ? 'Revise the plan' : 'Plan the days',
      detail: days.length ? `${plural(days.length, 'day')} · ${plural(stops, 'stop')} so far` : 'Choosing stops that fit your pace',
      status: state.stage === 'repairing' ? 'todo' : status('plan'),
      chips: latest(
        days.map((d, i) => (d.title ? `${pad2(i + 1)} · ${d.title}` : `Day ${pad2(i + 1)}`)),
        3,
      ),
    },
    { id: 'check', icon: ShieldCheck, title: 'Check the plan', detail: 'Every day, stop and time is validated', status: status('check') },
  ];
  if (state.repairReason) {
    list.splice(1, 0, {
      id: 'repair',
      icon: ArrowClockwise,
      title: 'Fix the first draft',
      detail: 'It came back incomplete, so it is being rewritten',
      status: state.stage === 'repairing' ? 'active' : 'done',
    });
  }
  return list;
}

/** One line that follows the stream, the way chat apps narrate what the model is doing. */
function statusLine(state: Running, plan: LivePlan | null, elapsed: number): { key: string; text: string } {
  if (state.stage === 'searching') return { key: 'search', text: 'Searching the web for this trip' };
  if (state.stage === 'connecting' && state.sources?.length) return { key: 'sources', text: `Reading ${plural(state.sources.length, 'source')}` };
  if (state.stage === 'connecting') return { key: 'connect', text: state.kind === 'refine' ? 'Reading your change' : 'Reading your brief' };
  if (state.stage === 'repairing') return { key: 'repair', text: 'Rewriting the first draft' };
  if (state.stage === 'validating') return { key: 'check', text: 'Checking every stop and time' };
  const days = plan?.days ?? [];
  const day = days.at(-1);
  const stop = day?.stops.at(-1);
  // Keyed by position, not text: a title that is still streaming updates in place instead of re-animating.
  if (day && stop?.title) return { key: `s${days.length}-${day.stops.length}`, text: `Adding ${stop.title}` };
  if (day) return { key: `d${days.length}`, text: `Sketching day ${days.length}${day.title ? ` · ${day.title}` : ''}` };
  if (plan?.destination) return { key: 'dest', text: `Planning ${plan.destination}` };
  return { key: 'start', text: elapsed > 20_000 ? 'Still thinking. You can stop at any time' : 'Thinking about your trip' };
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The loader shown while a plan is written. Left: a thinking bar (title, a status line that
 * follows the stream, elapsed time, stop) over a chain of steps. Right: the plan itself,
 * previewed from the partial JSON as it arrives, with the raw JSON one tab away.
 */
export function RunPanel({ state, onCancel }: { state: Running; onCancel: () => void }) {
  const reduce = useReducedMotion();
  const elapsed = useNow() - state.startedAt;
  const deferred = useDeferredValue(state.raw);
  const plan = useMemo(() => livePlan(deferred), [deferred]);
  const steps = buildSteps(state, plan).filter((step) => step.status !== 'todo');
  const line = statusLine(state, plan, elapsed);
  const [view, setView] = useState<'preview' | 'json'>('preview');
  const root = useRef<HTMLElement>(null);

  // Bring the live panel into view once when a run starts.
  useEffect(() => {
    root.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [reduce]);

  return (
    <section ref={root} aria-label="Generation progress" aria-busy="true" className="grid grid-cols-1 border-t border-line lg:h-[34rem] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <ThinkingState label={state.kind === 'refine' ? 'Revising' : 'Thinking'} detail={line.text} elapsed={elapsed} onStop={onCancel}>
        {/* Chain of steps */}
        <ol className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pt-3 pb-6 [scrollbar-width:thin]" aria-label="Stages" aria-live="polite" aria-relevant="additions text">
          <AnimatePresence initial={false}>
            {steps.map((step, i) => step.id === 'search' ? (
              <motion.li
                key="search"
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, height: 0, filter: 'blur(3px)' }}
                animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)' }}
                transition={{ duration: 0.3, ease }}
                aria-current={state.stage === 'searching' ? 'step' : undefined}
                className="min-w-0"
              >
                <WebSearch query={state.searchQuery} sources={state.sources} searching={state.stage === 'searching'} elapsed={elapsed} />
              </motion.li>
            ) : (
              <motion.li
                key={step.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease }}
                aria-current={step.status === 'active' ? 'step' : undefined}
                className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3"
              >
                {i < steps.length - 1 && (
                  <span aria-hidden className={cn('absolute top-[26px] -bottom-[18px] left-[9.5px] w-px transition-colors duration-500', step.status === 'done' ? 'bg-brand/40' : 'bg-line')} />
                )}
                <StepIcon status={step.status} icon={step.icon} reduce={!!reduce} />
                <div className="min-w-0">
                  <p className={cn('text-[14px] leading-5 font-medium transition-colors', step.status === 'active' ? 'text-ink' : step.status === 'done' ? 'text-muted' : 'text-subtle')}>
                    {step.title}
                  </p>
                  <p className={cn('mt-0.5 text-[13px] leading-5', step.status === 'todo' ? 'text-subtle' : 'text-muted')}>{step.detail}</p>
                  {!!step.chips?.length && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Days so far">
                      <AnimatePresence initial={false}>
                        {step.chips.map((chip) => (
                          <motion.li
                            key={chip}
                            initial={reduce ? false : { opacity: 0, scale: 0.92, filter: 'blur(3px)' }}
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                            transition={{ duration: 0.28, ease }}
                            className="max-w-full truncate rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] leading-5 text-muted"
                          >
                            {chip}
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </ThinkingState>

      {/* Live preview / raw JSON */}
      <div className="crosshatch p-4 sm:p-8 lg:min-h-0">
        <WindowFrame title={view === 'preview' ? 'Live plan' : 'Trip data'} action={<ViewToggle value={view} onChange={setView} />} className="h-[360px] lg:h-full">
          {view === 'preview' ? <LivePreview plan={plan} writing={state.stage === 'drafting' || state.stage === 'connecting'} /> : <RawJson raw={state.raw} />}
        </WindowFrame>
      </div>
    </section>
  );
}

/** Quiet icons for completed steps; a small pixel marks the work currently in progress. */
function StepIcon({ status, icon: Icon, reduce }: { status: Status; icon: Icon; reduce: boolean }) {
  return (
    <span className="relative grid size-5 place-items-center bg-surface text-subtle" aria-hidden>
      {status === 'active' ? (
        <motion.span
          className="size-1.5 rounded-[1px] bg-brand"
          animate={reduce ? undefined : { opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      ) : <Icon size={15} />}
    </span>
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
      {!raw && <span className="text-subtle"> Waiting for trip data…</span>}
    </pre>
  );
}

const enter = { initial: { opacity: 0, y: 6, filter: 'blur(4px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.32, ease } };

function GhostRow({ width }: { width: string }) {
  return (
    <li className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 py-1.5 pl-3" aria-hidden>
      <span className="skeleton h-2.5 w-9" />
      <span className="skeleton h-2.5" style={{ width }} />
    </li>
  );
}

/** The plan as it is being written: destination, then each day and its stops, blurring in. */
function LivePreview({ plan, writing }: { plan: LivePlan | null; writing: boolean }) {
  const reduce = useReducedMotion();
  const count = plan ? plan.days.reduce((n, d) => n + d.stops.length + 1, 0) : 0;
  const ref = usePinnedToBottom<HTMLDivElement>(count);
  const motionProps = reduce ? {} : enter;
  const days = plan?.days ?? [];

  return (
    <div ref={ref} className="mask-fade-top h-full overflow-auto px-5 pt-4 pb-6" aria-live="off">
      {plan?.destination || plan?.title ? (
        <motion.div {...motionProps} className="mb-4">
          {plan.destination && <p className="label text-[11px] text-brand">{plan.destination}</p>}
          {plan.title && <p className="mt-1 font-display text-[22px] leading-tight text-ink-strong">{plan.title}</p>}
        </motion.div>
      ) : (
        <div className="mb-5 flex flex-col gap-2.5" aria-hidden>
          <span className="skeleton h-2.5 w-24" />
          <span className="skeleton h-5 w-3/4" />
        </div>
      )}
      <ol className="flex flex-col gap-4">
        {days.map((day, i) => {
          const lastDay = i === days.length - 1;
          return (
            <motion.li key={i} {...motionProps}>
              <p className="label flex items-baseline gap-2 text-[11px] text-subtle">
                Day {pad2(i + 1)}
                {day.title && <span className="truncate font-sans text-[13px] font-medium tracking-normal text-ink normal-case">{day.title}</span>}
              </p>
              <ul className="mt-2 flex flex-col border-l border-line">
                {day.stops.map((stop, j) => (
                  <motion.li key={j} {...motionProps} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 py-1 pl-3 text-[13px]">
                    <span className="label tabular pt-px text-[11px] whitespace-nowrap text-muted">{formatTime(stop.time) ?? 'Any'}</span>
                    <span className="truncate text-ink">
                      {stop.title}
                      {writing && lastDay && j === day.stops.length - 1 && <span className="ml-0.5 inline-block h-3 w-[6px] animate-caret bg-brand align-[-1px]" aria-hidden />}
                    </span>
                  </motion.li>
                ))}
                {writing && lastDay && <GhostRow width="55%" />}
              </ul>
            </motion.li>
          );
        })}
        {!days.length && (
          <li aria-hidden>
            <span className="skeleton block h-2.5 w-14" />
            <ul className="mt-3 flex flex-col border-l border-line">
              <GhostRow width="70%" />
              <GhostRow width="52%" />
              <GhostRow width="62%" />
            </ul>
          </li>
        )}
      </ol>
    </div>
  );
}
