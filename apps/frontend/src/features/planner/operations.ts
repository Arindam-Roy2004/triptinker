import type { Day, Itinerary, Stop } from '@triptinker/contracts';

/**
 * Pure, immutable edits to an itinerary. Each returns the same object when nothing changes,
 * so the reducer can skip a no-op instead of polluting undo history.
 */

function mapDay(itinerary: Itinerary, dayId: string, fn: (day: Day) => Day): Itinerary {
  let changed = false;
  const days = itinerary.days.map((day) => {
    if (day.id !== dayId) return day;
    const next = fn(day);
    if (next !== day) changed = true;
    return next;
  });
  return changed ? { ...itinerary, days } : itinerary;
}

export function findStop(itinerary: Itinerary, stopId: string): { day: Day; stop: Stop; index: number } | null {
  for (const day of itinerary.days) {
    const index = day.stops.findIndex((stop) => stop.id === stopId);
    if (index !== -1) return { day, stop: day.stops[index], index };
  }
  return null;
}

export function removeStop(itinerary: Itinerary, stopId: string): Itinerary {
  const found = findStop(itinerary, stopId);
  if (!found) return itinerary;
  return mapDay(itinerary, found.day.id, (day) => ({ ...day, stops: day.stops.filter((stop) => stop.id !== stopId) }));
}

/**
 * Reorder within a day. Time slots stay where they are and the activities move between them:
 * dragging dinner above lunch means "eat dinner at the lunch slot". This keeps the day
 * chronological without inventing new times.
 */
export function moveStop(itinerary: Itinerary, dayId: string, from: number, to: number): Itinerary {
  return mapDay(itinerary, dayId, (day) => {
    if (from === to || from < 0 || to < 0 || from >= day.stops.length || to >= day.stops.length) return day;
    const slots = day.stops.map((stop) => stop.time);
    const stops = [...day.stops];
    const [moved] = stops.splice(from, 1);
    stops.splice(to, 0, moved);
    return { ...day, stops: stops.map((stop, i) => (stop.time === slots[i] ? stop : { ...stop, time: slots[i] })) };
  });
}

const minutes = (time: string | null) => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : Number.POSITIVE_INFINITY);

/** Move a stop to another day, keeping its time and slotting it in chronologically. */
export function moveStopToDay(itinerary: Itinerary, stopId: string, targetDayId: string): Itinerary {
  const found = findStop(itinerary, stopId);
  if (!found || found.day.id === targetDayId || !itinerary.days.some((d) => d.id === targetDayId)) return itinerary;
  const without = removeStop(itinerary, stopId);
  return mapDay(without, targetDayId, (day) => {
    const at = day.stops.findIndex((stop) => minutes(stop.time) > minutes(found.stop.time));
    const stops = [...day.stops];
    stops.splice(at === -1 ? stops.length : at, 0, found.stop);
    return { ...day, stops };
  });
}

/** Put a removed stop back where it was (used by the "Undo" toast). */
export function restoreStop(itinerary: Itinerary, dayId: string, index: number, stop: Stop): Itinerary {
  if (findStop(itinerary, stop.id)) return itinerary;
  return mapDay(itinerary, dayId, (day) => {
    const stops = [...day.stops];
    stops.splice(Math.min(index, stops.length), 0, stop);
    return { ...day, stops };
  });
}

export const countStops = (itinerary: Itinerary) => itinerary.days.reduce((total, day) => total + day.stops.length, 0);
