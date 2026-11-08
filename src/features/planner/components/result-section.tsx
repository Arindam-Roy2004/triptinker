import { ArrowClockwise, ArrowCounterClockwise, BookmarkSimple, CheckCircle, DownloadSimple, NotePencil, Warning } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Stop } from '@shared/schema';
import { ShimmerLabel } from '@/components/ai/shimmer';
import { Button } from '@/components/ui/button';
import { PixelFill } from '@/components/ui/pixel-fill';
import { PixelButton } from '@/components/ui/pixel-button';
import { PulseLine, WordsIn } from '@/components/ui/pulse-line';
import { Reveal } from '@/components/ui/reveal';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { buildChecks } from '../checks';
import { countStops } from '../operations';
import type { Trip } from '../trip-store';
import { StopDetail, type StopActions } from './stop-detail';
import { StopList } from './stop-list';
import { SceneBackdrop, WindowFrame } from './window-frame';

const PACE_LABEL = { relaxed: 'Relaxed', balanced: 'Balanced', packed: 'Packed' } as const;

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
  onExport: () => void;
  onNewTrip: () => void;
  onReorder: (dayId: string, from: number, to: number) => void;
  actionsFor: (dayId: string, stop: Stop, index: number) => StopActions;
};

/** One cell of the stats strip, with the same text family for values and captions. */
function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 bg-surface px-4 py-5 text-center">
      <span className="tabular flex items-center gap-1.5 text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink">
        {icon}
        {value}
      </span>
      <span className="label text-[11px] text-subtle">{label}</span>
    </div>
  );
}

function IconButton({ label, shortcut, onClick, disabled, children }: { label: string; shortcut?: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="secondary" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
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
  const { trip, sceneSrc, activeDayId, onActiveDay } = props;
  const { itinerary } = trip;
  const [selected, setSelected] = useState<string | null>(null);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const dayStrip = useRef<HTMLDivElement>(null);

  const dayIndex = Math.max(0, itinerary.days.findIndex((d) => d.id === activeDayId));
  const day = itinerary.days[dayIndex];
  const selectedIndex = day.stops.findIndex((s) => s.id === selected);
  // On desktop there is always a stop in the window; on mobile nothing is expanded until tapped.
  const current = selectedIndex !== -1 ? selectedIndex : desktop && day.stops.length ? 0 : -1;
  const currentStop = current >= 0 ? day.stops[current] : null;
  const notices = buildChecks(itinerary, trip.meta, trip.warnings).filter((c) => c.status === 'warn');

  useEffect(() => {
    dayStrip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeDayId]);

  return (
    <section id="trip" aria-labelledby="trip-title" className="scroll-mt-20 overflow-hidden rounded-md bg-surface shadow-lift">
      {/* Header */}
      <div className="flex flex-col gap-6 bg-surface px-6 py-8 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="min-w-0">
          <Reveal as="div" index={0}>
            <ShimmerLabel number="01" className="text-[12px]">{itinerary.destination}</ShimmerLabel>
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
        <Reveal as="div" index={3} className="flex flex-wrap items-center gap-2">
          <IconButton label="Undo" shortcut="⌘Z" onClick={props.onUndo} disabled={!props.canUndo}>
            <ArrowCounterClockwise />
          </IconButton>
          <IconButton label="Redo" shortcut="⇧⌘Z" onClick={props.onRedo} disabled={!props.canRedo}>
            <ArrowClockwise />
          </IconButton>
          <IconButton label="Download JSON" onClick={props.onExport}>
            <DownloadSimple />
          </IconButton>
          <IconButton label="New trip" onClick={props.onNewTrip}>
            <NotePencil />
          </IconButton>
          <PixelButton variant={props.saved ? 'secondary' : 'primary'} onClick={props.onSave} disabled={props.saved}>
            <BookmarkSimple weight={props.saved ? 'fill' : 'regular'} /> {props.saved ? 'Saved' : 'Save trip'}
          </PixelButton>
        </Reveal>
      </div>

      {/* Stats */}
      <Reveal as="div" index={4} className="relative grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        <PulseLine className="absolute inset-x-0 top-0 z-10" duration={2.8} repeatDelay={4} />
        <Stat label="Days" value={String(itinerary.days.length)} />
        <Stat label="Stops" value={String(countStops(itinerary))} />
        <Stat label="Pace" value={trip.request ? PACE_LABEL[trip.request.pace] : '—'} />
        {trip.source === 'sample' ? (
          <Stat label="Hand-written sample" value="Sample" />
        ) : (
          <Stat
            label={trip.meta?.repairedFrom ? 'Validated after a repair' : 'Generated by AI'}
            value={trip.meta?.repairedFrom ? 'Repaired' : 'Validated'}
            icon={<CheckCircle size={18} weight="fill" className="text-ok" />}
          />
        )}
      </Reveal>

      {/* What was repaired or cleaned up, when anything was — the only part of validation a traveller needs to see. */}
      {notices.length > 0 && (
        <ul aria-label="Validation notes" className="flex flex-col gap-1.5 border-b border-line bg-warn-wash/50 px-6 py-3 lg:px-8">
          {notices.map((check, i) => (
            <li key={i} className="flex items-start gap-2 text-[14px] leading-5 text-ink">
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-warn" />
              <span>
                <span className="font-medium">{check.label}</span> <span className="text-muted">— {check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Days */}
      <div
        ref={dayStrip}
        role="tablist"
        aria-label="Days"
        onKeyDown={(e) => onTabKeys(e, itinerary.days.map((d) => d.id), day.id, onActiveDay)}
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
            }}
            className={cn(
              'group relative flex min-w-44 flex-1 flex-col items-start gap-1 overflow-hidden border-r border-line px-6 py-4 text-left outline-offset-[-2px] transition-colors last:border-r-0',
              d.id !== day.id && 'hover:bg-sunken/60',
            )}
          >
            {/* Only the selected stop gets the pixel field; the day keeps just the drawing line. */}
            {d.id === day.id && <PixelFill key={d.id} pixels={false} />}
            <span className={cn('label tabular relative text-[11px]', d.id === day.id ? 'text-brand' : 'text-subtle')}>
              Day {pad2(i + 1)} · {d.stops.length} stops
            </span>
            <span className={cn('relative max-w-56 truncate text-[15px] font-medium transition-colors', d.id === day.id ? 'text-ink' : 'text-muted group-hover:text-brand')}>{d.title}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 lg:border-r lg:border-line">
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
            onSelect={(id) => setSelected((prev) => (!desktop && prev === id ? null : id))}
            inline={!desktop}
            actionsFor={(stop, index) => props.actionsFor(day.id, stop, index)}
            onReorder={(from, to) => props.onReorder(day.id, from, to)}
          />
        </div>
        {desktop && (
          <SceneBackdrop src={sceneSrc} className="min-h-[460px] p-8">
            {currentStop ? (
              <motion.div key={currentStop.id} initial={{ opacity: 0, filter: 'blur(8px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="sticky top-24">
                <WindowFrame title={`Day ${pad2(dayIndex + 1)} — stop ${pad2(current + 1)} of ${pad2(day.stops.length)}`}>
                  <StopDetail stop={currentStop} index={current} count={day.stops.length} dayId={day.id} days={itinerary.days} destination={itinerary.destination} {...props.actionsFor(day.id, currentStop, current)} />
                </WindowFrame>
              </motion.div>
            ) : (
              <WindowFrame title="No stops">
                <p className="p-6 text-[15px] text-muted">This day is empty.</p>
              </WindowFrame>
            )}
          </SceneBackdrop>
        )}
      </div>

      {/* Notes */}
      {itinerary.notes.length > 0 && (
        <div className="border-t border-line">
          <p className="label bg-surface px-6 py-4 text-[12px] text-muted lg:px-8">Before you go</p>
          <ol className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
            {itinerary.notes.map((note, i) => (
              <li key={note} className="flex gap-4 bg-surface px-6 py-5 lg:px-8">
                <span className="label tabular pt-0.5 text-[12px] text-brand">{pad2(i + 1)}</span>
                <span className="text-[15px] leading-[22px] text-muted">{note}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
