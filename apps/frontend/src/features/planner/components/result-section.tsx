import { ArrowClockwise, ArrowCounterClockwise, BookmarkSimple, Check, Copy, DownloadSimple, FileText, GlobeSimple, Info, Plus, Printer, Sun } from '@phosphor-icons/react';
import { AnimateIcon } from '@animate-ui/react/icons';
import { Cancel01 } from '@/components/animate-ui/icons/hugeicons/cancel-01';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Category, Day, Stop } from '@triptinker/contracts';
import { ShimmerLabel } from '@/components/ai/shimmer';
import { Button } from '@/components/ui/button';
import { PixelFill } from '@/components/ui/pixel-fill';
import { PixelButton } from '@/components/ui/pixel-button';
import { PulseLine, WordsIn } from '@/components/ui/pulse-line';
import { Reveal } from '@/components/ui/reveal';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration, formatTime, pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from '../categories';
import type { ReviewMarks } from '../diff';
import type { Trip } from '../trip-store';
import { StopDetail, type StopActions } from './stop-detail';
import { StopList } from './stop-list';
import { SceneBackdrop, WindowFrame } from './window-frame';
import { SourceStack } from './web-search';

const PACE_LABEL = {
  relaxed: 'Relaxed',
  balanced: 'Balanced',
  packed: 'Full days',
} as const;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

type Props = {
  trip: Trip;
  sceneSrc: string;
  activeDayId: string;
  onActiveDay: (dayId: string) => void;
  saved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  /** Closes the sample and returns the page to its starting state. */
  onHideSample?: () => void;
  /** Take the trip out of the app: print / save as PDF, a text file, or copied text. */
  onExport: (format: ExportFormat) => void;
  onReorder: (dayId: string, from: number, to: number) => void;
  actionsFor: (dayId: string, stop: Stop, index: number) => StopActions;
  /** A proposed change being reviewed: `trip` is then the proposal, and these mark what changed. */
  review?: ReviewMarks | null;
  /** Editing is paused while a change is being made or reviewed. */
  locked?: boolean;
  /** A change that was just applied: its stops are marked and tinted for a moment. */
  highlight?: ReviewMarks | null;
  /** The change bar, shown as a row right under the day panel. */
  children?: ReactNode;
  /** Pre-fills the change bar with a request for stops on an empty day. */
  onAskForDay?: (dayNumber: number) => void;
};

type StatItem = { label: string; value: string };

/** Stats that follow the data: a cell exists only when the plan has something to say for it. */
function tripStats(trip: Trip): StatItem[] {
  const { itinerary, request } = trip;
  const stops = itinerary.days.flatMap((d) => d.stops);
  const areas = new Set(stops.map((s) => s.area?.trim().toLowerCase()).filter(Boolean)).size;
  const all: (StatItem | null)[] = [
    {
      label: itinerary.days.length === 1 ? 'Day' : 'Days',
      value: String(itinerary.days.length),
    },
    {
      label: stops.length === 1 ? 'Stop' : 'Stops',
      value: String(stops.length),
    },
    areas > 1 ? { label: 'Areas', value: String(areas) } : null,
    request ? { label: 'Pace', value: PACE_LABEL[request.pace] } : null,
  ];
  return all.filter((s): s is StatItem => s !== null).slice(0, 4);
}

/** Column classes per cell count, so the strip never leaves an empty cell. */
const STAT_COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
} as const;

function Stat({ label, value }: StatItem) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 bg-surface px-4 py-5 text-center">
      <span className="tabular text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink">{value}</span>
      <span className="label text-[11px] text-subtle">{label}</span>
    </div>
  );
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** A one-line summary under a day's stops, built from whatever that day's data has. */
function DayGlance({ day }: { day: Day }) {
  const timed = day.stops.filter((s) => s.time);
  const first = timed[0]?.time ?? null;
  const last = timed.at(-1);
  const end = last?.time && last.durationMinutes ? addMinutes(last.time, last.durationMinutes) : null;
  const minutes = day.stops.reduce((n, s) => n + (s.durationMinutes ?? 0), 0);
  const counts = new Map<Category, number>();
  for (const stop of day.stops) counts.set(stop.category, (counts.get(stop.category) ?? 0) + 1);
  if (!day.stops.length) return null;
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line px-6 py-4 text-[13px] text-muted">
      {first && (
        <span className="tabular">
          <span className="label mr-1.5 text-[11px] text-subtle">Time</span>
          {formatTime(first)}
          {end && end !== first && ` – ${formatTime(end)}`}
        </span>
      )}
      {minutes > 0 && (
        <span className="tabular">
          <span className="label mr-1.5 text-[11px] text-subtle">Planned</span>
          {formatDuration(minutes)}
        </span>
      )}
      <span className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {[...counts].map(([category, n]) => {
          const meta = CATEGORY_META[category];
          return (
            <span key={category} className="flex items-center gap-1">
              <meta.icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
              {n > 1 && <span className="tabular">{n}</span>}
              {meta.label}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function IconButton({ label, description, shortcut, onClick, disabled, children }: { label: string; description: string; shortcut?: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button size="sm" variant="secondary" onClick={onClick} disabled={disabled} aria-label={label}>
            {children} {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {description}
        {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export type ExportFormat = 'pdf' | 'text' | 'copy';

function DownloadMenu({ onExport }: { onExport: (format: ExportFormat) => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="secondary" aria-label="Download trip">
              <DownloadSimple />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Download trip</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuItem onSelect={() => onExport('pdf')} className="items-start py-2">
          <Printer className="mt-0.5" />
          <span className="flex flex-col">
            <span>Save as PDF or print</span>
            <span className="text-[12px] text-muted">Day-by-day pages with map links</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('text')} className="items-start py-2">
          <FileText className="mt-0.5" />
          <span className="flex flex-col">
            <span>Download as text</span>
            <span className="text-[12px] text-muted">Opens in any notes app, offline</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('copy')} className="items-start py-2">
          <Copy className="mt-0.5" />
          <span className="flex flex-col">
            <span>Copy to clipboard</span>
            <span className="text-[12px] text-muted">Paste into a chat or email</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Arrow-key navigation for a row of tabs (WAI-ARIA tabs pattern). */
function onTabKeys(event: KeyboardEvent<HTMLElement>, ids: string[], current: string, select: (id: string) => void) {
  const i = ids.indexOf(current);
  const next = event.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : event.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : null;
  if (!next) return;
  event.preventDefault();
  select(next);
  requestAnimationFrame(() => (event.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus());
}

export function ResultSection(props: Props) {
  const reduce = useReducedMotion();
  const { trip, sceneSrc, activeDayId, onActiveDay, review, locked, highlight } = props;
  const marked = review ?? highlight ?? null;
  const { itinerary } = trip;
  const [selected, setSelected] = useState<string | null>(null);
  // Where the selection was. When the selected stop is removed, the stop that moves into its
  // place is shown next, rather than jumping back to the top of the day.
  const [anchor, setAnchor] = useState(0);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const dayStrip = useRef<HTMLDivElement>(null);

  const dayIndex = Math.max(
    0,
    itinerary.days.findIndex((d) => d.id === activeDayId),
  );
  const day = itinerary.days[dayIndex];
  const selectedIndex = day.stops.findIndex((s) => s.id === selected);
  // On desktop there is always a stop in the window; on mobile nothing is expanded until tapped.
  const current = selectedIndex !== -1 ? selectedIndex : desktop && day.stops.length ? Math.min(anchor, day.stops.length - 1) : -1;
  const currentStop = current >= 0 ? day.stops[current] : null;
  const stats = tripStats(trip);

  // A stop may be shown by the desktop fallback before the user explicitly selects it.
  // Pin its identity before moving it, so repeated arrows keep moving that same stop.
  const actionsFor = (stop: Stop, index: number): StopActions => {
    const actions = props.actionsFor(day.id, stop, index);
    return {
      ...actions,
      onMove: (to) => {
        setSelected(stop.id);
        setAnchor(to);
        actions.onMove(to);
      },
    };
  };

  useEffect(() => {
    dayStrip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, [activeDayId]);

  return (
    <section id="trip" aria-labelledby="trip-title" className="scroll-mt-20 overflow-hidden rounded-md bg-surface shadow-lift">
      {/* Header */}
      <div className="flex flex-col gap-6 bg-surface px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Reveal as="div" index={0}>
            <div className="flex flex-wrap items-center gap-2">
              <ShimmerLabel number="01" className="text-[12px]">
                {itinerary.destination}
              </ShimmerLabel>
              {trip.source === 'sample' && (
                <span className="label inline-flex items-center gap-1 rounded-full border border-edge-control py-px pr-1 pl-2 text-[10px] text-muted">
                  Sample
                  {props.onHideSample && (
                    // Same cross as the hero's toggle: it turns a quarter on hover before the trip folds away.
                    <AnimateIcon animateOnHover asChild>
                      <button type="button" onClick={props.onHideSample} aria-label="Hide sample" className="grid size-3.5 place-items-center rounded-full text-subtle transition-colors hover:bg-ink/8 hover:text-ink">
                        <Cancel01 size={10} aria-hidden />
                      </button>
                    </AnimateIcon>
                  )}
                </span>
              )}
            </div>
          </Reveal>
          <Reveal as="div" index={1}>
            <h2 id="trip-title" className="mt-3 max-w-[22ch] font-display text-[36px] leading-[1.08] text-balance text-ink-strong sm:text-[48px]">
              {itinerary.title}
            </h2>
          </Reveal>
          {itinerary.summary && (
            <Reveal as="p" index={2} className="mt-3 max-w-[60ch] text-[16px] leading-6 text-muted">
              {itinerary.summary}
            </Reveal>
          )}
        </div>
        <Reveal as="div" index={3} className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <IconButton label="Undo" description={props.canUndo ? 'Undo last change' : 'No changes to undo'} shortcut="⌘Z" onClick={props.onUndo} disabled={locked || !props.canUndo}>
            <ArrowCounterClockwise />
          </IconButton>
          <IconButton label="Redo" description={props.canRedo ? 'Redo last undone change' : 'No changes to redo'} shortcut="⇧⌘Z" onClick={props.onRedo} disabled={locked || !props.canRedo}>
            <ArrowClockwise />
          </IconButton>
          <DownloadMenu onExport={props.onExport} />
          <PixelButton variant={props.saved ? 'secondary' : 'primary'} onClick={props.onSave} disabled={locked || props.saved} className="flex-1 lg:flex-none">
            {props.saved ? <Check /> : <BookmarkSimple />} {props.saved ? 'Saved' : 'Save trip'}
          </PixelButton>
        </Reveal>
      </div>

      {/* Stats */}
      <Reveal as="div" index={4} className={cn('relative grid gap-px border-b border-line bg-edge', STAT_COLS[stats.length as keyof typeof STAT_COLS])}>
        <PulseLine className="absolute inset-x-0 top-0 z-10" duration={2.8} repeatDelay={4} />
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </Reveal>

      {/* Days */}
      <div
        ref={dayStrip}
        role="tablist"
        aria-label="Days"
        onKeyDown={(e) =>
          onTabKeys(
            e,
            itinerary.days.map((d) => d.id),
            day.id,
            onActiveDay,
          )
        }
        className="no-scrollbar flex overflow-x-auto border-b border-line"
      >
        {itinerary.days.map((d, i) => (
          <button
            key={d.id}
            role="tab"
            data-tab={d.id}
            aria-selected={d.id === day.id}
            tabIndex={d.id === day.id ? 0 : -1}
            onClick={() => {
              onActiveDay(d.id);
              setSelected(null);
              setAnchor(0);
            }}
            className={cn(
              'group relative flex flex-1 flex-col items-start gap-2 overflow-hidden border-r border-line px-6 py-4 text-left outline-offset-[-2px] transition-colors last:border-r-0',
              marked?.perDay[i] ? 'min-w-60' : 'min-w-44',
              d.id !== day.id && 'hover:bg-sunken/60',
            )}
          >
            {/* Only the selected stop gets the pixel field; the day keeps just the drawing line. */}
            {d.id === day.id && <PixelFill key={d.id} pixels={false} />}
            <span className="relative flex w-full items-center justify-between gap-3">
              <span className={cn('label tabular shrink-0 text-[11px] whitespace-nowrap', d.id === day.id ? 'text-brand' : 'text-subtle')}>Day {pad2(i + 1)}</span>
              {!marked?.perDay[i] && (
                <span className="label tabular shrink-0 text-[11px] whitespace-nowrap text-subtle">
                  {d.stops.length} {d.stops.length === 1 ? 'stop' : 'stops'}
                </span>
              )}
              {!!marked?.perDay[i] &&
                (review ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-warn/15 bg-warn-wash px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-warn">
                    {marked.perDay[i]} {marked.perDay[i] === 1 ? 'change' : 'changes'}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-ok/15 bg-ok-wash px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-ok">Updated</span>
                ))}
            </span>
            <span className={cn('relative line-clamp-2 max-w-full text-[15px] font-medium text-pretty transition-colors', d.id === day.id ? 'text-ink' : 'text-muted group-hover:text-brand')}>{d.title}</span>
          </button>
        ))}
      </div>

      {day.stops.length === 0 && !review?.removedByDay.get(dayIndex)?.length ? (
        // An empty day gets one calm state across the whole width, with the two ways out of it.
        <div className="flex flex-col items-center gap-4 border-b border-line px-6 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-sunken text-muted">
            <Sun size={20} />
          </span>
          <div>
            <p className="text-[17px] font-medium text-ink">Day {pad2(dayIndex + 1)} is free</p>
            <p className="mt-1 max-w-[42ch] text-[15px] leading-[22px] text-muted">Every stop on this day was removed. Bring the last one back, or ask for new ideas.</p>
          </div>
          {!locked && (
            <div className="flex flex-wrap justify-center gap-2">
              {props.canUndo && (
                <Button variant="secondary" size="sm" onClick={props.onUndo}>
                  <ArrowCounterClockwise /> Undo
                </Button>
              )}
              {props.onAskForDay && (
                <Button variant="primary" size="sm" onClick={() => props.onAskForDay?.(dayIndex + 1)}>
                  <Plus /> Suggest stops
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col lg:max-h-[38rem] lg:border-r lg:border-line">
            {day.summary && (
              <p className="border-b border-line px-6 py-4 text-[15px] leading-[22px] text-muted">
                <WordsIn key={day.id} text={day.summary} />
              </p>
            )}
            <StopList
              day={day}
              days={itinerary.days}
              destination={itinerary.destination}
              selectedId={currentStop?.id ?? null}
              onSelect={(id) => {
                setSelected((prev) => (!desktop && prev === id ? null : id));
                setAnchor(
                  Math.max(
                    0,
                    day.stops.findIndex((s) => s.id === id),
                  ),
                );
              }}
              inline={!desktop}
              actionsFor={actionsFor}
              onReorder={(from, to) => {
                if (currentStop) setSelected(currentStop.id);
                if (from === current) setAnchor(to);
                props.onReorder(day.id, from, to);
              }}
              marks={marked?.byStop}
              flash={!review && !!highlight}
              removed={review?.removedByDay.get(dayIndex)}
              locked={locked}
            />
            <DayGlance day={day} />
          </div>
          {desktop && (
            <SceneBackdrop src={sceneSrc} className="p-4 lg:p-5">
              {currentStop ? (
                <motion.div
                  key={currentStop.id}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="sticky top-24"
                >
                  <WindowFrame
                    title={`Day ${pad2(dayIndex + 1)} · stop ${pad2(current + 1)} of ${pad2(day.stops.length)}`}
                    className="rounded-xl shadow-elevated"
                  >
                    <StopDetail
                      readOnly={locked}
                      stop={currentStop}
                      index={current}
                      count={day.stops.length}
                      dayId={day.id}
                      days={itinerary.days}
                      destination={itinerary.destination}
                      {...actionsFor(currentStop, current)}
                    />
                  </WindowFrame>
                </motion.div>
              ) : null}
            </SceneBackdrop>
          )}
        </div>
      )}

      {/* The change bar sits right under the day it changes. */}
      {props.children}

      {/* Notes */}
      {itinerary.notes.length > 0 && (
        <div className="border-t border-line">
          <p className="label bg-surface px-6 py-4 text-[12px] text-muted">Before you go</p>
          <ol className="grid grid-cols-1 gap-px border-t border-line bg-edge sm:grid-cols-2">
            {itinerary.notes.map((note, i) => (
              <li key={note} className="flex gap-4 bg-surface px-6 py-5 sm:[&:last-child:nth-child(odd)]:col-span-2">
                <span className="label tabular pt-0.5 text-[12px] text-brand">{pad2(i + 1)}</span>
                <span className="text-[15px] leading-[22px] text-muted">{note}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Only what changes how the plan reads: stops the checks had to drop, and the pages it was grounded in. */}
      {(trip.warnings.length > 0 || trip.sources.length > 0) && (
        <div aria-label="About this plan" className="flex flex-col items-center gap-1.5 border-t border-line px-6 py-4 text-center text-[13px] leading-5">
          {trip.warnings.map((note) => (
            <p key={note} className="flex items-start gap-2 text-muted">
              <Info size={14} className="mt-[3px] shrink-0 text-subtle" />
              {note}
            </p>
          ))}
          {trip.sources.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-subtle">
              <GlobeSimple size={14} className="shrink-0" aria-hidden />
              <span>Grounded in</span>
              <SourceStack sources={trip.sources} label={`${trip.sources.length} ${trip.sources.length === 1 ? 'source' : 'sources'}`} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
