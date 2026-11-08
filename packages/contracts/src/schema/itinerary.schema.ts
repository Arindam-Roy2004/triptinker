import { z } from 'zod';
import { LIMITS } from '../limits';

/**
 * The itinerary as the app stores and renders it. Only data that has passed the server's
 * normaliser (or this schema in the browser) ever has this type. Raw model output never does.
 */

export const CATEGORIES = ['sight', 'food', 'activity', 'nature', 'shopping', 'nightlife', 'transit', 'stay', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

export const stopSchema = z.object({
  id: z.string().min(1).max(64),
  /** 24h "HH:MM", or null when the model gave no usable time. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  title: text(120),
  description: z.string().max(600),
  category: z.enum(CATEGORIES),
  durationMinutes: z.number().int().min(5).max(720).nullable(),
  area: z.string().max(80).nullable(),
  tip: z.string().max(300).nullable(),
});
export type Stop = z.infer<typeof stopSchema>;

export const daySchema = z.object({
  id: z.string().min(1).max(64),
  title: text(100),
  summary: z.string().max(300),
  stops: z.array(stopSchema).max(LIMITS.maxStopsPerDay * 2),
});
export type Day = z.infer<typeof daySchema>;

export const itinerarySchema = z.object({
  title: text(120),
  destination: text(80),
  summary: z.string().max(500),
  days: z.array(daySchema).min(1).max(LIMITS.maxDays),
  notes: z.array(z.string().max(240)).max(LIMITS.maxNotes),
});
export type Itinerary = z.infer<typeof itinerarySchema>;
