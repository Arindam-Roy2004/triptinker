import type { ErrorCode, StreamEvent } from '@shared/schema';
import { extractJson, estimateProgress, normalizeItinerary, type Normalized } from './normalize';
import { AppError, REPAIRABLE, USER_MESSAGES, appError } from './errors';
import { repairMessages, type ChatMessage } from './prompt';
import type { Provider } from './provider';

export type Timeouts = { firstTokenTimeoutMs: number; idleTimeoutMs: number; totalTimeoutMs: number };

type RunOptions = {
  provider: Provider;
  messages: ChatMessage[];
  timeouts: Timeouts;
  /** Aborted when the browser disconnects or cancels. */
  signal: AbortSignal;
  emit: (event: StreamEvent) => void;
  newId: () => string;
  knownIds?: ReadonlySet<string>;
  progressIntervalMs?: number;
};

type AttemptOutcome = { output: string; result: Normalized };

/**
 * One model call: stream text, enforce timeouts, then parse and normalise.
 * Throws AppError for transport-level failures; returns a Normalized result for output-level ones.
 */
async function attempt(messages: ChatMessage[], opts: RunOptions): Promise<AttemptOutcome> {
  const { provider, timeouts, signal, emit } = opts;
  const controller = new AbortController();
  let timedOut: string | null = null;

  const abortOnClient = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abortOnClient, { once: true });

  const expire = (why: string) => () => {
    timedOut = why;
    controller.abort();
  };
  const total = setTimeout(expire(`no complete answer within ${timeouts.totalTimeoutMs} ms`), timeouts.totalTimeoutMs);
  let silence = setTimeout(expire(`no output within ${timeouts.firstTokenTimeoutMs} ms`), timeouts.firstTokenTimeoutMs);
  const heardFromUpstream = () => {
    clearTimeout(silence);
    silence = setTimeout(expire(`stream went silent for ${timeouts.idleTimeoutMs} ms`), timeouts.idleTimeoutMs);
  };

  let output = '';
  let unsent = 0; // index into output of text not yet sent as a delta
  const flush = () => {
    if (unsent < output.length) emit({ type: 'delta', text: output.slice(unsent) });
    unsent = output.length;
  };
  let finishReason: string | null = null;
  let lastProgress = 0;
  let drafting = false;

  try {
    for await (const chunk of provider.stream(messages, controller.signal)) {
      heardFromUpstream();
      if (chunk.type === 'finish') {
        finishReason ??= chunk.reason;
        continue;
      }
      if (chunk.type === 'keepalive') continue;
      output += chunk.text;
      if (output.length > 200_000) throw appError('SCHEMA_MISMATCH', 'response exceeded 200k characters');
      if (!drafting) {
        drafting = true;
        emit({ type: 'stage', stage: 'drafting' });
      }
      const now = Date.now();
      if (now - lastProgress >= (opts.progressIntervalMs ?? 120)) {
        lastProgress = now;
        flush();
        emit({ type: 'progress', chars: output.length, ...estimateProgress(output) });
      }
    }
  } catch (error) {
    if (signal.aborted) throw error; // the browser left; nothing to report
    if (timedOut) throw appError('TIMEOUT', timedOut);
    if (error instanceof AppError) throw error;
    throw appError('INTERNAL', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(total);
    clearTimeout(silence);
    signal.removeEventListener('abort', abortOnClient);
  }

  flush();
  emit({ type: 'progress', chars: output.length, ...estimateProgress(output) });
  emit({ type: 'stage', stage: 'validating' });

  if (finishReason === 'length') {
    return { output, result: { ok: false, code: 'TRUNCATED', detail: 'The output hit the token limit before the JSON was complete.' } };
  }
  const parsed = extractJson(output);
  if (!parsed.ok) return { output, result: parsed };
  return { output, result: normalizeItinerary(parsed.value, { newId: opts.newId, knownIds: opts.knownIds }) };
}

const REPAIR_HINT: Partial<Record<ErrorCode, string>> = {
  TRUNCATED: 'Your answer was cut off. Keep every description to one short sentence so the whole plan fits.',
};

/**
 * Full generation: one attempt, plus at most one corrective attempt for output-level
 * failures (malformed JSON, wrong shape, empty, truncated). Transport failures are not
 * repaired here — the browser shows them with a retry button instead.
 */
export async function runGeneration(opts: RunOptions): Promise<void> {
  const started = Date.now();
  opts.emit({ type: 'stage', stage: 'connecting' });

  const first = await attempt(opts.messages, opts);
  let result = first.result;
  let repairedFrom: ErrorCode | null = null;

  if (result.ok === false && REPAIRABLE.has(result.code)) {
    repairedFrom = result.code;
    opts.emit({ type: 'stage', stage: 'repairing', detail: USER_MESSAGES[result.code] });
    const problem = `${result.detail} ${REPAIR_HINT[result.code] ?? ''}`.trim();
    ({ result } = await attempt(repairMessages(opts.messages, first.output, problem), opts));
  }

  if (result.ok === 'unplannable') {
    opts.emit({ type: 'unplannable', reason: result.reason });
    return;
  }
  if (result.ok === false) throw appError(result.code, result.detail);

  opts.emit({
    type: 'result',
    itinerary: result.itinerary,
    warnings: result.warnings,
    meta: { model: opts.provider.model, attempts: repairedFrom ? 2 : 1, durationMs: Date.now() - started, repairedFrom },
  });
}
