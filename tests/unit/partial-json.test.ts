import { describe, expect, it } from 'vitest';
import { livePlan, parsePartialJson } from '@/features/planner/partial-json';
import { modelOutput } from './helpers';

describe('parsePartialJson', () => {
  it('parses complete JSON, ignoring text around it', () => {
    expect(parsePartialJson('Sure! {"a": [1, 2]} hope that helps')).toEqual({ a: [1, 2] });
  });

  it('closes an open string and open brackets', () => {
    expect(parsePartialJson('{"title": "Three days in Lis')).toEqual({ title: 'Three days in Lis' });
    expect(parsePartialJson('{"days": [{"title": "Alfama"}, {"stops": [')).toEqual({ days: [{ title: 'Alfama' }, { stops: [] }] });
  });

  it('backs up past a dangling key or a half-written value', () => {
    expect(parsePartialJson('{"a": 1, "b"')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a": 1, "b": tr')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a": "x\\')).toEqual({ a: 'x' });
  });

  it('returns null when there is nothing to show yet', () => {
    expect(parsePartialJson('')).toBeNull();
    expect(parsePartialJson('Sure! Here is')).toBeNull();
  });

  it('never throws on any prefix of a real answer', () => {
    const full = JSON.stringify(modelOutput(), null, 1);
    for (let i = 0; i <= full.length; i += 7) expect(() => parsePartialJson(full.slice(0, i))).not.toThrow();
    expect(parsePartialJson(full)).toEqual(modelOutput());
  });
});

describe('livePlan', () => {
  it('extracts the title, days and named stops written so far', () => {
    const full = JSON.stringify(modelOutput());
    const cut = full.slice(0, full.indexOf('"stops"', full.indexOf('"stops"') + 1) + 40);
    const plan = livePlan(cut);
    expect(plan?.title).toBe(modelOutput().itinerary.title);
    expect(plan?.days.length).toBeGreaterThanOrEqual(2);
    expect(plan?.days[0].stops.length).toBe(modelOutput().itinerary.days[0].stops.length);
  });

  it('is null before the first useful field', () => {
    expect(livePlan('{"status": "ok", "itin')).toBeNull();
  });
});
