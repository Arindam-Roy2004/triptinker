import { z } from 'zod';
import { modelSchema } from './fields.schema';

// GET /api/health
export const healthSchema = z.strictObject({
  configured: z.boolean(),
  model: modelSchema.nullable(),
  simulation: z.boolean(),
  /** Whether plans are grounded in a live web search. */
  search: z.boolean().default(false),
  /** Whether the server can turn recorded speech into text (POST /api/transcribe). */
  voice: z.boolean().default(false),
}).superRefine((health, ctx) => {
  if (health.configured !== (health.model !== null)) ctx.addIssue({ code: 'custom', path: ['model'], message: 'Only a configured server may report a model.' });
  if (health.voice && !health.configured) ctx.addIssue({ code: 'custom', path: ['voice'], message: 'Voice input requires a configured provider.' });
});

export type Health = z.infer<typeof healthSchema>;
