import { z } from 'zod';
import { LIMITS } from '../limits';
import { itinerarySchema } from '../schema/itinerary.schema';
import { BaseDto, userTextField } from './base.dto';

// Shared itinerary validation also protects nested fields and globally unique ids.
// POST /api/itinerary/refine
export class RefineItineraryDto extends BaseDto {
  static schema = z
    .object({
      instruction: userTextField(LIMITS.instructionMin, LIMITS.instructionMax, 'Describe the change you want.'),
      itinerary: itinerarySchema,
    })
    .strict();
}

export type RefineItineraryInput = z.infer<typeof RefineItineraryDto.schema>;
