import { z } from 'zod';

// GET /api/health
export const healthSchema = z.object({
  configured: z.boolean(),
  model: z.string().nullable(),
  simulation: z.boolean(),
  /** Whether plans are grounded in a live web search. */
  search: z.boolean().default(false),
  /** Whether the server can turn recorded speech into text (POST /api/transcribe). */
  voice: z.boolean().default(false),
});

// POST /api/transcribe (body: audio/wav) → 200
export const transcriptionSchema = z.object({ text: z.string() });
export type Transcription = z.infer<typeof transcriptionSchema>;
export type Health = z.infer<typeof healthSchema>;
