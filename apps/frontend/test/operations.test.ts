import { describe, expect, it } from 'vitest';
import { diffItineraries } from '@/features/planner/diff';
import { moveStop, moveStopToDay, removeStop, restoreStop } from '@/features/planner/operations';
import { tripReducer, type Trip } from '@/features/planner/trip-store';
import { sample } from '@triptinker/contracts/testing';

const day1 = () => sample().days[0];

describe('itinerary operations', () => {
  it('reorders a day while keeping the time slots in place', () => {
    const it0 = sample();
    const before = it0.days[0].stops;
    const next = moveStop(it0, 'sample-d1', 0, 2);
    const after = next.days[0].stops;
    expect(after.map((s) => s.id).slice(0, 3)).toEqual([before[1].id, before[2].id, before[0].id]);
    expect(after.map((s) => s.time)).toEqual(before.map((s) => s.time));
    expect(next.days[1]).toBe(it0.days[1]); // untouched days keep identity
  });

  it('returns the same object for no-op and out-of-range moves', () => {
    const it0 = sample();
    expect(moveStop(it0, 'sample-d1', 1, 1)).toBe(it0);
    expect(moveStop(it0, 'sample-d1', 0, 99)).toBe(it0);
    expect(moveStop(it0, 'missing', 0, 1)).toBe(it0);
    expect(removeStop(it0, 'missing')).toBe(it0);
  });

  it('moves a stop to another day in chronological position', () => {
    const it0 = sample();
    const lunch = day1().stops[3]; // 12:30
    const next = moveStopToDay(it0, lunch.id, 'sample-d2');
    expect(next.days[0].stops.some((s) => s.id === lunch.id)).toBe(false);
    const times = next.days[1].stops.map((s) => s.time);
    expect(times).toEqual([...times].sort());
    expect(next.days[1].stops.find((s) => s.id === lunch.id)?.time).toBe('12:30');
  });

  it('removes and restores a stop at its original index', () => {
    const it0 = sample();
    const target = day1().stops[2];
    const removed = removeStop(it0, target.id);
    expect(removed.days[0].stops).toHaveLength(day1().stops.length - 1);
    const restored = restoreStop(removed, 'sample-d1', 2, target);
    expect(restored.days[0].stops.map((s) => s.id)).toEqual(day1().stops.map((s) => s.id));
    expect(restoreStop(restored, 'sample-d1', 2, target)).toBe(restored); // already present
  });
});

describe('trip reducer history', () => {
  const trip: Trip = { id: 't', source: 'sample', request: null, itinerary: sample(), model: null, meta: null, warnings: [], sources: [], createdAt: 0, updatedAt: 0 };
  const start = { trip, past: [], future: [] };

  it('records edits, undoes and redoes them', () => {
    const edited = tripReducer(start, { type: 'edit', edit: (it) => removeStop(it, 'sample-s1') });
    expect(edited.past).toHaveLength(1);
    const undone = tripReducer(edited, { type: 'undo' });
    expect(undone.trip?.itinerary).toBe(trip.itinerary);
    const redone = tripReducer(undone, { type: 'redo' });
    expect(redone.trip?.itinerary).toBe(edited.trip?.itinerary);
  });

  it('ignores no-op edits and clears redo after a new edit', () => {
    expect(tripReducer(start, { type: 'edit', edit: (it) => it })).toBe(start);
    const a = tripReducer(start, { type: 'edit', edit: (it) => removeStop(it, 'sample-s1') });
    const undone = tripReducer(a, { type: 'undo' });
    const b = tripReducer(undone, { type: 'edit', edit: (it) => removeStop(it, 'sample-s2') });
    expect(b.future).toHaveLength(0);
  });

  it('loading a trip resets history', () => {
    const a = tripReducer(start, { type: 'edit', edit: (it) => removeStop(it, 'sample-s1') });
    expect(tripReducer(a, { type: 'load', trip })).toEqual({ trip, past: [], future: [] });
  });
});

describe('diffItineraries', () => {
  it('classifies added, removed, changed and moved stops by id', () => {
    const before = sample();
    let after = removeStop(before, 'sample-s2');
    after = moveStopToDay(after, 'sample-s4', 'sample-d3');
    after = {
      ...after,
      days: after.days.map((d, i) => (i === 0 ? { ...d, stops: [...d.stops.map((s) => (s.id === 'sample-s3' ? { ...s, time: '11:00' } : s)), { ...d.stops[0], id: 'new', title: 'Coffee' }] } : d)),
    };
    const { counts, changes } = diffItineraries(before, after);
    expect(counts).toEqual({ added: 1, removed: 1, changed: 2 });
    expect(changes.find((c) => c.type === 'changed')).toMatchObject({ fields: ['time'] });
    expect(changes.find((c) => c.type === 'moved')).toMatchObject({ toDay: 'Belém and Príncipe Real' });
  });

  it('reports no changes for an identical plan', () => {
    expect(diffItineraries(sample(), sample()).isEmpty).toBe(true);
  });
});
