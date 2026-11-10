import { z } from 'zod';
import { LIMITS } from '../limits';
import { boundedText } from './fields.schema';

// POST /api/transcribe (body: audio/wav) → 200
// Silence is a valid empty transcript; the recording UI handles it explicitly.
export const transcriptionSchema = z.strictObject({ text: boundedText(LIMITS.briefMax, 0) });
export type Transcription = z.infer<typeof transcriptionSchema>;
