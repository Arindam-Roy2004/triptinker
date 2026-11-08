import { z } from 'zod';

// GET /api/health
export const healthSchema = z.object({
  configured: z.boolean(),
  model: z.string().nullable(),
  simulation: z.boolean(),
  /** Whether plans are grounded in a live web search. */
  search: z.boolean().default(false),
});
export type Health = z.infer<typeof healthSchema>;
