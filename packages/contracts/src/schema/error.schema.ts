import { z } from 'zod';

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

/** One invalid request field: `field` is a dotted path such as "days" or "itinerary.days.0.id". */
export const fieldErrorSchema = z.object({ field: z.string(), message: z.string() });
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** What every failure carries, whether it is sent as JSON before a stream or as an SSE event. */
export const errorBodySchema = z.object({
  code: z.enum(ERROR_CODES),
  /** Safe to show a person. Never a stack trace or a provider response body. */
  message: z.string(),
  retryable: z.boolean(),
  /** Quote this when reporting a problem; it matches the server log line. */
  requestId: z.string().optional(),
  /** Earliest sensible retry, when the server knows it (rate limits). */
  retryAfterMs: z.number().int().min(0).optional(),
  /** Per-field problems, for INVALID_INPUT only. */
  issues: z.array(fieldErrorSchema).optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

/** The JSON body of every non-2xx API response. */
export const errorEnvelopeSchema = z.object({ error: errorBodySchema });
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
