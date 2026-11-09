import { motion, useReducedMotion } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from '@phosphor-icons/react';
import { formatDuration, formatTime, pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { livePlan, type LivePlan } from '../partial-json';
import type { GenerationState } from '../use-generation';
import { highlightJson } from './json-highlight';
import { WindowFrame } from './window-frame';
import { WebSearch } from './web-search';
import { ThinkingState } from './thinking-state';
import { TaskList, type PlanningTask } from './task-list';

type Running = Extract<GenerationState, { status: 'running' }>;
type Status = 'done' | 'active' | 'todo';
type Step = { id: string; title: string; detail: string; status: Status };

const ease = [0.22, 1, 0.36, 1] as const;
const TAIL = 7_000; // only the end of the stream is on screen, so only highlight the end
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
    { id: 'read', title: refine ? 'Read your change' : 'Read your brief', detail: 'Destination, length and pace', status: status('read') },
    ...(searched
      ? [
          {
            id: 'search',
            title: 'Search the web',
            detail: '',
            status: status('search'),
          },
        ]
      : []),
    {
      id: 'plan',
      title: refine ? 'Revise the plan' : 'Plan the days',
      detail: days.length ? `${plural(days.length, 'day')} · ${plural(stops, 'stop')} so far` : 'Choosing stops that fit your pace',
      status: state.stage === 'repairing' ? 'todo' : status('plan'),
    },
    { id: 'check', title: 'Check the plan', detail: 'Every day, stop and time is validated', status: status('check') },
  ];
  if (state.repairReason) {
    list.splice(1, 0, {
      id: 'repair',
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
  const steps = buildSteps(state, plan);
  const searched = state.stage === 'searching' || state.sources !== null;
  const tasks: PlanningTask[] = steps.map((step) => ({ id: step.id, label: step.title, status: step.status, detail: step.detail }));
  const line = statusLine(state, plan, elapsed);
  const [view, setView] = useState<'preview' | 'json'>('preview');
  const root = useRef<HTMLElement>(null);

  // Bring the live panel into view once when a run starts.
  useEffect(() => {
    root.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [reduce]);

  return (
    <section ref={root} aria-label="Generation progress" aria-busy="true" className="grid grid-cols-1 items-start gap-5 border-t border-line bg-surface p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-stretch">
      <ThinkingState label={state.kind === 'refine' ? 'Revising' : 'Thinking'} detail={line.text} detailKey={line.key} elapsed={elapsed} onStop={onCancel}>
        {searched && <WebSearch query={state.searchQuery} sources={state.sources} searching={state.stage === 'searching'} elapsed={elapsed} />}
        <TaskList tasks={tasks} />
      </ThinkingState>

      {/* Live preview / raw JSON */}
      <div role="region" aria-label="Live plan panel" className="relative min-w-0 lg:min-h-72">
        <WindowFrame title={view === 'json' ? 'Trip data' : state.stage === 'validating' ? 'Checking plan' : 'Live plan'} action={<ViewToggle value={view} onChange={setView} />} className="h-[22rem] rounded-xl border border-line shadow-none lg:absolute lg:inset-0 lg:h-full" bodyClassName="overflow-hidden">
          <div className="h-full min-h-0">
            {view === 'preview' ? <LivePreview plan={plan} writing={state.stage === 'drafting' || state.stage === 'connecting'} /> : <RawJson raw={state.raw} />}
          </div>
        </WindowFrame>
      </div>
    </section>
  );
}

function ViewToggle({ value, onChange }: { value: 'preview' | 'json'; onChange: (v: 'preview' | 'json') => void }) {
  return (
    <span role="tablist" aria-label="Stream view" className="relative grid grid-cols-2 rounded-lg bg-sunken p-0.5">
      {/* One pill that slides to the selected tab rather than two that blink. Plain CSS on purpose: a
          shared-layout (layoutId) pill would hold the panel's exit open when the run ends. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-surface shadow-[0_0_0_1px_var(--line)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: value === 'json' ? 'translateX(100%)' : undefined }}
      />
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
          className={cn('label relative h-6 rounded-md px-2 text-[10px] transition-colors', value === id ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          <span className="relative">{label}</span>
        </button>
      ))}
    </span>
  );
}

/** Follow new content until the reader scrolls up; preserve their place while they read. */
function usePinnedToBottom<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const next = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
      if (next !== follow.current) {
        follow.current = next;
        setFollowing(next);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  const jump = () => {
    follow.current = true;
    setFollowing(true);
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  };
  return { ref, following, jump };
}

function JumpToLatest({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[11px] font-medium text-ink shadow-lift transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-brand"><ArrowDown size={12} aria-hidden />Jump to latest</button>;
}

function RawJson({ raw }: { raw: string }) {
  const tail = raw.length > TAIL ? raw.slice(-TAIL) : raw;
  const highlighted = useMemo(() => highlightJson(tail), [tail]);
  const { ref, following, jump } = usePinnedToBottom<HTMLPreElement>(raw);
  return (
    <div className="relative h-full min-h-0">
    <pre ref={ref} tabIndex={0} aria-label="Live trip data" className="pane-scroll h-full overflow-auto p-4 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
      {raw.length > TAIL && <span className="text-subtle">…{'\n'}</span>}
      {highlighted}
      <span className="ml-px inline-block h-3.5 w-[7px] animate-caret bg-brand align-middle" aria-hidden />
      {!raw && <span className="text-subtle"> Waiting for trip data…</span>}
    </pre>
    {!following && <JumpToLatest onClick={jump} />}
    </div>
  );
}

// New lines resolve out of a soft blur as they arrive, rather than popping in.
const enter = { initial: { opacity: 0, y: 4, filter: 'blur(2px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.35, ease } };

/** A day's stops hang off a thin rail; each stop is a node on it. */
const RAIL = "relative mt-1.5 flex flex-col before:absolute before:inset-y-2 before:left-[3px] before:w-px before:bg-line before:content-['']";
const ROW = 'relative grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-2 py-1 pl-5 text-[13px] leading-5';

/** The rail node: grey once written, brand-coloured on the stop being written now. The caret is the only thing that blinks. */
function Node({ live }: { live?: boolean }) {
  return <span aria-hidden className={cn('absolute top-[10.5px] left-0 size-1.75 rounded-full ring-2 ring-surface transition-colors duration-300', live ? 'bg-brand' : 'bg-line-strong')} />;
}

/** The right-hand column of a stop: where it is and how long it takes, as those fields arrive. */
function StopMeta({ area, minutes }: { area: string | null; minutes: number | null }) {
  const duration = formatDuration(minutes);
  if (!area && !duration) return <span />;
  return (
    <span className="tabular flex max-w-44 min-w-0 animate-rise items-baseline justify-end gap-1.5 pl-2 text-[11px] text-subtle">
      {area && <span className="hidden truncate sm:inline">{area}</span>}
      {area && duration && <span aria-hidden className="hidden sm:inline">·</span>}
      {duration && <span className="shrink-0 whitespace-nowrap">{duration}</span>}
    </span>
  );
}

function GhostRow({ width }: { width: string }) {
  return (
    <li className={cn(ROW, 'min-h-7 items-center')} aria-hidden>
      <span className="absolute top-[10.5px] left-0 size-1.75 rounded-full border border-dashed border-line-strong bg-surface" />
      <span className="skeleton h-2.5 w-9" />
      <span className="skeleton h-2.5" style={{ width }} />
      <span className="skeleton h-2.5 w-10" />
    </li>
  );
}

/** The plan as it is being written: destination, then each day and its stops, blurring in. */
function LivePreview({ plan, writing }: { plan: LivePlan | null; writing: boolean }) {
  const reduce = useReducedMotion();
  const count = plan ? plan.days.reduce((n, d) => n + d.stops.length + 1, 0) : 0;
  const { ref, following, jump } = usePinnedToBottom<HTMLDivElement>(count);
  const motionProps = reduce ? {} : enter;
  const days = plan?.days ?? [];
  const stopCount = days.reduce((n, d) => n + d.stops.length, 0);

  return (
    <div className="relative h-full min-h-0">
    <div ref={ref} tabIndex={0} role="region" aria-label="Live itinerary preview" className="pane-scroll h-full overflow-y-auto overflow-x-hidden px-5 pb-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand" aria-live="off">
      {plan?.destination || plan?.title ? (
        <motion.div {...motionProps} className="mb-4 flex items-end justify-between gap-4 pt-4">
          <div className="min-w-0">
            {plan.destination && <p className="label text-[11px] text-brand">{plan.destination}</p>}
            {plan.title && <p className="mt-1 font-display text-[22px] leading-tight text-pretty text-ink-strong">{plan.title}</p>}
          </div>
          {/* The running total, set against the title so the header fills its row. */}
          {stopCount > 0 && (
            <p className="tabular shrink-0 pb-0.5 text-right text-[11px] leading-4 text-subtle">
              <span className="block text-[13px] font-medium text-ink">{plural(stopCount, 'stop')}</span>
              {plural(days.length, 'day')}
            </p>
          )}
        </motion.div>
      ) : (
        <div className="mb-5 flex pt-4 flex-col gap-2.5" aria-hidden>
          <span className="skeleton h-2.5 w-24" />
          <span className="skeleton h-5 w-3/4" />
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {days.map((day, i) => {
          const lastDay = i === days.length - 1;
          return (
            <motion.li key={i} {...motionProps}>
              {/* Stays pinned while its stops scroll beneath it, so a long day never loses its heading. */}
              <p className="sticky top-0 z-10 -mx-5 flex items-baseline gap-2 bg-surface px-5 py-1.5">
                <span className={cn('label tabular shrink-0 text-[11px]', lastDay && writing ? 'text-brand' : 'text-subtle')}>Day {pad2(i + 1)}</span>
                {day.title && <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{day.title}</span>}
                <span className="tabular ml-auto shrink-0 text-[11px] text-subtle">{plural(day.stops.length, 'stop')}</span>
              </p>
              <ul className={RAIL}>
                {day.stops.map((stop, j) => {
                  const live = writing && lastDay && j === day.stops.length - 1;
                  return (
                    <motion.li key={j} {...motionProps} className={cn(ROW, 'animate-flash rounded-md')}>
                      <Node live={live} />
                      <span className="label tabular text-[11px] whitespace-nowrap text-muted">{formatTime(stop.time) ?? 'Any'}</span>
                      <span className="truncate text-ink">
                        {stop.title}
                        {live && <span className="ml-0.5 inline-block h-3 w-[6px] animate-caret bg-brand align-[-1px]" aria-hidden />}
                      </span>
                      <StopMeta area={stop.area} minutes={stop.durationMinutes} />
                    </motion.li>
                  );
                })}
                {writing && lastDay && <GhostRow width="55%" />}
              </ul>
            </motion.li>
          );
        })}
        {!days.length && (
          <li aria-hidden>
            <span className="skeleton my-2 block h-2.5 w-14" />
            <ul className={RAIL}>
              <GhostRow width="70%" />
              <GhostRow width="52%" />
              <GhostRow width="62%" />
            </ul>
          </li>
        )}
      </ol>
    </div>
    {!following && <JumpToLatest onClick={jump} />}
    </div>
  );
}
