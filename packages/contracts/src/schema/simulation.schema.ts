import { z } from 'zod';

/** Failure modes the dev-only failure lab can force, to exercise every error path. */
export const SIMULATIONS = ['ok', 'slow', 'malformed-once', 'malformed', 'wrong-shape', 'partial', 'empty', 'truncated', 'unplannable', 'provider-error', 'rate-limited', 'stall'] as const;
export const simulationSchema = z.enum(SIMULATIONS);
export type Simulation = (typeof SIMULATIONS)[number];
