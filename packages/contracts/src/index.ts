/**
 * @triptinker/contracts: the single source of truth for what crosses the wire.
 * Shipped as TypeScript source; Vite (frontend) and tsx (backend) both compile it directly.
 *
 *   dto/        request bodies, validated on both sides (BaseDto + strict zod schema)
 *   schema/     shapes the server sends back: itinerary, stream events, sources, errors, health
 *   security/   the shared text sanitiser
 */
export * from './limits';
export * from './dto/base.dto';
export * from './dto/generate-itinerary.dto';
export * from './dto/refine-itinerary.dto';
export * from './schema/error.schema';
export * from './schema/itinerary.schema';
export * from './schema/events.schema';
export * from './schema/health.schema';
export * from './schema/simulation.schema';
export * from './schema/source.schema';
export * from './security/sanitize';
export * from './sample';
