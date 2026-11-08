import { describe, expect, it } from 'vitest';
import { clone, sample } from '@triptinker/contracts/testing';
import { diffItineraries, reviewMarks } from '@/features/planner/diff';

describe('diffItineraries', () => {
  it('finds nothing when the plan comes back unchanged', () => {
    expect(diffItineraries(sample(), sample()).isEmpty).toBe(true);
  });

  it('reports edits, additions and removals by id', () => {
    const before = sample();
    const after = clone(before);
    after.days[0].stops[0].time = '09:45';
    const removed = after.days[0].stops.splice(1, 1)[0];
    after.days[0].stops.push({ ...removed, id: 'new-1', title: 'Coffee at Fábrica' });
    const diff = diffItineraries(before, after);
    expect(diff.counts).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(diff.changes.find((c) => c.type === 'changed')).toMatchObject({ fields: ['time'] });
  });

  it('pairs stops by name when the model re-issues them without their ids', () => {
    const before = sample();
    const after = clone(before);
    after.days.forEach((day) => day.stops.forEach((stop, i) => (stop.id = `fresh-${day.id}-${i}`)));
    after.days[0].stops[0].title = after.days[0].stops[0].title.toUpperCase(); // case and accents don't matter
    const diff = diffItineraries(before, after);
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 1 }); // only the retitled stop counts, as a change of name
  });

  it('reports a stop moved to another day', () => {
    const before = sample();
    const after = clone(before);
    const [stop] = after.days[0].stops.splice(0, 1);
    after.days[1].stops.push(stop);
    expect(diffItineraries(before, after).changes).toEqual([expect.objectContaining({ type: 'moved', toDay: after.days[1].title })]);
  });
});

describe('reviewMarks', () => {
  it('marks stops in place and counts changes per day', () => {
    const before = sample();
    const after = clone(before);
    const [gone] = after.days[1].stops.splice(0, 1);
    after.days[0].stops[0].tip = 'Different tip';
    const marks = reviewMarks(diffItineraries(before, after), after);
    expect(marks.byStop.get(after.days[0].stops[0].id)).toBe('changed');
    expect(marks.removedByDay.get(1)).toEqual([gone]);
    expect(marks.perDay).toEqual([1, 1, 0]);
  });
});
