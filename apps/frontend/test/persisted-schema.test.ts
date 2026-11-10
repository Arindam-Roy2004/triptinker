import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, SAMPLE_REQUEST, itinerarySchema } from '@triptinker/contracts';
import { sample } from '@triptinker/contracts/testing';
import { storedTripSchema, tripReducer, tripSchema, type Trip } from '@/features/planner/trip-store';
import { workspaceSchema } from '@/features/planner/use-workspace';
import { moveStopToDay, removeStop } from '@/features/planner/operations';

const trip = (): Trip => ({
  id: 'saved-trip', source: 'sample', request: SAMPLE_REQUEST, itinerary: sample(),
  model: null, meta: null, warnings: [], sources: [], createdAt: 1000, updatedAt: 2000,
});
afterEach(() => vi.restoreAllMocks());

describe('persisted trip validation', () => {
  it('accepts existing sample trips and missing optional metadata', () => {
    const current = trip();
    expect(tripSchema.parse(current)).toEqual(current);
    const { meta: _meta, sources: _sources, warnings: _warnings, ...legacy } = current;
    expect(tripSchema.parse(legacy)).toEqual(current);
  });

  it('loads trips saved with hidden characters from older model output instead of discarding them', () => {
    const saved = trip();
    saved.itinerary.days[0].stops[0].title = 'שוק\u200F הכרמל';
    saved.itinerary.days[0].stops[0].tip = 'Kaffee\u00ADhaus with the 👨\u200D👩\u200D👧';
    expect(tripSchema.safeParse(saved).success).toBe(false);
    const loaded = storedTripSchema.parse(saved);
    expect(loaded.itinerary.days[0].stops[0].title).toBe('שוק הכרמל');
    expect(loaded.itinerary.days[0].stops[0].tip).toBe('Kaffeehaus with the 👨\u200D👩\u200D👧');
    expect(workspaceSchema.parse({ trip: saved, form: SAMPLE_REQUEST }).trip).toEqual(loaded);
  });

  it.each(['createdAt', 'updatedAt'])('rejects invalid timestamp values in %s', (field) => {
    for (const value of [-1, 0.5, Infinity, NaN, LIMITS.maxTimestampMs + 1, '2000']) {
      expect(tripSchema.safeParse({ ...trip(), [field]: value }).success).toBe(false);
    }
    expect(tripSchema.safeParse({ ...trip(), updatedAt: 999 }).success).toBe(false);
  });

  it('rejects contradictory source and model metadata', () => {
    const meta = { model: 'model-a', attempts: 1, durationMs: 1, repairedFrom: null };
    for (const change of [
      { source: 'ai', model: null }, { source: 'sample', model: 'model-a' },
      { source: 'ai', model: 'model-b', meta },
      { id: '' }, { id: 'x'.repeat(LIMITS.idMax + 1) },
      { warnings: Array(LIMITS.maxWarnings + 1).fill('Warning') },
      { extra: 'not part of the saved format' },
    ]) expect(tripSchema.safeParse({ ...trip(), ...change }).success).toBe(false);
    expect(tripSchema.safeParse({ ...trip(), source: 'ai', model: 'model-a', meta }).success).toBe(true);
  });

  it('keeps edits valid if the system clock moves backwards', () => {
    vi.spyOn(Date, 'now').mockReturnValue(500);
    let state = tripReducer({ trip: trip(), past: [], future: [] }, { type: 'edit', edit: (plan) => removeStop(plan, 'sample-s1') });
    expect(state.trip!.updatedAt).toBeGreaterThan(2000);
    for (const type of ['undo', 'redo'] as const) {
      const previous = state.trip!.updatedAt;
      state = tripReducer(state, { type });
      expect(tripSchema.safeParse(state.trip).success).toBe(true);
      expect(state.trip!.updatedAt).toBeGreaterThan(previous);
    }
  });

  it('can reload a trip after moving every existing stop into a single day', () => {
    let plan = sample();
    const target = plan.days[0].id;
    for (const day of plan.days.slice(1)) {
      for (const stop of day.stops) plan = moveStopToDay(plan, stop.id, target);
    }
    expect(plan.days.slice(1).every((day) => day.stops.length === 0)).toBe(true);
    expect(itinerarySchema.safeParse(plan).success).toBe(true);
    expect(tripSchema.safeParse({ ...trip(), itinerary: plan }).success).toBe(true);
  });
});

describe('workspace drafts', () => {
  it('preserves empty, unfinished and Unicode drafts without submitting or trimming them', () => {
    for (const brief of ['', 'Ky', '  Kyoto ', '🚋'.repeat(LIMITS.briefMax)]) {
      const workspace = { trip: null, form: { ...SAMPLE_REQUEST, brief } };
      expect(workspaceSchema.parse(workspace)).toEqual(workspace);
    }
  });

  it('rejects oversized drafts, invalid options and unknown nested keys', () => {
    for (const change of [{ brief: 'x'.repeat(LIMITS.briefMax + 1) }, { days: 1.5 }, { pace: 'invalid' }, { extra: true }]) {
      expect(workspaceSchema.safeParse({ trip: null, form: { ...SAMPLE_REQUEST, ...change } }).success).toBe(false);
    }
  });
});
