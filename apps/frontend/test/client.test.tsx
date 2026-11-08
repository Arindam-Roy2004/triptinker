// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamPlan, type PlanRequest } from '@/features/planner/api';
import { useGeneration } from '@/features/planner/use-generation';
import { sample } from '@triptinker/contracts/testing';

const request: PlanRequest = { endpoint: '/api/itinerary', body: { brief: 'Three days in Lisbon', days: 3, pace: 'balanced' } };
const meta = { model: 'm', attempts: 1, durationMs: 1, repairedFrom: null };

/** A fetch Response whose SSE body is written by the test, so timing is fully controlled. */
function controllableStream() {
  let push!: (event: unknown) => void;
  let end!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      push = (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      end = () => controller.close();
    },
  });
  const response = new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  return { response, push, end };
}

function sseResponse(events: unknown[]) {
  const s = controllableStream();
  events.forEach(s.push);
  s.end();
  return s.response;
}

afterEach(() => vi.unstubAllGlobals());

describe('streamPlan', () => {
  it('returns a verified result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([{ type: 'stage', stage: 'drafting' }, { type: 'result', itinerary: sample(), warnings: [], meta }])));
    const onStage = vi.fn();
    const outcome = await streamPlan(request, { signal: new AbortController().signal, onStage });
    expect(outcome.kind).toBe('result');
    expect(onStage).toHaveBeenCalledWith('drafting', undefined);
  });

  it('rejects a result that fails validation in the browser', async () => {
    const broken = { ...sample(), days: [] };
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([{ type: 'result', itinerary: broken, warnings: [], meta }])));
    expect(await streamPlan(request, { signal: new AbortController().signal })).toMatchObject({ kind: 'error', code: 'SCHEMA_MISMATCH' });
  });

  it('treats a stream that ends without an answer as a dropped connection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([{ type: 'stage', stage: 'drafting' }])));
    expect(await streamPlan(request, { signal: new AbortController().signal })).toMatchObject({ kind: 'error', code: 'NETWORK' });
  });

  it('maps JSON error responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'NOT_CONFIGURED', message: 'No key', retryable: false } }, { status: 503 })));
    expect(await streamPlan(request, { signal: new AbortController().signal })).toEqual({ kind: 'error', code: 'NOT_CONFIGURED', message: 'No key', retryable: false });
  });

  it('gives up on a silent connection', async () => {
    const s = controllableStream();
    vi.stubGlobal('fetch', vi.fn(async () => s.response));
    expect(await streamPlan(request, { signal: new AbortController().signal, stallTimeoutMs: 50 })).toMatchObject({ kind: 'error', code: 'TIMEOUT' });
  });
});

describe('useGeneration', () => {
  it('never lets an older response overwrite a newer one', async () => {
    const slow = controllableStream();
    const fast = controllableStream();
    const responses = [slow.response, fast.response];
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!));
    const { result } = renderHook(() => useGeneration());
    const first = vi.fn();
    const second = vi.fn();

    act(() => void result.current.start('generate', request, first));
    act(() => void result.current.start('generate', request, second));

    const newer = { ...sample(), title: 'Newer plan' };
    await act(async () => {
      fast.push({ type: 'result', itinerary: newer, warnings: [], meta });
      // The older request finishes *after* the newer one.
      slow.push({ type: 'result', itinerary: sample(), warnings: [], meta });
    });

    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(second.mock.calls[0][0].itinerary.title).toBe('Newer plan');
    expect(first).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('cancel discards an in-flight result', async () => {
    const s = controllableStream();
    vi.stubGlobal('fetch', vi.fn(async () => s.response));
    const { result } = renderHook(() => useGeneration());
    const onSuccess = vi.fn();
    act(() => void result.current.start('generate', request, onSuccess));
    expect(result.current.state.status).toBe('running');
    act(() => result.current.cancel());
    await act(async () => s.push({ type: 'result', itinerary: sample(), warnings: [], meta }));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('collects raw deltas for display and clears them when a repair starts', async () => {
    const s = controllableStream();
    vi.stubGlobal('fetch', vi.fn(async () => s.response));
    const { result } = renderHook(() => useGeneration());
    act(() => void result.current.start('generate', request, vi.fn()));
    await act(async () => {
      s.push({ type: 'delta', text: '{"days": [' });
      s.push({ type: 'delta', text: ' oops' });
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'running', raw: '{"days": [ oops' }));
    await act(async () => s.push({ type: 'stage', stage: 'repairing', detail: 'Bad JSON.' }));
    await waitFor(() => expect(result.current.state).toMatchObject({ raw: '', repairReason: 'Bad JSON.' }));
  });

  it('surfaces errors with their retryability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([{ type: 'error', code: 'TIMEOUT', message: 'slow', retryable: true }])));
    const { result } = renderHook(() => useGeneration());
    await act(async () => result.current.start('generate', request, vi.fn()));
    expect(result.current.state).toMatchObject({ status: 'error', code: 'TIMEOUT', retryable: true });
  });
});
