import { ArrowDown, ArrowUp, CalendarBlank, Lightbulb, MapPinLine, Trash } from '@phosphor-icons/react';
import type { Day, Stop } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { WordsIn } from '@/components/ui/pulse-line';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDuration, mapsSearchUrl, pad2 } from '@/lib/format';
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
};

/** Everything about one stop, plus the edits you can make to it. */
export function StopDetail({ stop, index, count, dayId, days, destination, onMove, onMoveToDay, onRemove, compact }: Props) {
  const meta = CATEGORY_META[stop.category];
  const duration = formatDuration(stop.durationMinutes);
  return (
    <div className={compact ? 'flex flex-col gap-4' : 'flex flex-col gap-5 p-6'}>
      {!compact && (
        <div>
          <p className="label flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span className="text-ink">{stop.time ?? 'Any time'}</span>
            <span>·</span>
            <span style={{ color: meta.color }}>{meta.label}</span>
            {duration && (
              <>
                <span>·</span>
                <span>{duration}</span>
              </>
            )}
          </p>
          <h3 className="mt-2 text-[24px] leading-[1.2] font-medium tracking-[-0.015em] text-ink-strong">{stop.title}</h3>
          {stop.area && <p className="mt-1 text-[14px] text-muted">{stop.area}</p>}
        </div>
      )}
      {stop.description && (
        <p className="text-[15px] leading-6 text-muted">
          <WordsIn key={stop.id} text={stop.description} />
        </p>
      )}
      {stop.tip && (
        <p className="flex gap-3 rounded-xl border border-brand/15 bg-brand-wash px-4 py-3 text-[14px] leading-[21px] text-ink">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>
            <span className="label mr-1 text-[11px] text-brand">Tip</span> {stop.tip}
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="secondary">
          <a href={mapsSearchUrl(stop.title, destination, stop.area)} target="_blank" rel="noreferrer">
            <MapPinLine /> Maps
          </a>
        </Button>
        <span className="flex-1" />
        <Button size="icon-sm" variant="ghost" aria-label="Move earlier" disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Move later" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown />
        </Button>
        {days.length > 1 && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="Move to another day">
                <CalendarBlank /> Move day
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
        <Button size="sm" variant="danger" onClick={onRemove} aria-label={`Remove ${stop.title}`}>
          <Trash /> Remove
        </Button>
      </div>
    </div>
  );
}
