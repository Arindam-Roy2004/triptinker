import { z } from 'zod';
import { LIMITS } from '../limits';
import { itinerarySchema, type Itinerary } from '../schema/itinerary.schema';
import { BaseDto, userTextField } from './base.dto';

const ID = /^[a-z0-9-]{1,64}$/;

/**
 * The itinerary in a refine request comes back from the browser, so it is untrusted. On top of
 * the itinerary shape, ids must be plain and unique: the model edits stops by id, and an id is
 * the one string from the payload that is echoed into the prompt verbatim.
 */
function checkIds(itinerary: Itinerary, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  const check = (id: string, path: (string | number)[]) => {
    if (!ID.test(id)) ctx.addIssue({ code: 'custom', path, message: 'Ids may only use a-z, 0-9 and "-".' });
    else if (seen.has(id)) ctx.addIssue({ code: 'custom', path, message: `Duplicate id "${id}".` });
    seen.add(id);
  };
  itinerary.days.forEach((day, d) => {
    check(day.id, ['days', d, 'id']);
    day.stops.forEach((stop, s) => check(stop.id, ['days', d, 'stops', s, 'id']));
  });
}

// POST /api/itinerary/refine
export class RefineItineraryDto extends BaseDto {
  static schema = z
    .object({
      instruction: userTextField(LIMITS.instructionMin, LIMITS.instructionMax, 'Describe the change you want.'),
      itinerary: itinerarySchema.superRefine(checkIds),
    })
    .strict();
}

export type RefineItineraryInput = z.infer<typeof RefineItineraryDto.schema>;
