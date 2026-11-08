import type { Chunk, Provider } from '../src/provider';

export { clone, counter, modelOutput, sample } from '@triptinker/contracts/testing';

/** A provider that replays scripted attempts: each entry is the text (or error) for one call. */
export function scriptedProvider(attempts: (string | Error | { chunks: Chunk[] } | 'hang')[]): Provider & { calls: number; signals: AbortSignal[] } {
  const provider = {
    model: 'test-model',
    calls: 0,
    signals: [] as AbortSignal[],
    async *stream(_messages: unknown, signal: AbortSignal): AsyncIterable<Chunk> {
      const script = attempts[provider.calls];
      provider.calls += 1;
      provider.signals.push(signal);
      if (script instanceof Error) throw script;
      if (script === 'hang') {
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        return;
      }
      if (typeof script === 'object') {
        yield* script.chunks;
        return;
      }
      for (let i = 0; i < script.length; i += 64) yield { type: 'text', text: script.slice(i, i + 64) };
      yield { type: 'finish', reason: 'stop' };
    },
  };
  return provider;
}
