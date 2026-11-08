/** Size limits shared by the request DTOs, the itinerary schema and the browser's counters. */
export const LIMITS = {
  briefMin: 8,
  briefMax: 1500,
  instructionMin: 3,
  instructionMax: 400,
  maxDays: 10,
  maxStopsPerDay: 10,
  maxNotes: 5,
} as const;
