import { z } from 'zod';
import { ERROR_CODES, errorBodySchema } from './error.schema';
import { itinerarySchema } from './itinerary.schema';
import { MAX_SOURCES, webSourceSchema } from './source.schema';

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

export const resultMetaSchema = z.object({
  model: z.string(),
  attempts: z.number().int().min(1),
  durationMs: z.number().int().min(0),
  /** Why the first attempt was rejected, if a repair attempt was needed. */
  repairedFrom: z.enum(ERROR_CODES).nullable(),
});
export type ResultMeta = z.infer<typeof resultMetaSchema>;

export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), requestId: z.string(), model: z.string().nullable(), schemaVersion: z.number().int() }),
  z.object({ type: z.literal('stage'), stage: z.enum(STAGES), detail: z.string().optional() }),
  /** What the web search found (possibly nothing). Sent once, before drafting, when search is on. */
  z.object({ type: z.literal('sources'), sources: z.array(webSourceSchema).max(MAX_SOURCES) }),
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
  z.object({ type: z.literal('error'), ...errorBodySchema.omit({ issues: true }).shape }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventOf<T extends StreamEvent['type']> = Extract<StreamEvent, { type: T }>;
