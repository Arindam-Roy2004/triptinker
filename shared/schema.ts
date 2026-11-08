import { z } from 'zod';

/**
 * Shared contracts between the browser and the API.
 *
 * Two kinds of schema live here:
 *  - strict schemas for data *we* produce (requests, validated itineraries, saved trips)
 *  - the normaliser in `normalize.ts` handles data the *model* produces, which is never trusted.
 */

export const LIMITS = {
  briefMin: 8,
  briefMax: 1500,
  instructionMin: 3,
  instructionMax: 400,
  maxDays: 10,
  maxStopsPerDay: 10,
  maxNotes: 5,
} as const;

export const PACES = ['relaxed', 'balanced', 'packed'] as const;
export type Pace = (typeof PACES)[number];

export const CATEGORIES = ['sight', 'food', 'activity', 'nature', 'shopping', 'nightlife', 'transit', 'stay', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

export const tripRequestSchema = z.object({
  brief: z.string().trim().min(LIMITS.briefMin, 'Tell us a little more about the trip.').max(LIMITS.briefMax),
  /** null = let the model infer the length from the brief. */
  days: z.number().int().min(1).max(LIMITS.maxDays).nullable(),
  pace: z.enum(PACES),
});
export type TripRequest = z.infer<typeof tripRequestSchema>;

export const stopSchema = z.object({
  id: z.string().min(1).max(64),
  /** 24h "HH:MM", or null when the model gave no usable time. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  title: text(120),
  description: z.string().max(600),
  category: z.enum(CATEGORIES),
  durationMinutes: z.number().int().min(5).max(720).nullable(),
  area: z.string().max(80).nullable(),
  tip: z.string().max(300).nullable(),
});
export type Stop = z.infer<typeof stopSchema>;

export const daySchema = z.object({
  id: z.string().min(1).max(64),
  title: text(100),
  summary: z.string().max(300),
  stops: z.array(stopSchema).max(LIMITS.maxStopsPerDay * 2),
});
export type Day = z.infer<typeof daySchema>;

export const itinerarySchema = z.object({
  title: text(120),
  destination: text(80),
  summary: z.string().max(500),
  days: z.array(daySchema).min(1).max(LIMITS.maxDays),
  notes: z.array(z.string().max(240)).max(LIMITS.maxNotes),
});
export type Itinerary = z.infer<typeof itinerarySchema>;

export const refineRequestSchema = z.object({
  instruction: z.string().trim().min(LIMITS.instructionMin, 'Describe the change you want.').max(LIMITS.instructionMax),
  itinerary: itinerarySchema,
});
export type RefineRequest = z.infer<typeof refineRequestSchema>;

/* ── Streaming protocol (server → browser, Server-Sent Events) ─────────────── */

export const STAGES = ['connecting', 'drafting', 'validating', 'repairing'] as const;
export type Stage = (typeof STAGES)[number];

export const ERROR_CODES = [
  'INVALID_INPUT',
  'NOT_CONFIGURED',
  'RATE_LIMITED',
  'PROVIDER_AUTH',
  'PROVIDER_REJECTED',
  'PROVIDER_UNAVAILABLE',
  'NETWORK',
  'TIMEOUT',
  'EMPTY_OUTPUT',
  'MALFORMED_JSON',
  'SCHEMA_MISMATCH',
  'TRUNCATED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const resultMetaSchema = z.object({
  model: z.string(),
  attempts: z.number().int().min(1),
  durationMs: z.number().int().min(0),
  /** Why the first attempt was rejected, if a repair attempt was needed. */
  repairedFrom: z.enum(ERROR_CODES).nullable(),
});
export type ResultMeta = z.infer<typeof resultMetaSchema>;

export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stage: z.enum(STAGES), detail: z.string().optional() }),
  z.object({ type: z.literal('progress'), chars: z.number(), days: z.number(), stops: z.number() }),
  /** Raw, unvalidated model text, for display only. Never rendered as itinerary UI. */
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('result'),
    itinerary: itinerarySchema,
    warnings: z.array(z.string()),
    meta: resultMetaSchema,
  }),
  z.object({ type: z.literal('unplannable'), reason: z.string() }),
  z.object({
    type: z.literal('error'),
    code: z.enum(ERROR_CODES),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const healthSchema = z.object({
  configured: z.boolean(),
  model: z.string().nullable(),
  simulation: z.boolean(),
});
export type Health = z.infer<typeof healthSchema>;

/** Failure modes the dev-only "failure lab" can force, to exercise every error path. */
export const SIMULATIONS = [
  'ok',
  'slow',
  'malformed-once',
  'malformed',
  'wrong-shape',
  'partial',
  'empty',
  'truncated',
  'unplannable',
  'provider-error',
  'rate-limited',
  'stall',
] as const;
export type Simulation = (typeof SIMULATIONS)[number];
