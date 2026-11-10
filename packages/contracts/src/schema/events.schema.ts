import { z } from 'zod';
import { LIMITS } from '../limits';
import { ERROR_CODES, REPAIRABLE_CODES, errorBodySchema } from './error.schema';
import { itinerarySchema } from './itinerary.schema';
import { sourcesSchema } from './source.schema';
import { boundedText, idSchema, modelSchema, warningsSchema } from './fields.schema';

/**
 * The streaming protocol, server → browser, as Server-Sent Events. A stream always reads:
 *
 *   meta → [stage(searching) → sources] → stage(connecting) → stage(drafting) → (delta | progress)*
 *        → [stage(repairing) → stage(drafting) → (delta | progress)*]
 *        → stage(validating) → exactly one of result | unplannable | error
 *
 * and then closes. A stream that closes without a terminal event is a network failure.
 */

/** Bumped on any breaking change to these events, so a stale tab can tell. */
export const SCHEMA_VERSION = 1;

export const STAGES = ['searching', 'connecting', 'drafting', 'validating', 'repairing'] as const;
export type Stage = (typeof STAGES)[number];

export const resultMetaSchema = z.strictObject({
  model: modelSchema,
  attempts: z.number().int().min(1).max(LIMITS.maxAttempts),
  durationMs: z.number().int().min(0).max(LIMITS.maxGenerationDurationMs),
  /** Why the first attempt was rejected, if a repair attempt was needed. */
  repairedFrom: z.enum(ERROR_CODES).nullable(),
}).superRefine((meta, ctx) => {
  if ((meta.attempts === 1) !== (meta.repairedFrom === null)) {
    ctx.addIssue({ code: 'custom', path: ['repairedFrom'], message: 'Only a second attempt can have a repair reason.' });
  }
  if (meta.repairedFrom && !(REPAIRABLE_CODES as readonly string[]).includes(meta.repairedFrom)) {
    ctx.addIssue({ code: 'custom', path: ['repairedFrom'], message: 'This error cannot be repaired by regenerating the output.' });
  }
});
export type ResultMeta = z.infer<typeof resultMetaSchema>;

export const streamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('meta'), requestId: idSchema, model: modelSchema.nullable(), schemaVersion: z.literal(SCHEMA_VERSION) }),
  z.strictObject({ type: z.literal('stage'), stage: z.enum(STAGES), detail: boundedText(LIMITS.stageDetailMax).optional() }),
  /** What the web search found (possibly nothing). Sent once, before drafting, when search is on. */
  z.strictObject({ type: z.literal('sources'), sources: sourcesSchema }),
  z.strictObject({
    type: z.literal('progress'),
    chars: z.number().int().min(0).max(LIMITS.maxModelOutputChars),
    days: z.number().int().min(0).max(LIMITS.maxDays),
    stops: z.number().int().min(0).max(LIMITS.maxTotalStops),
  }),
  /** Raw, unvalidated model text, for display only. Never rendered as itinerary UI. */
  // Raw chunks must retain whitespace and may split a Unicode character between frames.
  z.strictObject({ type: z.literal('delta'), text: z.string().min(1).max(LIMITS.maxModelOutputChars) }),
  z.strictObject({
    type: z.literal('result'),
    itinerary: itinerarySchema,
    warnings: warningsSchema,
    meta: resultMetaSchema,
  }),
  z.strictObject({ type: z.literal('unplannable'), reason: boundedText(LIMITS.reasonMax) }),
  z.strictObject({ type: z.literal('error'), ...errorBodySchema.omit({ issues: true }).shape }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventOf<T extends StreamEvent['type']> = Extract<StreamEvent, { type: T }>;
