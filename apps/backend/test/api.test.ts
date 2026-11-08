import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@triptinker/contracts';
import { createApp, type AppOptions } from '../src/app';
import { createOpenAiProvider } from '../src/provider';
import { modelOutput, sample, scriptedProvider } from './helpers';

const providerConfig = {
  apiKey: 'sk-secret-never-leaves',
  baseUrl: 'https://llm.test/v1',
  model: 'test-model',
  jsonMode: true,
  firstTokenTimeoutMs: 500,
  idleTimeoutMs: 500,
  totalTimeoutMs: 3000,
  maxOutputTokens: 1000,
};
const brief = { brief: 'Three days in Lisbon with trams and seafood', days: 3, pace: 'balanced' };
let close: (() => void) | null = null;

async function serve(overrides: Partial<AppOptions> = {}) {
  const app = createApp({ provider: providerConfig, configured: true, allowSimulation: false, ...overrides });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function events(response: Response): Promise<StreamEvent[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

afterEach(() => close?.());

describe('HTTP API', () => {
  it('reports health without exposing the key', async () => {
    const base = await serve();
    const body = await (await fetch(`${base}/api/health`)).text();
    expect(JSON.parse(body)).toEqual({ configured: true, model: 'test-model', simulation: false, search: false });
    expect(body).not.toContain('sk-secret');
  });

  it('validates input before calling the model', async () => {
    const provider = scriptedProvider([]);
    const base = await serve({ createProvider: () => provider });
    const short = await post(base, '/api/itinerary', { ...brief, brief: 'hi' });
    expect(short.status).toBe(400);
    expect(((await short.json()) as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
    const broken = await post(base, '/api/itinerary', '{not json');
    expect(broken.status).toBe(400);
    expect(provider.calls).toBe(0);
  });

  it('returns 503 when no model is configured', async () => {
    const base = await serve({ configured: false });
    const res = await post(base, '/api/itinerary', brief);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_CONFIGURED');
  });

  it('streams a validated itinerary as server-sent events', async () => {
    const base = await serve({ createProvider: () => scriptedProvider([JSON.stringify(modelOutput())]) });
    const res = await post(base, '/api/itinerary', brief);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const stream = await events(res);
    expect(stream[0]).toEqual({ type: 'stage', stage: 'connecting' });
    expect(stream.at(-1)).toMatchObject({ type: 'result', meta: { model: 'test-model' } });
  });

  it('sends a safe error event, never internal details', async () => {
    const base = await serve({ createProvider: () => scriptedProvider(['garbage', 'more garbage']) });
    const stream = await events(await post(base, '/api/itinerary', brief));
    expect(stream.at(-1)).toEqual({ type: 'error', code: 'MALFORMED_JSON', message: expect.any(String), retryable: true });
  });

  it('ignores the simulation header unless the lab is enabled', async () => {
    const provider = scriptedProvider([JSON.stringify(modelOutput())]);
    const base = await serve({ createProvider: () => provider });
    const stream = await events(await post(base, '/api/itinerary', brief, { 'x-simulate': 'malformed' }));
    expect(provider.calls).toBe(1);
    expect(stream.at(-1)?.type).toBe('result');
  });

  it('refines with existing stop ids preserved', async () => {
    const output = modelOutput();
    (output.itinerary.days[0].stops[0] as { ref: string | null }).ref = 'sample-s1';
    const base = await serve({ createProvider: () => scriptedProvider([JSON.stringify(output)]) });
    const stream = await events(await post(base, '/api/itinerary/refine', { instruction: 'Add a coffee stop', itinerary: sample() }));
    const last = stream.at(-1);
    expect(last?.type).toBe('result');
    if (last?.type === 'result') expect(last.itinerary.days[0].stops[0].id).toBe('sample-s1');
  });

  it('cancels the upstream request when the browser disconnects', async () => {
    const provider = scriptedProvider(['hang']);
    const base = await serve({ createProvider: () => provider });
    const controller = new AbortController();
    const res = await fetch(`${base}/api/itinerary`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(brief), signal: controller.signal });
    expect(res.ok).toBe(true);
    controller.abort();
    await expect.poll(() => provider.signals[0]?.aborted, { timeout: 2000 }).toBe(true);
  });
});

describe('OpenAI-compatible provider', () => {
  const sse = (lines: string[]) => new Response(lines.map((l) => `${l}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

  async function collect(response: Response) {
    const provider = createOpenAiProvider(providerConfig, async () => response);
    const chunks = [];
    for await (const chunk of provider.stream([], new AbortController().signal)) chunks.push(chunk);
    return chunks;
  }

  it('reads content deltas, keepalives and the finish reason', async () => {
    const chunks = await collect(
      sse([': OPENROUTER PROCESSING', 'data: {"choices":[{"delta":{"content":"{\\"a\\""}}]}', 'data: {"choices":[{"delta":{"content":":1}"},"finish_reason":"stop"}]}', 'data: [DONE]']),
    );
    expect(chunks).toEqual([{ type: 'keepalive' }, { type: 'text', text: '{"a"' }, { type: 'text', text: ':1}' }, { type: 'finish', reason: 'stop' }]);
  });

  it.each([
    [401, 'PROVIDER_AUTH'],
    [429, 'RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [400, 'PROVIDER_REJECTED'],
  ])('maps HTTP %i to %s', async (status, code) => {
    await expect(collect(new Response('{}', { status }))).rejects.toMatchObject({ code });
  });

  it('surfaces an error sent mid-stream', async () => {
    await expect(collect(sse(['data: {"error":{"message":"overloaded","code":502}}']))).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
