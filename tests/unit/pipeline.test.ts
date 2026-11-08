import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@shared/schema';
import { AppError } from '../../server/errors';
import { runGeneration } from '../../server/pipeline';
import { counter, modelOutput, scriptedProvider } from './helpers';

const timeouts = { firstTokenTimeoutMs: 200, idleTimeoutMs: 200, totalTimeoutMs: 2_000 };
const good = () => JSON.stringify(modelOutput());

async function run(provider: ReturnType<typeof scriptedProvider>, signal = new AbortController().signal) {
  const events: StreamEvent[] = [];
  let error: unknown = null;
  try {
    await runGeneration({ provider, messages: [{ role: 'user', content: 'x' }], timeouts, signal, emit: (e) => events.push(e), newId: counter() });
  } catch (e) {
    error = e;
  }
  return { events, error, last: events.at(-1), stages: events.filter((e) => e.type === 'stage').map((e) => (e as { stage: string }).stage) };
}

describe('runGeneration', () => {
  it('streams progress and finishes with a validated result', async () => {
    const { last, stages, events } = await run(scriptedProvider([good()]));
    expect(stages).toEqual(['connecting', 'drafting', 'validating']);
    expect(events.some((e) => e.type === 'progress')).toBe(true);
    expect(last).toMatchObject({ type: 'result', meta: { attempts: 1, repairedFrom: null } });
  });

  it('streams the raw text as delta events that add up to the full output', async () => {
    const text = good();
    const { events } = await run(scriptedProvider([text]));
    const streamed = events.flatMap((e) => (e.type === 'delta' ? [e.text] : [])).join('');
    expect(streamed).toBe(text);
    // Every delta arrives before validation starts.
    const lastDelta = events.findLastIndex((e) => e.type === 'delta');
    const validating = events.findIndex((e) => e.type === 'stage' && e.stage === 'validating');
    expect(lastDelta).toBeLessThan(validating);
  });

  it('repairs malformed output once, telling the model what was wrong', async () => {
    const provider = scriptedProvider(['{"days": [ oops', good()]);
    const { last, stages } = await run(provider);
    expect(provider.calls).toBe(2);
    expect(stages).toContain('repairing');
    expect(last).toMatchObject({ type: 'result', meta: { attempts: 2, repairedFrom: 'MALFORMED_JSON' } });
  });

  it('gives up after one failed repair', async () => {
    const provider = scriptedProvider(['nope', '{"trip": "still wrong"}']);
    const { error } = await run(provider);
    expect(provider.calls).toBe(2);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('SCHEMA_MISMATCH');
  });

  it('treats a length cut-off as truncated and repairs it', async () => {
    const provider = scriptedProvider([{ chunks: [{ type: 'text', text: good().slice(0, 500) }, { type: 'finish', reason: 'length' }] }, good()]);
    const { last } = await run(provider);
    expect(last).toMatchObject({ type: 'result', meta: { repairedFrom: 'TRUNCATED' } });
  });

  it('does not repair transport failures', async () => {
    const provider = scriptedProvider([new AppError('RATE_LIMITED', 'slow down', true)]);
    const { error } = await run(provider);
    expect(provider.calls).toBe(1);
    expect((error as AppError).code).toBe('RATE_LIMITED');
  });

  it('times out a silent stream and aborts the upstream request', async () => {
    const provider = scriptedProvider(['hang']);
    const { error } = await run(provider);
    expect((error as AppError).code).toBe('TIMEOUT');
    expect(provider.signals[0].aborted).toBe(true);
  });

  it('passes an unplannable brief through without retrying', async () => {
    const provider = scriptedProvider([JSON.stringify({ status: 'unplannable', reason: 'Where to?' })]);
    const { last } = await run(provider);
    expect(provider.calls).toBe(1);
    expect(last).toEqual({ type: 'unplannable', reason: 'Where to?' });
  });

  it('stops quietly when the client disconnects', async () => {
    const controller = new AbortController();
    const provider = scriptedProvider(['hang']);
    setTimeout(() => controller.abort(), 20);
    const { error, events } = await run(provider, controller.signal);
    expect(provider.signals[0].aborted).toBe(true);
    expect(error).not.toBeInstanceOf(AppError);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
});
