import { useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorCode, Simulation, Stage, WebSource } from '@triptinker/contracts';
import { streamPlan, type Outcome, type PlanRequest } from './api';

export type RunKind = 'generate' | 'refine';

export type GenerationState =
  | { status: 'idle' }
  | {
      status: 'running';
      kind: RunKind;
      stage: Stage;
      /** Set once the first attempt was rejected and the model is being asked to fix it. */
      repairReason: string | null;
      progress: { chars: number; days: number; stops: number };
      /** Unvalidated model output so far (capped), shown in the live JSON panel. */
      raw: string;
      /** What the web search found; null until a search has finished (or when there is none). */
      sources: WebSource[] | null;
      /** The actual query sent to web search, provided by the searching stage. */
      searchQuery: string | null;
      startedAt: number;
    }
  | { status: 'error'; kind: RunKind; code: ErrorCode; message: string; retryable: boolean }
  | { status: 'unplannable'; kind: RunKind; reason: string };

type Success = Extract<Outcome, { kind: 'result' }> & { sources: WebSource[] };

const RAW_LIMIT = 60_000;

/**
 * Owns the lifecycle of one AI request at a time.
 *
 * Stale responses: every run gets an increasing id. Starting a new run (or cancelling)
 * aborts the previous fetch *and* bumps the id, and every state update checks the id first.
 * Abort alone is not enough — a response can be fully parsed in the same tick the user
 * clicks again — so the id check is the real guarantee that an old answer never lands.
 */
export function useGeneration() {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    runId.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const start = useCallback(
    async (kind: RunKind, request: PlanRequest, onSuccess: (result: Success) => void, simulate?: Simulation | null) => {
      invalidate();
      const id = runId.current;
      const abort = new AbortController();
      controller.current = abort;
      const isCurrent = () => id === runId.current;

      setState({ status: 'running', kind, stage: 'connecting', repairReason: null, progress: { chars: 0, days: 0, stops: 0 }, raw: '', sources: null, searchQuery: null, startedAt: Date.now() });
      let sources: WebSource[] = [];

      const outcome = await streamPlan(request, {
        signal: abort.signal,
        simulate,
        onStage: (stage, detail) => {
          if (!isCurrent()) return;
          setState((prev) =>
            prev.status === 'running'
              ? {
                  ...prev,
                  stage,
                  searchQuery: stage === 'searching' ? (detail ?? null) : prev.searchQuery,
                  repairReason: stage === 'repairing' ? (detail ?? 'The first draft was unusable.') : prev.repairReason,
                  progress: stage === 'repairing' ? { chars: 0, days: 0, stops: 0 } : prev.progress,
                  raw: stage === 'repairing' ? '' : prev.raw,
                }
              : prev,
          );
        },
        onSources: (found) => {
          if (!isCurrent()) return;
          sources = found;
          setState((prev) => (prev.status === 'running' ? { ...prev, sources: found } : prev));
        },
        onDelta: (text) => {
          if (!isCurrent()) return;
          setState((prev) => (prev.status === 'running' && prev.raw.length < RAW_LIMIT ? { ...prev, raw: (prev.raw + text).slice(0, RAW_LIMIT) } : prev));
        },
        onProgress: (progress) => {
          if (!isCurrent()) return;
          setState((prev) => (prev.status === 'running' ? { ...prev, progress } : prev));
        },
      });

      if (!isCurrent()) return; // superseded or cancelled: drop it on the floor
      controller.current = null;

      switch (outcome.kind) {
        case 'result':
          setState({ status: 'idle' });
          onSuccess({ ...outcome, sources });
          break;
        case 'unplannable':
          setState({ status: 'unplannable', kind, reason: outcome.reason });
          break;
        case 'error':
          setState({ status: 'error', kind, code: outcome.code, message: outcome.message, retryable: outcome.retryable });
          break;
        case 'aborted':
          setState({ status: 'idle' });
          break;
      }
    },
    [invalidate],
  );

  /** Cancel any in-flight run and forget its result. */
  const cancel = useCallback(() => {
    invalidate();
    setState({ status: 'idle' });
  }, [invalidate]);

  const dismiss = useCallback(() => setState((prev) => (prev.status === 'running' ? prev : { status: 'idle' })), []);

  useEffect(() => () => controller.current?.abort(), []);

  return { state, start, cancel, dismiss };
}
