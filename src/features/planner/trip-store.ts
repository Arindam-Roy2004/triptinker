import { useCallback, useReducer } from 'react';
import { z } from 'zod';
import { itinerarySchema, resultMetaSchema, tripRequestSchema, type Itinerary } from '@shared/schema';

export const tripSourceSchema = z.enum(['ai', 'sample']);

/** The trip in the workspace, plus where it came from. Also the shape persisted to storage. */
export const tripSchema = z.object({
  id: z.string(),
  source: tripSourceSchema,
  request: tripRequestSchema.nullable(),
  itinerary: itinerarySchema,
  model: z.string().nullable(),
  /** How the result was obtained (attempts, repair), for the validation panel. Null for samples. */
  meta: resultMetaSchema.nullable().default(null),
  warnings: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Trip = z.infer<typeof tripSchema>;

const HISTORY_LIMIT = 40;

type State = { trip: Trip | null; past: Itinerary[]; future: Itinerary[] };

type Action =
  | { type: 'load'; trip: Trip | null }
  | { type: 'edit'; edit: (itinerary: Itinerary) => Itinerary }
  | { type: 'undo' }
  | { type: 'redo' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { trip: action.trip, past: [], future: [] };
    case 'edit': {
      if (!state.trip) return state;
      const next = action.edit(state.trip.itinerary);
      if (next === state.trip.itinerary) return state; // no-op edits don't enter history
      return {
        trip: { ...state.trip, itinerary: next, updatedAt: Date.now() },
        past: [...state.past, state.trip.itinerary].slice(-HISTORY_LIMIT),
        future: [],
      };
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!state.trip || !previous) return state;
      return {
        trip: { ...state.trip, itinerary: previous, updatedAt: Date.now() },
        past: state.past.slice(0, -1),
        future: [state.trip.itinerary, ...state.future],
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!state.trip || !next) return state;
      return {
        trip: { ...state.trip, itinerary: next, updatedAt: Date.now() },
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
