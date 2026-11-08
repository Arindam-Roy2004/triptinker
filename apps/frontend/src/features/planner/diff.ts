import type { Itinerary, Stop } from '@triptinker/contracts';

/**
 * What a refinement changed, matched by stop id (the model is asked to echo ids back).
 * Used to show "+2 added, 1 removed, 3 changed" before the traveller accepts the edit.
 */

export type StopChange =
  | { type: 'added'; stop: Stop; dayTitle: string }
  | { type: 'removed'; stop: Stop; dayTitle: string; dayIndex: number }
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

const nameKey = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Pairs each proposed stop with the stop it came from: by id first (the model is asked to echo
 * ids back), then, for stops the model re-issued without their id, by the same name. Without
 * the second pass a model that forgets ids would make every stop look removed and re-added.
 */
function pairStops(old: ReturnType<typeof index>, next: ReturnType<typeof index>) {
  const pairs = new Map<string, string>(); // next id -> old id
  for (const id of next.keys()) if (old.has(id)) pairs.set(id, id);
  const claimed = new Set(pairs.values());
  const byName = new Map<string, string[]>();
  for (const [id, entry] of old) if (!claimed.has(id)) byName.set(nameKey(entry.stop.title), [...(byName.get(nameKey(entry.stop.title)) ?? []), id]);
  for (const [id, entry] of next) {
    if (pairs.has(id)) continue;
    const match = byName.get(nameKey(entry.stop.title))?.shift();
    if (match) pairs.set(id, match);
  }
  return pairs;
}

export function diffItineraries(before: Itinerary, after: Itinerary) {
  const old = index(before);
  const next = index(after);
  const pairs = pairStops(old, next);
  const kept = new Set(pairs.values());
  const changes: StopChange[] = [];

  for (const [id, entry] of next) {
    const priorId = pairs.get(id);
    const prior = priorId ? old.get(priorId) : undefined;
    if (!prior) {
      changes.push({ type: 'added', stop: entry.stop, dayTitle: entry.dayTitle });
      continue;
    }
    const fields = FIELDS.filter(({ key }) => prior.stop[key] !== entry.stop[key]).map(({ label }) => label);
    if (prior.dayIndex !== entry.dayIndex) changes.push({ type: 'moved', stop: entry.stop, fromDay: prior.dayTitle, toDay: entry.dayTitle });
    else if (fields.length) changes.push({ type: 'changed', before: prior.stop, after: entry.stop, dayTitle: entry.dayTitle, fields });
  }
  for (const [id, entry] of old) {
    if (!kept.has(id)) changes.push({ type: 'removed', stop: entry.stop, dayTitle: entry.dayTitle, dayIndex: entry.dayIndex });
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

export type ChangeMark = 'added' | 'changed' | 'moved';

/**
 * The diff arranged for showing it in place on the proposed plan: a mark per stop id, the
 * stops that would disappear (by the day they were on), and how many changes each day has.
 */
export function reviewMarks(diff: ItineraryDiff, after: Itinerary) {
  const byStop = new Map<string, ChangeMark>();
  const removedByDay = new Map<number, Stop[]>();
  for (const change of diff.changes) {
    if (change.type === 'removed') {
      const day = Math.min(change.dayIndex, after.days.length - 1);
      removedByDay.set(day, [...(removedByDay.get(day) ?? []), change.stop]);
    } else {
      byStop.set(change.type === 'changed' ? change.after.id : change.stop.id, change.type);
    }
  }
  const perDay = after.days.map((day, i) => day.stops.filter((s) => byStop.has(s.id)).length + (removedByDay.get(i)?.length ?? 0));
  return { byStop, removedByDay, perDay };
}

export type ReviewMarks = ReturnType<typeof reviewMarks>;
