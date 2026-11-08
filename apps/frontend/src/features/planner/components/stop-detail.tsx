import { ArrowDown, ArrowUp, CalendarBlank, MapPin, Trash } from '@phosphor-icons/react';
import type { Day, Stop } from '@triptinker/contracts';
import { Button } from '@/components/ui/button';
import { WordsIn } from '@/components/ui/pulse-line';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDuration, mapsSearchUrl, pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from '../categories';

export type StopActions = {
  onMove: (to: number) => void;
  onMoveToDay: (dayId: string) => void;
  onRemove: () => void;
};

type Props = StopActions & {
  stop: Stop;
  index: number;
  count: number;
  dayId: string;
  days: Day[];
  destination: string;
  compact?: boolean;
  /** While a proposed change is being reviewed, only the map link is offered. */
  readOnly?: boolean;
};

/**
 * Everything about one stop, plus the edits you can make to it. Laid out as a card: a body
 * (meta line, title, area, description, tip) that scrolls when it is long, and a footer bar
 * of actions that always stays in view. Inline on phones it is the same, without the frame.
 */
export function StopDetail({ stop, index, count, dayId, days, destination, onMove, onMoveToDay, onRemove, compact, readOnly }: Props) {
  const meta = CATEGORY_META[stop.category];
  const duration = formatDuration(stop.durationMinutes);
  return (
    <div className={cn('flex flex-col', !compact && 'max-h-[34rem]')}>
      <div className={cn('flex min-h-0 flex-col gap-4', !compact && 'overflow-y-auto overscroll-contain p-6 [scrollbar-width:thin]')}>
        {!compact && (
          <header className="flex flex-col gap-1.5">
            <p className="label flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
              <span className="tabular text-ink">{stop.time ?? 'Any time'}</span>
              <span aria-hidden>·</span>
              <span style={{ color: meta.color }}>{meta.label}</span>
              {duration && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular">{duration}</span>
                </>
              )}
            </p>
            <h3 className="text-[24px] leading-[1.2] font-medium tracking-[-0.015em] text-pretty text-ink-strong">{stop.title}</h3>
            {stop.area && <p className="text-[14px] leading-5 text-muted">{stop.area}</p>}
          </header>
        )}
        {stop.description && (
          <p className="text-[15px] leading-6 text-muted">
            <WordsIn key={stop.id} text={stop.description} />
          </p>
        )}
        {stop.tip && (
          <div className="rounded-lg bg-sunken px-4 py-3">
            <p className="label text-[11px] text-brand">Tip</p>
            <p className="mt-1 text-[14px] leading-[21px] text-ink">{stop.tip}</p>
          </div>
        )}
      </div>
      <footer className={cn('flex shrink-0 items-center gap-2', compact ? 'pt-4' : 'border-t border-line px-6 py-3')}>
        <Button asChild size={compact ? 'icon-sm' : 'sm'} variant="secondary">
          <a href={mapsSearchUrl(stop.title, destination, stop.area)} target="_blank" rel="noreferrer" aria-label={compact ? `Open ${stop.title} in Maps` : undefined}>
            <MapPin /> {!compact && 'Maps'}
          </a>
        </Button>
        {!readOnly && (
          <div className="ml-auto flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Move earlier" disabled={index === 0} onClick={() => onMove(index - 1)}>
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Move later" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
              <ArrowDown />
            </Button>
            {days.length > 1 && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button size={compact ? 'icon-sm' : 'sm'} variant="ghost" aria-label="Move to another day">
                    <CalendarBlank /> {!compact && 'Move day'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-xl">
                  {days.map((day, i) =>
                    day.id === dayId ? null : (
                      <DropdownMenuItem key={day.id} onSelect={() => onMoveToDay(day.id)}>
                        <span className="label tabular text-[11px] text-subtle">{pad2(i + 1)}</span>
                        <span className="truncate">{day.title}</span>
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" variant="danger" onClick={onRemove} aria-label={`Remove ${stop.title}`} className="ml-1">
              <Trash /> Remove
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}
