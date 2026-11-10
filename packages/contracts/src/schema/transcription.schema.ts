import { z } from 'zod';

// POST /api/transcribe (body: audio/wav) → 200
export const transcriptionSchema = z.object({ text: z.string() });
export type Transcription = z.infer<typeof transcriptionSchema>;
