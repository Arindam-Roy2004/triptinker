import type { ErrorCode } from '@shared/schema';

/** A failure we understand. `message` is written for the traveller and is safe to show. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryable: boolean,
    /** Internal detail for logs and the repair prompt; never sent to the browser verbatim. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const USER_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'That request was not valid.',
  NOT_CONFIGURED: 'No AI model is configured on the server yet. Add an API key to .env and restart.',
  RATE_LIMITED: 'The AI provider is rate-limiting requests. Wait a few seconds and try again.',
  PROVIDER_AUTH: 'The AI provider rejected the server credentials.',
  PROVIDER_REJECTED: 'The AI provider refused this request.',
  PROVIDER_UNAVAILABLE: 'The AI provider is having trouble right now.',
  NETWORK: 'Could not reach the AI provider.',
  TIMEOUT: 'The model took too long to respond.',
  EMPTY_OUTPUT: 'The model returned an empty answer.',
  MALFORMED_JSON: 'The model returned something that was not valid JSON.',
  SCHEMA_MISMATCH: 'The model returned an itinerary in the wrong shape.',
  TRUNCATED: 'The model ran out of room before finishing the itinerary.',
  INTERNAL: 'Something went wrong on our side.',
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'NETWORK',
  'TIMEOUT',
  'EMPTY_OUTPUT',
  'MALFORMED_JSON',
  'SCHEMA_MISMATCH',
  'TRUNCATED',
  'INTERNAL',
]);

export const appError = (code: ErrorCode, detail?: string) => new AppError(code, USER_MESSAGES[code], RETRYABLE.has(code), detail);

/** Output problems that a second, corrective attempt has a real chance of fixing. */
export const REPAIRABLE: ReadonlySet<ErrorCode> = new Set(['EMPTY_OUTPUT', 'MALFORMED_JSON', 'SCHEMA_MISMATCH', 'TRUNCATED']);
