import type { Itinerary, Stop } from '@shared/schema';

/**
 * What a refinement changed, matched by stop id (the model is asked to echo ids back).
 * Used to show "+2 added, 1 removed, 3 changed" before the traveller accepts the edit.
 */

export type StopChange =
  | { type: 'added'; stop: Stop; dayTitle: string }
  | { type: 'removed'; stop: Stop; dayTitle: string }
  | { type: 'changed'; before: Stop; after: Stop; dayTitle: string; fields: string[] }
  | { type: 'moved'; stop: Stop; fromDay: string; toDay: string };

const FIELDS: { key: keyof Stop; label: string }[] = [
  { key: 'title', label: 'name' },
  { key: 'time', label: 'time' },
  { key: 'description', label: 'details' },
  { key: 'durationMinutes', label: 'duration' },
  { key: 'category', label: 'type' },
  { key: 'area', label: 'area' },
  { key: 'tip', label: 'tip' },
];

function index(itinerary: Itinerary) {
  const map = new Map<string, { stop: Stop; dayTitle: string; dayIndex: number }>();
  itinerary.days.forEach((day, dayIndex) => day.stops.forEach((stop) => map.set(stop.id, { stop, dayTitle: day.title, dayIndex })));
  return map;
}

export function diffItineraries(before: Itinerary, after: Itinerary) {
  const old = index(before);
  const next = index(after);
  const changes: StopChange[] = [];

  for (const [id, entry] of next) {
    const prior = old.get(id);
    if (!prior) {
      changes.push({ type: 'added', stop: entry.stop, dayTitle: entry.dayTitle });
      continue;
    }
    const fields = FIELDS.filter(({ key }) => prior.stop[key] !== entry.stop[key]).map(({ label }) => label);
    if (prior.dayIndex !== entry.dayIndex) changes.push({ type: 'moved', stop: entry.stop, fromDay: prior.dayTitle, toDay: entry.dayTitle });
    else if (fields.length) changes.push({ type: 'changed', before: prior.stop, after: entry.stop, dayTitle: entry.dayTitle, fields });
  }
  for (const [id, entry] of old) {
    if (!next.has(id)) changes.push({ type: 'removed', stop: entry.stop, dayTitle: entry.dayTitle });
  }

  const summaryChanged = before.title !== after.title || before.summary !== after.summary || before.days.length !== after.days.length;
  const counts = {
    added: changes.filter((c) => c.type === 'added').length,
    removed: changes.filter((c) => c.type === 'removed').length,
    changed: changes.filter((c) => c.type === 'changed' || c.type === 'moved').length,
  };
  return { changes, counts, summaryChanged, isEmpty: changes.length === 0 && !summaryChanged };
}

export type ItineraryDiff = ReturnType<typeof diffItineraries>;
