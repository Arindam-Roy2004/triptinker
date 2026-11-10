import { describe, expect, it } from 'vitest';
import {
  GenerateItineraryDto, RefineItineraryDto, LIMITS, SAMPLE_REQUEST,
  stopSchema, itinerarySchema, errorEnvelopeSchema, healthSchema,
  resultMetaSchema, streamEventSchema, transcriptionSchema, webSourceSchema, sourcesSchema,
} from '../src';
import { sample } from '../src/testing';

const stop = () => sample().days[0].stops[0];
const meta = { model: 'provider/model:free', attempts: 1, durationMs: 0, repairedFrom: null };
const source = { title: 'Travel guide', url: 'https://www.guide.example/travel', domain: 'guide.example' };

function fullTrip(count: number) {
  const trip = sample();
  trip.days = Array.from({ length: LIMITS.maxDays }, (_, d) => ({
    id: `day-${d}`, title: `Day ${d + 1}`, summary: '',
    stops: Array.from({ length: Math.floor(count / LIMITS.maxDays) + (d < count % LIMITS.maxDays ? 1 : 0) }, (_, s) => ({ ...stop(), id: `stop-${d}-${s}` })),
  }));
  return trip;
}

describe('nested itinerary validation', () => {
  it.each([
    ['title', ' '], ['title', 'a'.repeat(LIMITS.titleMax + 1)],
    ['description', 'a'.repeat(LIMITS.descriptionMax + 1)],
    ['area', 'a'.repeat(LIMITS.areaMax + 1)], ['area', '   '],
    ['tip', 'a'.repeat(LIMITS.tipMax + 1)], ['tip', 'Hidden\u202Etext'],
    ['id', 'unsafe/id'], ['id', 'x'.repeat(LIMITS.idMax + 1)],
    ['time', '24:00'], ['time', '12:60'], ['time', '9:30'],
    ['category', 'invented'],
  ])('rejects invalid %s values', (field, value) => {
    expect(stopSchema.safeParse({ ...stop(), [field]: value }).success).toBe(false);
  });

  it.each([-1, 0, 4, 5.5, 721, NaN, Infinity, '60'])('rejects invalid duration %s', (durationMinutes) => {
    expect(stopSchema.safeParse({ ...stop(), durationMinutes }).success).toBe(false);
  });

  it('accepts integer duration boundaries, international text, emoji and nullable optional details', () => {
    for (const durationMinutes of [LIMITS.durationMin, LIMITS.durationMax, null]) {
      expect(stopSchema.safeParse({ ...stop(), title: '🚋'.repeat(LIMITS.titleMax), description: '京都 — café\nSecond line', durationMinutes, time: null, area: null, tip: null }).success).toBe(true);
    }
    expect(stopSchema.safeParse({ ...stop(), title: '🚋'.repeat(LIMITS.titleMax + 1) }).success).toBe(false);
  });

  it.each(['stop-stop', 'day-day', 'day-stop'])('rejects globally duplicated IDs: %s', (kind) => {
    const trip = sample();
    if (kind === 'stop-stop') trip.days[1].stops[0].id = trip.days[0].stops[0].id;
    if (kind === 'day-day') trip.days[1].id = trip.days[0].id;
    if (kind === 'day-stop') trip.days[1].stops[0].id = trip.days[0].id;
    const parsed = itinerarySchema.safeParse(trip);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message.startsWith('Duplicate id'))).toBe(true);
  });

  it('rejects unknown fields at every nested object level', () => {
    const trip = sample();
    expect(itinerarySchema.safeParse({ ...trip, injected: true }).success).toBe(false);
    expect(itinerarySchema.safeParse({ ...trip, days: [{ ...trip.days[0], injected: true }] }).success).toBe(false);
    expect(stopSchema.safeParse({ ...stop(), injected: true }).success).toBe(false);
  });

  it('caps total stops across days while allowing an edited plan to consolidate its stops', () => {
    const trip = fullTrip(LIMITS.maxTotalStops);
    expect(itinerarySchema.safeParse(trip).success).toBe(true);
    expect(itinerarySchema.safeParse(fullTrip(LIMITS.maxTotalStops + 1)).success).toBe(false);
    const consolidated = { ...trip, days: [{ ...trip.days[0], stops: trip.days.flatMap((day) => day.stops) }] };
    expect(itinerarySchema.safeParse(consolidated).success).toBe(true);
    consolidated.days[0].stops = [];
    expect(itinerarySchema.safeParse(consolidated).success).toBe(true);
  });

  it('rejects empty or excessive days, excessive notes and invalid nested strings', () => {
    const trip = sample();
    for (const change of [
      { days: [] }, { days: Array.from({ length: LIMITS.maxDays + 1 }, (_, i) => ({ ...trip.days[0], id: `day-${i}`, stops: [] })) },
      { notes: Array(LIMITS.maxNotes + 1).fill('Note') }, { notes: ['   '] },
      { summary: 'x'.repeat(LIMITS.summaryMax + 1) }, { destination: '' },
      { days: [{ ...trip.days[0], title: 'x'.repeat(LIMITS.dayTitleMax + 1) }] },
      { days: [{ ...trip.days[0], summary: 'x'.repeat(LIMITS.daySummaryMax + 1) }] },
    ]) expect(itinerarySchema.safeParse({ ...trip, ...change }).success).toBe(false);
  });
});

describe('request and error limits', () => {
  it.each([0, 11, 1.5, NaN, Infinity, '3'])('rejects invalid requested day count %s', (days) => {
    expect(GenerateItineraryDto.validate({ ...SAMPLE_REQUEST, days }).errors).not.toBeNull();
  });

  it('bounds a deeply invalid request’s error response', () => {
    const trip = fullTrip(LIMITS.maxTotalStops);
    trip.days.forEach((day) => day.stops.forEach((entry) => { entry.title = ''; }));
    const { errors } = RefineItineraryDto.validate({ instruction: 'Make it slower', itinerary: trip });
    expect(errors).toHaveLength(LIMITS.maxFieldErrors);
    expect(errorEnvelopeSchema.safeParse({ error: { code: 'INVALID_INPUT', message: 'Invalid request.', retryable: false, issues: errors } }).success).toBe(true);
  });

  it('bounds messages even when invalid input contains huge unknown keys', () => {
    const { errors } = GenerateItineraryDto.validate({ ...SAMPLE_REQUEST, ['x'.repeat(5000)]: true });
    expect(errors?.[0].message.length).toBeLessThanOrEqual(LIMITS.messageMax);
  });

  it('rejects oversized and fractional retry values, messages and issue lists', () => {
    const error = { code: 'RATE_LIMITED', message: 'Wait.', retryable: true };
    for (const change of [
      { retryAfterMs: -1 }, { retryAfterMs: 0.5 }, { retryAfterMs: LIMITS.maxRetryAfterMs + 1 },
      { message: 'x'.repeat(LIMITS.messageMax + 1) }, { message: '' },
      { issues: Array(LIMITS.maxFieldErrors + 1).fill({ field: 'brief', message: 'Invalid' }) },
      { issues: [{ field: 'x'.repeat(LIMITS.fieldPathMax + 1), message: 'Invalid' }] },
      { requestId: 'x'.repeat(LIMITS.idMax + 1) },
    ]) expect(errorEnvelopeSchema.safeParse({ error: { ...error, ...change } }).success).toBe(false);
  });
});

describe('stream and metadata validation', () => {
  it.each(['chars', 'days', 'stops'])('requires bounded integer progress for %s', (field) => {
    const maximum = { chars: LIMITS.maxModelOutputChars, days: LIMITS.maxDays, stops: LIMITS.maxTotalStops }[field]!;
    for (const value of [-1, 0.5, maximum + 1, NaN, Infinity, '1']) {
      expect(streamEventSchema.safeParse({ type: 'progress', chars: 0, days: 0, stops: 0, [field]: value }).success).toBe(false);
    }
    expect(streamEventSchema.safeParse({ type: 'progress', chars: 0, days: 0, stops: 0, [field]: maximum }).success).toBe(true);
  });

  it('requires repair metadata to describe a real first or corrective attempt', () => {
    expect(resultMetaSchema.safeParse(meta).success).toBe(true);
    expect(resultMetaSchema.safeParse({ ...meta, attempts: 2, repairedFrom: 'MALFORMED_JSON' }).success).toBe(true);
    for (const change of [
      { attempts: 0 }, { attempts: 1.5 }, { attempts: 3 }, { attempts: 2 },
      { repairedFrom: 'MALFORMED_JSON' }, { attempts: 2, repairedFrom: 'PROVIDER_AUTH' },
      { durationMs: -1 }, { durationMs: 0.5 }, { durationMs: LIMITS.maxGenerationDurationMs + 1 },
      { model: '' }, { model: 'x'.repeat(LIMITS.modelMax + 1) },
    ]) expect(resultMetaSchema.safeParse({ ...meta, ...change }).success).toBe(false);
  });

  it('bounds every text event and result warning list without trimming raw chunks', () => {
    expect(streamEventSchema.parse({ type: 'delta', text: '\n  ' })).toEqual({ type: 'delta', text: '\n  ' });
    for (const event of [
      { type: 'delta', text: '' }, { type: 'delta', text: 'x'.repeat(LIMITS.maxModelOutputChars + 1) },
      { type: 'stage', stage: 'searching', detail: 'x'.repeat(LIMITS.stageDetailMax + 1) },
      { type: 'unplannable', reason: '' }, { type: 'unplannable', reason: 'x'.repeat(LIMITS.reasonMax + 1) },
      { type: 'meta', requestId: 'r1', model: null, schemaVersion: 1.5 },
      { type: 'result', itinerary: sample(), warnings: Array(LIMITS.maxWarnings + 1).fill('Warning'), meta },
      { type: 'result', itinerary: sample(), warnings: ['x'.repeat(LIMITS.messageMax + 1)], meta },
    ]) expect(streamEventSchema.safeParse(event).success).toBe(false);
  });
});

describe('health, transcription and web sources', () => {
  it('rejects inconsistent health capabilities', () => {
    expect(healthSchema.safeParse({ configured: false, model: null, simulation: true }).success).toBe(true);
    for (const health of [
      { configured: true, model: null, simulation: false },
      { configured: false, model: 'model', simulation: false },
      { configured: false, model: null, simulation: false, voice: true },
      { configured: true, model: 'x'.repeat(LIMITS.modelMax + 1), simulation: false },
    ]) expect(healthSchema.safeParse(health).success).toBe(false);
  });

  it('allows silence and Unicode transcripts up to the form limit', () => {
    expect(transcriptionSchema.parse({ text: '' })).toEqual({ text: '' });
    expect(transcriptionSchema.safeParse({ text: '🚋'.repeat(LIMITS.briefMax) }).success).toBe(true);
    expect(transcriptionSchema.safeParse({ text: '🚋'.repeat(LIMITS.briefMax + 1) }).success).toBe(false);
    expect(transcriptionSchema.safeParse({ text: 'hello\u0000world' }).success).toBe(false);
  });

  it('requires HTTPS, no credentials, and an accurate displayed hostname', () => {
    expect(webSourceSchema.parse(source)).toEqual(source);
    for (const change of [
      { url: 'http://guide.example/' }, { url: 'javascript:alert(1)' },
      { url: 'https://user:password@guide.example/' }, { domain: 'trusted.example' },
      { domain: '-bad.example' }, { url: 'https://guide.example/' + 'x'.repeat(LIMITS.sourceUrlMax) },
      { title: ' ' }, { title: 'x'.repeat(LIMITS.sourceTitleMax + 1) },
    ]) expect(webSourceSchema.safeParse({ ...source, ...change }).success).toBe(false);
  });

  it('bounds source lists and rejects duplicate sites', () => {
    expect(sourcesSchema.safeParse([source, source]).success).toBe(false);
    const sources = Array.from({ length: LIMITS.maxSources + 1 }, (_, i) => ({ title: 'Guide', url: `https://guide${i}.example/`, domain: `guide${i}.example` }));
    expect(sourcesSchema.safeParse(sources).success).toBe(false);
    expect(sourcesSchema.safeParse(sources.slice(0, LIMITS.maxSources)).success).toBe(true);
  });
});
