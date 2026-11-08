import { z } from 'zod';
import { LIMITS } from '../limits';
import { BaseDto, userTextField } from './base.dto';

export const PACES = ['relaxed', 'balanced', 'packed'] as const;
export type Pace = (typeof PACES)[number];

// POST /api/itinerary
export class GenerateItineraryDto extends BaseDto {
  static schema = z
    .object({
      brief: userTextField(LIMITS.briefMin, LIMITS.briefMax, 'Tell us a little more about the trip.'),
      /** null = let the model infer the length from the brief. */
      days: z.number().int().min(1).max(LIMITS.maxDays).nullable(),
      pace: z.enum(PACES),
    })
    .strict();
}

export type GenerateItineraryInput = z.infer<typeof GenerateItineraryDto.schema>;
