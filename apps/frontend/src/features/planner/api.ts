import {
  healthSchema,
  streamEventSchema,
  transcriptionSchema,
  type ErrorCode,
  type GenerateItineraryInput,
  type Health,
  type Itinerary,
  type RefineItineraryInput,
  type ResultMeta,
  type Simulation,
  type Stage,
  type WebSource,
} from '@triptinker/contracts';
import { readEventStream } from '@/lib/sse';

export type Outcome =
  | { kind: 'result'; itinerary: Itinerary; warnings: string[]; meta: ResultMeta }
  | { kind: 'unplannable'; reason: string }
  | { kind: 'error'; code: ErrorCode; message: string; retryable: boolean }
  | { kind: 'aborted' };

export type StreamHandlers = {
  signal: AbortSignal;
  simulate?: Simulation | null;
  onStage?: (stage: Stage, detail?: string) => void;
  /** The pages the server's web search found, before drafting starts. */
  onSources?: (sources: WebSource[]) => void;
  onProgress?: (progress: { chars: number; days: number; stops: number }) => void;
  /** Raw model text as it streams — for display only, never parsed into UI. */
  onDelta?: (text: string) => void;
  /** The browser gives up if the connection is completely silent for this long. */
  stallTimeoutMs?: number;
};

const clientError = (code: ErrorCode, message: string, retryable = true): Outcome => ({ kind: 'error', code, message, retryable });

const STATUS_CODES: Record<number, ErrorCode> = { 400: 'INVALID_INPUT', 413: 'INVALID_INPUT', 429: 'RATE_LIMITED', 503: 'NOT_CONFIGURED' };

async function errorFromResponse(response: Response): Promise<Outcome> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; retryable?: boolean } };
    const parsed = streamEventSchema.safeParse({ type: 'error', ...body.error });
    if (parsed.success && parsed.data.type === 'error') {
      const { code, message, retryable } = parsed.data;
      return { kind: 'error', code, message, retryable };
    }
  } catch {
    /* fall through to a generic message */
  }
  const code = STATUS_CODES[response.status] ?? (response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'INTERNAL');
  return clientError(code, `The server responded with ${response.status}.`, response.status >= 500 || response.status === 429);
}

export type PlanRequest = { endpoint: '/api/itinerary'; body: GenerateItineraryInput } | { endpoint: '/api/itinerary/refine'; body: RefineItineraryInput };

/**
 * POSTs a plan request and consumes the SSE stream until a terminal event.
 * Never throws: every failure, including a cancel, becomes an Outcome.
 */
export async function streamPlan(request: PlanRequest, handlers: StreamHandlers): Promise<Outcome> {
  const { signal, simulate, stallTimeoutMs = 45_000 } = handlers;
  const local = new AbortController();
  const abort = () => local.abort();
  signal.addEventListener('abort', abort, { once: true });

  let stalled = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const resetWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      local.abort();
    }, stallTimeoutMs);
  };

  try {
    resetWatchdog();
    let response: Response;
    try {
      response = await fetch(request.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(simulate ? { 'x-simulate': simulate } : {}) },
        body: JSON.stringify(request.body),
        signal: local.signal,
      });
    } catch {
      if (signal.aborted) return { kind: 'aborted' };
      if (stalled) return clientError('TIMEOUT', 'The server did not respond in time.');
      return clientError('NETWORK', 'Could not reach the server. Check your connection and try again.');
    }

    if (!response.ok) return await errorFromResponse(response);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      return clientError('INTERNAL', 'The server sent an unexpected response.');
    }

    for await (const data of readEventStream(response.body, { onActivity: resetWatchdog, signal: local.signal })) {
      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const parsed = streamEventSchema.safeParse(json);
      if (!parsed.success) {
        // A result we can't verify is worse than no result: never render it.
        if ((json as { type?: unknown })?.type === 'result') {
          return clientError('SCHEMA_MISMATCH', 'Received an itinerary that failed verification in the browser.');
        }
        continue;
      }
      const event = parsed.data;
      switch (event.type) {
        case 'stage':
          handlers.onStage?.(event.stage, event.detail);
          break;
        case 'sources':
          handlers.onSources?.(event.sources);
          break;
        case 'progress':
          handlers.onProgress?.(event);
          break;
        case 'delta':
          handlers.onDelta?.(event.text);
          break;
        case 'result':
          return { kind: 'result', itinerary: event.itinerary, warnings: event.warnings, meta: event.meta };
        case 'unplannable':
          return { kind: 'unplannable', reason: event.reason };
        case 'error':
          return { kind: 'error', code: event.code, message: event.message, retryable: event.retryable };
      }
    }
    if (signal.aborted) return { kind: 'aborted' };
    if (stalled) return clientError('TIMEOUT', 'The connection went silent, so we stopped waiting.');
    return clientError('NETWORK', 'The connection closed before the itinerary was finished.');
  } catch {
    if (signal.aborted) return { kind: 'aborted' };
    if (stalled) return clientError('TIMEOUT', 'The connection went silent, so we stopped waiting.');
    return clientError('NETWORK', 'The connection dropped while the itinerary was being written.');
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener('abort', abort);
  }
}

/** Sends a WAV clip to the server's speech model. Resolves to the transcript, or throws a message to show. */
export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Could not reach the server. Check your connection and try again.', { cause: error });
  }
  if (!response.ok) {
    const outcome = await errorFromResponse(response);
    throw new Error(outcome.kind === 'error' ? outcome.message : 'Voice input failed.');
  }
  const parsed = transcriptionSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('The server sent an unexpected response.');
  return parsed.data.text;
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health | null> {
  try {
    const response = await fetch('/api/health', { signal });
    if (!response.ok) return null;
    const parsed = healthSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
