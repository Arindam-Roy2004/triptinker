import { BookmarksSimple, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { pad2, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { countStops } from '../operations';
import type { Trip } from '../trip-store';

type Props = { trips: Trip[]; currentId: string | null; onOpen: (trip: Trip) => void; onDelete: (id: string) => void };

export function LibrarySheet({ trips, currentId, onOpen, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" aria-label={`Saved trips (${trips.length})`}>
          <BookmarksSimple />
          <span className="hidden sm:inline">Saved</span>
          {trips.length > 0 && <span className="tabular rounded-md bg-sunken px-1.5 text-[11px] text-muted">{trips.length}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-line p-6">
          <p className="label text-[11px] text-brand">Library</p>
          <SheetTitle className="text-[24px] font-normal tracking-[-0.02em]">Saved trips</SheetTitle>
          <SheetDescription>Stored in this browser only.</SheetDescription>
        </SheetHeader>
        {trips.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[17px] font-medium">No saved trips yet</p>
            <p className="mt-1 text-[15px] text-muted">Use “Save trip” on any itinerary to keep it here.</p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto">
            {trips.map((trip) => (
              <li key={trip.id} className={cn('group relative border-b border-line', trip.id === currentId && 'bg-bg')}>
                {trip.id === currentId && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand" aria-hidden />}
                <button
                  type="button"
                  onClick={() => {
                    onOpen(trip);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col gap-1 px-6 py-4 pr-14 text-left hover:bg-bg"
                >
                  <span className="label text-[11px] text-muted">{trip.itinerary.destination}</span>
                  <span className="text-[15px] font-medium">{trip.itinerary.title}</span>
                  <span className="label tabular text-[11px] text-subtle">
                    {pad2(trip.itinerary.days.length)} days · {pad2(countStops(trip.itinerary))} stops · {relativeTime(trip.updatedAt)}
                    {trip.source === 'sample' && ' · sample'}
                  </span>
                </button>
                {confirming === trip.id ? (
                  <div className="absolute inset-y-3 right-3 flex items-center gap-1 rounded-xl bg-surface px-1 shadow-[var(--shadow-float)]">
                    <Button size="sm" variant="danger" onClick={() => (onDelete(trip.id), setConfirming(null))}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${trip.itinerary.title}`}
                    onClick={() => setConfirming(trip.id)}
                    className="absolute top-4 right-4 text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
