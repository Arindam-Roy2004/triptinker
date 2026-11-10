import { z } from 'zod';
import { LIMITS } from '../limits';
import { textLength } from '../security/sanitize';

// Allow international text, emoji, tabs and newlines, but not hidden controls or bidi overrides.
// eslint-disable-next-line no-control-regex -- explicitly rejecting unsafe control characters
const UNSAFE_TEXT = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/u;
const UNSAFE_TEXT_ALL = new RegExp(UNSAFE_TEXT.source, 'gu');

/**
 * Removes exactly what `boundedText` rejects, and nothing else. Joiners (U+200C, U+200D) stay:
 * emoji sequences and Persian or Indic words need them. Use for model output and stored data.
 */
export const stripUnsafeText = (text: string) => text.replace(UNSAFE_TEXT_ALL, '');

/** Human text is bounded in Unicode code points, including emoji (not UTF-16 code units). */
export function boundedText(max: number, min = 1) {
  return z.string().max(max * 2).trim()
    .refine((value) => textLength(value) >= min, `Use at least ${min} characters.`)
    .refine((value) => textLength(value) <= max, `Use at most ${max} characters.`)
    .refine((value) => !UNSAFE_TEXT.test(value), 'Remove hidden control or formatting characters.');
}

export const idSchema = z.string().min(1).max(LIMITS.idMax)
  .regex(/^[a-z0-9-]+$/, 'Ids may only use a-z, 0-9 and "-".');
export const modelSchema = boundedText(LIMITS.modelMax).refine((value) => !/\s/u.test(value), 'Model identifiers cannot contain whitespace.');
export const messageSchema = boundedText(LIMITS.messageMax);
export const warningsSchema = z.array(messageSchema).max(LIMITS.maxWarnings);
export const timestampSchema = z.number().int().min(0).max(LIMITS.maxTimestampMs);
