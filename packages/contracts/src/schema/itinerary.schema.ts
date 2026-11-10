import { z } from 'zod';
import { LIMITS } from '../limits';
import { boundedText, idSchema } from './fields.schema';

/**
 * The itinerary as the app stores and renders it. Only data that has passed the server's
 * normaliser (or this schema in the browser) ever has this type. Raw model output never does.
 */

export const CATEGORIES = ['sight', 'food', 'activity', 'nature', 'shopping', 'nightlife', 'transit', 'stay', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const stopSchema = z.strictObject({
  id: idSchema,
  /** 24h "HH:MM", or null when the model gave no usable time. */
  time: z
    .string()
    .length(5)
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  title: boundedText(LIMITS.titleMax),
  description: boundedText(LIMITS.descriptionMax, 0),
  category: z.enum(CATEGORIES),
  durationMinutes: z.number().int().min(LIMITS.durationMin).max(LIMITS.durationMax).nullable(),
  area: boundedText(LIMITS.areaMax).nullable(),
  tip: boundedText(LIMITS.tipMax).nullable(),
});
export type Stop = z.infer<typeof stopSchema>;

export const daySchema = z.strictObject({
  id: idSchema,
  title: boundedText(LIMITS.dayTitleMax),
  summary: boundedText(LIMITS.daySummaryMax, 0),
  // Editing can consolidate existing stops into one day, or remove all of them.
  // Generation still caps each day at maxStopsPerDay in the normaliser.
  stops: z.array(stopSchema).max(LIMITS.maxTotalStops),
});
export type Day = z.infer<typeof daySchema>;

export const itinerarySchema = z.strictObject({
  title: boundedText(LIMITS.titleMax),
  destination: boundedText(LIMITS.destinationMax),
  summary: boundedText(LIMITS.summaryMax, 0),
  days: z.array(daySchema).min(1).max(LIMITS.maxDays),
  notes: z.array(boundedText(LIMITS.noteMax)).max(LIMITS.maxNotes),
}).superRefine((itinerary, ctx) => {
  const seen = new Set<string>();
  const check = (id: string, path: (string | number)[]) => {
    if (seen.has(id)) ctx.addIssue({ code: 'custom', path, message: `Duplicate id "${id}".` });
    seen.add(id);
  };
  let total = 0;
  itinerary.days.forEach((day, d) => {
    check(day.id, ['days', d, 'id']);
    day.stops.forEach((stop, s) => check(stop.id, ['days', d, 'stops', s, 'id']));
    total += day.stops.length;
  });
  if (total > LIMITS.maxTotalStops) ctx.addIssue({ code: 'custom', path: ['days'], message: `Keep the whole trip to ${LIMITS.maxTotalStops} stops.` });
});
export type Itinerary = z.infer<typeof itinerarySchema>;
