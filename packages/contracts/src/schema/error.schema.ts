import { z } from 'zod';
import { LIMITS } from '../limits';
import { boundedText, idSchema, messageSchema } from './fields.schema';

export const ERROR_CODES = [
  'INVALID_INPUT',
  'NOT_CONFIGURED',
  'RATE_LIMITED',
  /** Too many generations running at once, on this server or from this client. */
  'OVERLOADED',
  'PROVIDER_AUTH',
  'PROVIDER_REJECTED',
  'PROVIDER_UNAVAILABLE',
  /** The provider's safety filter stopped the output. Not retried. */
  'CONTENT_FILTERED',
  'NETWORK',
  'TIMEOUT',
  'EMPTY_OUTPUT',
  'MALFORMED_JSON',
  'SCHEMA_MISMATCH',
  'TRUNCATED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Output problems that a second, corrective attempt can fix. The server and result metadata share this list. */
export const REPAIRABLE_CODES = ['EMPTY_OUTPUT', 'MALFORMED_JSON', 'SCHEMA_MISMATCH', 'TRUNCATED'] as const satisfies readonly ErrorCode[];

/** One invalid request field: `field` is a dotted path such as "days" or "itinerary.days.0.id". */
export const fieldErrorSchema = z.strictObject({ field: boundedText(LIMITS.fieldPathMax), message: messageSchema });
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** What every failure carries, whether it is sent as JSON before a stream or as an SSE event. */
export const errorBodySchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  /** Safe to show a person. Never a stack trace or a provider response body. */
  message: messageSchema,
  retryable: z.boolean(),
  /** Quote this when reporting a problem; it matches the server log line. */
  requestId: idSchema.optional(),
  /** Earliest sensible retry, when the server knows it (rate limits). */
  retryAfterMs: z.number().int().min(0).max(LIMITS.maxRetryAfterMs).optional(),
  /** Per-field problems, for INVALID_INPUT only. */
  issues: z.array(fieldErrorSchema).min(1).max(LIMITS.maxFieldErrors).optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

/** The JSON body of every non-2xx API response. */
export const errorEnvelopeSchema = z.strictObject({ error: errorBodySchema });
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
