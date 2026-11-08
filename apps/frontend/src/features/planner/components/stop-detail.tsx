import { ArrowDown, ArrowUp, CalendarBlank, Clock, Lightbulb, MapPin, Trash } from '@phosphor-icons/react';
import type { Day, Stop } from '@triptinker/contracts';
import { Button } from '@/components/ui/button';
import { WordsIn } from '@/components/ui/pulse-line';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDuration, formatTime, mapsSearchUrl, pad2 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    <div role={compact ? undefined : 'region'} aria-label={compact ? undefined : 'Stop details'} className={cn('flex flex-col', !compact && 'max-h-[min(30rem,calc(100dvh-12rem))]')}>
      <div className={cn('flex min-h-0 flex-col gap-4', !compact && 'pane-scroll overflow-y-auto p-5')}>
        {!compact && (
          <header className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] leading-5">
              <span className="tabular mr-0.5 inline-flex items-center gap-1.5 rounded-md bg-sunken px-2 py-0.5 font-medium text-ink"><Clock size={12} aria-hidden />{formatTime(stop.time) ?? 'Any time'}</span>
              <span className="inline-flex items-center gap-1.5" style={{ color: meta.color }}><meta.icon size={13} aria-hidden />{meta.label}</span>
              {duration && (
                <>
                  <span aria-hidden className="text-subtle">·</span>
                  <span className="tabular text-subtle">{duration}</span>
                </>
              )}
            </div>
            <h3 className="text-[22px] leading-[1.25] font-medium tracking-[-0.02em] text-pretty text-ink-strong">{stop.title}</h3>
            {stop.area && <p className="flex items-center gap-1.5 text-[13px] leading-5 text-subtle"><MapPin size={13} className="shrink-0" aria-hidden />{stop.area}</p>}
          </header>
        )}
        {stop.description && (
          <p className="text-[14px] leading-[23px] text-muted">
            <WordsIn key={stop.id} text={stop.description} />
          </p>
        )}
        {stop.tip && (
          <aside aria-label="Travel tip" className="flex w-full flex-col items-center rounded-lg border border-line bg-sunken/55 px-5 py-3.5 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-brand"><Lightbulb size={13} aria-hidden />Good to know</p>
            <p className="mt-1.5 max-w-[46ch] text-[13px] leading-[21px] text-balance break-words text-muted">{stop.tip}</p>
          </aside>
        )}
      </div>
      <footer className={cn('flex shrink-0 items-center justify-between gap-2', compact ? 'pt-3' : 'border-t border-line bg-sunken/30 px-5 py-3')}>
        <Button asChild size={compact ? 'icon-sm' : 'sm'} variant="secondary">
          <a href={mapsSearchUrl(stop.title, destination, stop.area)} target="_blank" rel="noreferrer" aria-label={compact ? `Open ${stop.title} in Maps` : undefined}>
            <MapPin /> {!compact && 'Maps'}
          </a>
        </Button>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <div role="group" aria-label="Stop order" className="flex items-center rounded-md border border-line bg-surface p-0.5">
              <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Move earlier" disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp /></Button></TooltipTrigger><TooltipContent>Move earlier</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Move later" disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown /></Button></TooltipTrigger><TooltipContent>Move later</TooltipContent></Tooltip>
            </div>
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
            <Tooltip>
              <TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${stop.title}`} className="text-subtle hover:bg-err-wash hover:text-err"><Trash /></Button></TooltipTrigger>
              <TooltipContent>Remove stop</TooltipContent>
            </Tooltip>
          </div>
        )}
      </footer>
    </div>
  );
}
