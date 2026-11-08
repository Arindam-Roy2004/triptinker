import { sampleAsModelOutput } from '@shared/sample';
import type { Simulation } from '@shared/schema';
import { appError } from './errors';
import type { Chunk, Provider } from './provider';

/**
 * A fake provider for the dev-only failure lab and the end-to-end tests. Each scenario
 * reproduces a real failure mode we have seen from models, so every recovery path in the
 * pipeline and the UI can be exercised on demand without burning credits.
 */

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

async function* streamText(text: string, signal: AbortSignal, { chunk = 48, delay = 12, firstDelay = 300 } = {}): AsyncIterable<Chunk> {
  await sleep(firstDelay, signal);
  for (let i = 0; i < text.length; i += chunk) {
    yield { type: 'text', text: text.slice(i, i + chunk) };
    await sleep(delay, signal);
  }
}

const good = () => JSON.stringify(sampleAsModelOutput(), null, 1);

function partial() {
  const output = sampleAsModelOutput();
  const day = output.itinerary.days[0];
  // Two nameless stops, a 12h time and an unknown category: salvageable with warnings.
  (day.stops[1] as Record<string, unknown>).title = '';
  (day.stops[3] as Record<string, unknown>).title = undefined;
  (day.stops[2] as Record<string, unknown>).time = '10am';
  (day.stops[4] as Record<string, unknown>).category = 'museum-ish';
  return JSON.stringify(output);
}

export const SIMULATION_TIMEOUTS = { firstTokenTimeoutMs: 6_000, idleTimeoutMs: 4_000, totalTimeoutMs: 40_000 };

export function createSimulatedProvider(scenario: Simulation): Provider {
  let attempt = 0;
  return {
    model: `simulated:${scenario}`,
    async *stream(_messages, signal) {
      attempt += 1;
      switch (scenario) {
        case 'ok':
          yield* streamText(good(), signal);
          break;
        case 'slow':
          yield* streamText(good(), signal, { firstDelay: 3_000, chunk: 40, delay: 50 });
          break;
        case 'malformed-once':
        case 'malformed':
          if (scenario === 'malformed' || attempt === 1) {
            // A plausible model mistake: trailing commas and an unquoted key.
            yield* streamText(`Sure! Here is your plan:\n${good().slice(0, 900).replace(/"title"/, 'title')},,}`, signal);
          } else {
            yield* streamText(good(), signal);
          }
          break;
        case 'wrong-shape':
          yield* streamText(JSON.stringify({ trip: 'Lisbon', plan: 'Day 1: Alfama. Day 2: Sintra. Day 3: Belém.' }), signal);
          break;
        case 'partial':
          yield* streamText(partial(), signal);
          break;
        case 'empty':
          await sleep(600, signal);
          break;
        case 'truncated':
          if (attempt === 1) {
            yield* streamText(good().slice(0, 1_400), signal);
            yield { type: 'finish', reason: 'length' };
            return;
          } else {
            yield* streamText(good(), signal);
          }
          break;
        case 'unplannable':
          yield* streamText(JSON.stringify({ status: 'unplannable', reason: 'The brief does not mention where or when you want to travel.' }), signal);
          break;
        case 'provider-error':
          await sleep(700, signal);
          throw appError('PROVIDER_UNAVAILABLE', 'simulated 503');
        case 'rate-limited':
          await sleep(300, signal);
          throw appError('RATE_LIMITED', 'simulated 429');
        case 'stall':
          yield* streamText(good().slice(0, 700), signal);
          await sleep(60_000, signal); // the idle timeout fires long before this
          break;
      }
      yield { type: 'finish', reason: 'stop' };
    },
  };
}
