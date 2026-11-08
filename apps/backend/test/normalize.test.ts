import { describe, expect, it } from 'vitest';
import { LIMITS } from '@triptinker/contracts';
import { estimateProgress, extractJson, normalizeItinerary, normalizeTime } from '../src/normalize';
import { counter, modelOutput } from './helpers';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('unwraps code fences and leading prose', () => {
    expect(extractJson('Here you go!\n```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('Sure: {"a":{"b":2}} hope this helps')).toEqual({ ok: true, value: { a: { b: 2 } } });
  });

  it('classifies empty and malformed output', () => {
    expect(extractJson('   ')).toMatchObject({ ok: false, code: 'EMPTY_OUTPUT' });
    expect(extractJson('I cannot help with that.')).toMatchObject({ ok: false, code: 'MALFORMED_JSON' });
    expect(extractJson('{"a":1,}')).toMatchObject({ ok: false, code: 'MALFORMED_JSON' });
    expect(extractJson('{"days": [')).toMatchObject({ ok: false, code: 'MALFORMED_JSON' });
  });
});

describe('normalizeTime', () => {
  it.each([
    ['09:00', '09:00'],
    ['9:00', '09:00'],
    ['9am', '09:00'],
    ['9:30 PM', '21:30'],
    ['12 am', '00:00'],
    ['12:15pm', '12:15'],
    ['14h30', '14:30'],
  ])('%s → %s', (input, expected) => expect(normalizeTime(input)).toBe(expected));

  it.each(['9', 'morning', '25:00', '13pm', '', null, 900])('rejects %s', (input) => expect(normalizeTime(input)).toBeNull());
});

describe('normalizeItinerary', () => {
  const options = () => ({ newId: counter() });

  it('accepts the envelope and assigns fresh ids', () => {
    const result = normalizeItinerary(modelOutput(), options());
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.warnings).toEqual([]);
    expect(result.itinerary.days).toHaveLength(3);
    const ids = result.itinerary.days.flatMap((d) => [d.id, ...d.stops.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts a bare itinerary without the envelope', () => {
    const result = normalizeItinerary(modelOutput().itinerary, options());
    expect(result.ok).toBe(true);
  });

  it('reports an unplannable brief', () => {
    expect(normalizeItinerary({ status: 'unplannable', reason: 'No destination.' }, options())).toEqual({ ok: 'unplannable', reason: 'No destination.' });
  });

  it('rejects the wrong shape', () => {
    expect(normalizeItinerary([1, 2], options())).toMatchObject({ ok: false, code: 'SCHEMA_MISMATCH' });
    expect(normalizeItinerary({ plan: 'Day 1: walk' }, options())).toMatchObject({ ok: false, code: 'SCHEMA_MISMATCH' });
    expect(normalizeItinerary({ days: [] }, options())).toMatchObject({ ok: false, code: 'SCHEMA_MISMATCH' });
    expect(normalizeItinerary({ days: [{ title: 'x', stops: [{ description: 'no title' }] }] }, options())).toMatchObject({ ok: false, code: 'SCHEMA_MISMATCH' });
  });

  it('salvages a mostly-good plan and says what it dropped', () => {
    const raw = modelOutput();
    raw.itinerary.days[0].stops[1].title = '';
    (raw.itinerary.days[1] as Record<string, unknown>).stops = 'not a list';
    const result = normalizeItinerary(raw, options());
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.itinerary.days).toHaveLength(2);
    expect(result.warnings).toEqual(['Removed 1 stop the model returned without a name.', 'Removed 1 day with no usable stops.']);
  });

  it('refuses to salvage when most stops are unusable', () => {
    const raw = modelOutput();
    raw.itinerary.days.forEach((day) => day.stops.forEach((stop, i) => i % 4 !== 0 && (stop.title = '')));
    expect(normalizeItinerary(raw, options())).toMatchObject({ ok: false, code: 'SCHEMA_MISMATCH' });
  });

  it('coerces small, unambiguous deviations silently', () => {
    const raw = modelOutput();
    const stop = raw.itinerary.days[0].stops[0] as Record<string, unknown>;
    Object.assign(stop, { time: '8:30 am', category: 'Restaurant', durationMinutes: '45', area: '  ', name: undefined });
    const result = normalizeItinerary(raw, options());
    if (result.ok !== true) throw new Error('expected success');
    expect(result.itinerary.days[0].stops[0]).toMatchObject({ time: '08:30', category: 'food', durationMinutes: 45, area: null });
    expect(result.warnings).toEqual([]);
  });

  it('enforces limits on days and stops', () => {
    const raw = modelOutput();
    const day = raw.itinerary.days[0];
    day.stops = Array.from({ length: LIMITS.maxStopsPerDay + 3 }, (_, i) => ({ ...day.stops[0], title: `Stop ${i}` }));
    raw.itinerary.days = Array.from({ length: LIMITS.maxDays + 2 }, () => day);
    const result = normalizeItinerary(raw, options());
    if (result.ok !== true) throw new Error('expected success');
    expect(result.itinerary.days).toHaveLength(LIMITS.maxDays);
    expect(result.itinerary.days[0].stops).toHaveLength(LIMITS.maxStopsPerDay);
    expect(result.warnings.join(' ')).toMatch(/Trimmed .* extra stops/);
    expect(result.warnings.join(' ')).toMatch(/first 10 days/);
  });

  it('keeps known ids for refinements, once each, and replaces unknown ones', () => {
    const raw = modelOutput();
    const stops = raw.itinerary.days[0].stops as { ref: string | null }[];
    stops[0].ref = 'keep-me';
    stops[1].ref = 'keep-me'; // duplicated by the model
    stops[2].ref = 'invented';
    const result = normalizeItinerary(raw, { newId: counter('new'), knownIds: new Set(['keep-me']) });
    if (result.ok !== true) throw new Error('expected success');
    const ids = result.itinerary.days[0].stops.map((s) => s.id);
    expect(ids[0]).toBe('keep-me');
    expect(ids[1]).toMatch(/^new-/);
    expect(ids[2]).toMatch(/^new-/);
  });
});

describe('estimateProgress', () => {
  it('counts days and stops from partial JSON', () => {
    const partial = JSON.stringify(modelOutput()).slice(0, 1800);
    const { days, stops } = estimateProgress(partial);
    expect(days).toBeGreaterThanOrEqual(1);
    expect(stops).toBeGreaterThan(0);
  });
});
