import { sampleAsModelOutput } from '@triptinker/contracts';
import type { Simulation } from '@triptinker/contracts';
import { appError } from './errors';
import type { Chunk, Provider } from './provider';
import type { ChatMessage } from './prompt';
import type { Search } from './search/tavily';

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

type RefinablePlan = { days: { stops: Record<string, unknown>[] }[] } & Record<string, unknown>;

/**
 * For a refinement, answer like a well-behaved model: take the current plan from the prompt, keep
 * every stop's ref, add a coffee stop to the first day and drop that day's last stop. Anything
 * that is not a refinement (or can't be read) gets the sample.
 */
function answerFor(messages: ChatMessage[]) {
  const prompt = messages.at(-1)?.content ?? '';
  if (!prompt.startsWith('Here is the current itinerary')) return good();
  try {
    const plan = JSON.parse(prompt.split('\n')[1] ?? '') as RefinablePlan;
    const first = plan.days[0];
    if (first) {
      if (first.stops.length > 2) first.stops.pop();
      first.stops.splice(1, 0, {
        ref: null,
        time: '09:00',
        title: 'Coffee at Fábrica Coffee Roasters',
        description: 'Small-batch espresso and a pastel de nata before the climb.',
        category: 'food',
        durationMinutes: 30,
        area: 'Baixa',
        tip: null,
      });
    }
    return JSON.stringify({ status: 'ok', itinerary: plan }, null, 1);
  } catch {
    return good();
  }
}

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
    async *stream(messages, signal) {
      attempt += 1;
      switch (scenario) {
        case 'ok':
          yield* streamText(answerFor(messages), signal);
          break;
        case 'slow':
          yield* streamText(answerFor(messages), signal, { firstDelay: 3_000, chunk: 40, delay: 50 });
          break;
        case 'malformed-once':
        case 'malformed':
          if (scenario === 'malformed' || attempt === 1) {
            // A plausible model mistake: trailing commas and an unquoted key.
            yield* streamText(
              `Sure! Here is your plan:\n${good()
                .slice(0, 900)
                .replace(/"title"/, 'title')},,}`,
              signal,
            );
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

/** The failure lab's stand-in for web search: fixed results after a short pause, no network. */
export const simulatedSearch: Search = async (_query, signal) => {
  await sleep(450, signal);
  return [
    { title: 'Lisbon', url: 'https://en.wikipedia.org/wiki/Lisbon', domain: 'en.wikipedia.org', content: 'Capital of Portugal on the Tagus estuary, known for its hills, trams and tiled facades.' },
    { title: 'Visit Lisboa', url: 'https://www.visitlisboa.com/en', domain: 'visitlisboa.com', content: 'Official tourism site: neighbourhoods, viewpoints, museums and the Lisboa Card.' },
    { title: 'Lisbon travel guide', url: 'https://www.lonelyplanet.com/portugal/lisbon', domain: 'lonelyplanet.com', content: 'Alfama, Belém, Bairro Alto and day trips to Sintra.' },
  ];
};
