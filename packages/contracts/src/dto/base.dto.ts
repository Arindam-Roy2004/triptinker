import { z } from 'zod';
import type { FieldError } from '../schema/error.schema';
import { sanitizeUserText, textLength } from '../security/sanitize';

export type DtoResult<T> = { errors: FieldError[]; value: null } | { errors: null; value: T };

export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({ field: issue.path.join('.') || 'body', message: issue.message }));
}

/**
 * Base for request DTOs. Each subclass declares one strict zod schema. `validate` never throws:
 * it returns either per-field errors or the cleaned value. The browser uses the same DTOs to
 * check a form before sending, so both sides reject the same input with the same message.
 */
export abstract class BaseDto {
  static schema: z.ZodType = z.object({});

  static validate<T>(this: { schema: z.ZodType<T> }, data: unknown): DtoResult<T> {
    const result = this.schema.safeParse(data ?? {});
    if (!result.success) return { errors: toFieldErrors(result.error), value: null };
    return { errors: null, value: result.data };
  }
}

/**
 * Free text a person typed. It is cleaned by the shared sanitiser, then measured in code points.
 * The raw cap only stops absurd payloads before the sanitiser runs.
 */
export function userTextField(min: number, max: number, tooShort: string) {
  const tooLong = `Keep it under ${max} characters.`;
  return z
    .string({ error: 'Expected text.' })
    .max(max * 4, tooLong)
    .transform(sanitizeUserText)
    .refine((value) => textLength(value) >= min, tooShort)
    .refine((value) => textLength(value) <= max, tooLong);
}
