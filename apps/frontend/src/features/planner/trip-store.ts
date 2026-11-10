import { useCallback, useReducer } from 'react';
import { z } from 'zod';
import { GenerateItineraryDto, LIMITS, idSchema, itinerarySchema, modelSchema, resultMetaSchema, sourcesSchema, stripUnsafeText, timestampSchema, warningsSchema, type Itinerary } from '@triptinker/contracts';

export const tripSourceSchema = z.enum(['ai', 'sample']);

/** The trip in the workspace, plus where it came from. Also the shape persisted to storage. */
export const tripSchema = z.strictObject({
  id: idSchema,
  source: tripSourceSchema,
  request: GenerateItineraryDto.schema.nullable(),
  itinerary: itinerarySchema,
  model: modelSchema.nullable(),
  /** How the result was obtained (attempts, repair), for the validation panel. Null for samples. */
  meta: resultMetaSchema.nullable().default(null),
  warnings: warningsSchema.default([]),
  /** Web pages the plan was grounded in. Empty for samples, and for plans made without search. */
  sources: sourcesSchema.default([]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).superRefine((trip, ctx) => {
  if (trip.updatedAt < trip.createdAt) ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'A trip cannot be updated before it was created.' });
  if (trip.meta && trip.meta.model !== trip.model) ctx.addIssue({ code: 'custom', path: ['model'], message: 'The model must match the generation metadata.' });
  if (trip.source === 'ai' && trip.model === null) ctx.addIssue({ code: 'custom', path: ['model'], message: 'AI trips must identify their model.' });
  if (trip.source === 'sample' && (trip.model !== null || trip.meta !== null)) {
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'Sample trips cannot have AI generation metadata.' });
  }
});
export type Trip = z.infer<typeof tripSchema>;

/** Copies every string in plain JSON data with hidden control and formatting characters removed. */
function stripStored(value: unknown): unknown {
  if (typeof value === 'string') return stripUnsafeText(value);
  if (Array.isArray(value)) return value.map(stripStored);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stripStored(entry)]));
  return value;
}

/**
 * A trip read back from storage. Plans saved before the stricter text rules can hold invisible
 * characters from model output; remove them rather than discarding the traveller's trip.
 */
export const storedTripSchema = z.preprocess(stripStored, tripSchema);

const HISTORY_LIMIT = 40;
// Edits must still differ from a saved copy if the clock moves backwards or two edits share a millisecond.
const nextUpdatedAt = (previous: number) => Math.min(LIMITS.maxTimestampMs, Math.max(Date.now(), previous + 1));

type State = { trip: Trip | null; past: Itinerary[]; future: Itinerary[] };

type Action = { type: 'load'; trip: Trip | null } | { type: 'edit'; edit: (itinerary: Itinerary) => Itinerary } | { type: 'undo' } | { type: 'redo' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { trip: action.trip, past: [], future: [] };
    case 'edit': {
      if (!state.trip) return state;
      const next = action.edit(state.trip.itinerary);
      if (next === state.trip.itinerary) return state; // no-op edits don't enter history
      return {
        trip: { ...state.trip, itinerary: next, updatedAt: nextUpdatedAt(state.trip.updatedAt) },
        past: [...state.past, state.trip.itinerary].slice(-HISTORY_LIMIT),
        future: [],
      };
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!state.trip || !previous) return state;
      return {
        trip: { ...state.trip, itinerary: previous, updatedAt: nextUpdatedAt(state.trip.updatedAt) },
        past: state.past.slice(0, -1),
        future: [state.trip.itinerary, ...state.future],
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!state.trip || !next) return state;
      return {
        trip: { ...state.trip, itinerary: next, updatedAt: nextUpdatedAt(state.trip.updatedAt) },
        past: [...state.past, state.trip.itinerary],
        future: rest,
      };
    }
  }
}

export function useTripStore(initial: Trip | null) {
  const [state, dispatch] = useReducer(reducer, { trip: initial, past: [], future: [] });
  return {
    trip: state.trip,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    load: useCallback((trip: Trip | null) => dispatch({ type: 'load', trip }), []),
    edit: useCallback((edit: (itinerary: Itinerary) => Itinerary) => dispatch({ type: 'edit', edit }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  };
}

export { reducer as tripReducer };
