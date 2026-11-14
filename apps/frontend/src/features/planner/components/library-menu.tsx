import { BookmarkSimple, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SlidingNumber } from '@/components/ui/sliding-number';
import { pad2, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { countStops } from '../operations';
import type { Trip } from '../trip-store';

type Props = { trips: Trip[]; currentId: string | null; onOpen: (trip: Trip) => void; onDelete: (id: string) => void };

/**
 * Saved trips, in a popover under the header button (the same surface as the trip options):
 * it is only as tall as what it holds, so an empty library is a small note, not a full-height
 * panel. A long list scrolls inside the popover instead of growing past the screen.
 */
export function LibraryMenu({ trips, currentId, onOpen, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label={`Saved trips (${trips.length})`} className="px-2 sm:px-4">
          <BookmarkSimple />
          <span className="hidden sm:inline">Saved</span>
          {trips.length > 0 && <span className="tabular rounded-md bg-sunken px-1.5 text-[11px] text-muted"><SlidingNumber value={trips.length} /></span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={12} collisionPadding={16} className="flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden p-0">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
          <p className="text-[15px] font-medium text-ink">Saved trips</p>
          <p className="text-[12px] text-subtle">In this browser</p>
        </div>
        {trips.length === 0 ? (
          <div className="flex items-start gap-3 px-4 py-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-muted">
              <BookmarkSimple size={15} />
            </span>
            <div>
              <p className="text-[14px] font-medium text-ink">Nothing saved yet</p>
              <p className="mt-0.5 text-[13px] leading-5 text-muted">Use “Save trip” on a plan to keep it here.</p>
            </div>
          </div>
        ) : (
          <ul className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            {trips.map((trip) => (
              <li key={trip.id} className={cn('group relative border-b border-line last:border-b-0', trip.id === currentId && 'bg-sunken/60')}>
                {confirming === trip.id ? (
                  // The row itself becomes the question, so nothing is drawn over the trip's name.
                  <div role="group" aria-label={`Delete ${trip.itinerary.title}?`} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-ink">Delete this trip?</p>
                      <p className="truncate text-[12px] leading-5 text-muted">{trip.itinerary.title}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => (onDelete(trip.id), setConfirming(null))}>
                      Delete
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(trip);
                        setOpen(false);
                      }}
                      aria-current={trip.id === currentId ? 'true' : undefined}
                      className="flex w-full flex-col gap-0.5 px-4 py-3 pr-12 text-left transition-colors hover:bg-sunken/60 focus-visible:bg-sunken focus-visible:outline-none"
                    >
                      <span className="label truncate text-[11px] text-muted">
                        {trip.itinerary.destination}
                        {trip.id === currentId && <span className="text-brand"> · open now</span>}
                      </span>
                      <span className="truncate text-[14px] font-medium text-ink">{trip.itinerary.title}</span>
                      <span className="label tabular text-[11px] text-subtle">
                        {pad2(trip.itinerary.days.length)} days · {pad2(countStops(trip.itinerary))} stops · {relativeTime(trip.updatedAt)}
                        {trip.source === 'sample' && ' · sample'}
                      </span>
                    </button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${trip.itinerary.title}`}
                      onClick={() => setConfirming(trip.id)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <Trash />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
