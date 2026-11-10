import { useCallback, useState } from 'react';
import { z } from 'zod';
import { LIMITS } from '@triptinker/contracts';
import { STORAGE_KEYS } from '@/lib/keys';
import { readStored, writeStored } from '@/lib/storage';
import { storedTripSchema, type Trip } from './trip-store';

const KEY = STORAGE_KEYS.library;
const MAX_TRIPS = LIMITS.maxSavedTrips;

/** Each entry is validated on its own so one corrupt trip can't wipe the whole library. */
function load(): Trip[] {
  const raw = readStored(KEY, z.array(z.unknown()).max(MAX_TRIPS)) ?? [];
  const seen = new Set<string>();
  return raw
    .map((entry) => storedTripSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((trip) => {
      if (seen.has(trip.id)) return false;
      seen.add(trip.id);
      return true;
    });
}

export function useLibrary() {
  const [trips, setTrips] = useState<Trip[]>(load);

  const persist = useCallback((next: Trip[]) => {
    const ok = writeStored(KEY, next);
    if (ok) setTrips(next);
    return ok;
  }, []);

  const save = useCallback(
    (trip: Trip) => persist([trip, ...trips.filter((t) => t.id !== trip.id)].slice(0, MAX_TRIPS)),
    [persist, trips],
  );
  const remove = useCallback((id: string) => persist(trips.filter((t) => t.id !== id)), [persist, trips]);

  return { trips, save, remove, isSaved: (trip: Trip | null) => !!trip && trips.some((t) => t.id === trip.id && t.updatedAt === trip.updatedAt) };
}
