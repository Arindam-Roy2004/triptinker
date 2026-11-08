import { SAMPLE_ITINERARY, sampleAsModelOutput } from './sample';
import type { Itinerary } from './schema/itinerary.schema';

/** Fixtures shared by the web and API test suites. Never imported by application code. */

export const clone = <T>(value: T): T => structuredClone(value);

export function counter(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export const modelOutput = () => clone(sampleAsModelOutput());
export const sample = (): Itinerary => clone(SAMPLE_ITINERARY);
