import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { GenerateItineraryDto, RefineItineraryDto, SIMULATIONS, type ErrorEnvelope, type FieldError, type Health, type Simulation, type StreamEvent } from '@triptinker/contracts';
import type { ProviderConfig } from './config';
import { AppError, appError, USER_MESSAGES } from './errors';
import { runGeneration, type Timeouts } from './pipeline';
import { generationMessages, refinementMessages, type ChatMessage } from './prompt';
import { createOpenAiProvider, type Provider } from './provider';
import { searchQuery, type Search, type WebResult } from './search/tavily';
import { SIMULATION_TIMEOUTS, createSimulatedProvider, simulatedSearch } from './simulate';

export type AppOptions = {
  provider: ProviderConfig;
  configured: boolean;
  allowSimulation: boolean;
  /** Injected in tests. */
  createProvider?: (config: ProviderConfig) => Provider;
  rateLimitPerMinute?: number;
  /** Web search used to ground new plans. Null when no search key is configured. */
  search?: Search | null;
};

const shortId = () => randomUUID().slice(0, 8);

function sendError(res: Response, status: number, error: AppError, issues?: FieldError[]) {
  const body: ErrorEnvelope = { error: { code: error.code, message: error.message, retryable: error.retryable, ...(issues && { issues }) } };
  res.status(status).json(body);
}

function invalidInput(res: Response, issues: FieldError[]) {
  sendError(res, 400, new AppError('INVALID_INPUT', issues[0]?.message ?? USER_MESSAGES.INVALID_INPUT, false), issues);
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.json({ limit: '96kb' }));

  app.get('/api/health', (_req, res) => {
    const body: Health = {
      configured: options.configured,
      model: options.configured ? options.provider.model : null,
      simulation: options.allowSimulation,
      search: !!options.search,
    };
    res.json(body);
  });

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: options.rateLimitPerMinute ?? 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, appError('RATE_LIMITED', 'local rate limit')),
  });

  /** Pick the real provider, or a simulated one when the dev failure lab asks for it. */
  function resolveProvider(req: Request): { provider: Provider; timeouts: Timeouts; search: Search | null } | AppError {
    const requested = req.get('x-simulate');
    if (requested && options.allowSimulation) {
      if (!(SIMULATIONS as readonly string[]).includes(requested)) return appError('INVALID_INPUT', `unknown simulation ${requested}`);
      return { provider: createSimulatedProvider(requested as Simulation), timeouts: SIMULATION_TIMEOUTS, search: simulatedSearch };
    }
    if (!options.configured) return appError('NOT_CONFIGURED');
    const create = options.createProvider ?? createOpenAiProvider;
    return { provider: create(options.provider), timeouts: options.provider, search: options.search ?? null };
  }

  /** Stream a generation as Server-Sent Events, cancelling upstream work if the client leaves. */
  type Plan = { messages: (research: WebResult[]) => ChatMessage[]; searchFor?: string; knownIds?: Set<string> };

  async function stream(req: Request, res: Response, plan: Plan) {
    const resolved = resolveProvider(req);
    if (resolved instanceof AppError) return sendError(res, resolved.code === 'NOT_CONFIGURED' ? 503 : 400, resolved);

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort(new Error('client disconnected'));
    });

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const emit = (event: StreamEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': keepalive\n\n'), 10_000);
    const requestId = shortId();

    try {
      // Ground a new plan in a quick web search. It is best-effort: if it fails or times out,
      // the plan is written from the model's own knowledge and the stream says so (no sources).
      let research: WebResult[] = [];
      if (plan.searchFor && resolved.search) {
        emit({ type: 'stage', stage: 'searching' });
        try {
          research = await resolved.search(plan.searchFor, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return;
          console.warn(`[${requestId}] search skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        emit({ type: 'sources', sources: research.map(({ title, url, domain }) => ({ title, url, domain })) });
      }
      const { provider, timeouts } = resolved;
      await runGeneration({ provider, timeouts, messages: plan.messages(research), knownIds: plan.knownIds, signal: controller.signal, emit, newId: shortId });
    } catch (error) {
      if (controller.signal.aborted) return; // client is gone; no one to tell
      const failure = error instanceof AppError ? error : appError('INTERNAL');
      // Log the internal detail server-side only; the client gets the safe message.
      console.warn(`[${requestId}] ${failure.code}: ${failure.detail ?? failure.message}`);
      emit({ type: 'error', code: failure.code, message: failure.message, retryable: failure.retryable });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  app.post('/api/itinerary', limiter, async (req, res) => {
    const { errors, value } = GenerateItineraryDto.validate(req.body);
    if (errors) return invalidInput(res, errors);
    await stream(req, res, { messages: (research) => generationMessages(value, research), searchFor: searchQuery(value) });
  });

  app.post('/api/itinerary/refine', limiter, async (req, res) => {
    const { errors, value } = RefineItineraryDto.validate(req.body);
    if (errors) return invalidInput(res, errors);
    const { itinerary, instruction } = value;
    const knownIds = new Set(itinerary.days.flatMap((day) => day.stops.map((stop) => stop.id)));
    await stream(req, res, { messages: () => refinementMessages(itinerary, instruction), knownIds });
  });

  app.use('/api', (_req, res) => sendError(res, 404, new AppError('INVALID_INPUT', 'Not found', false)));

  // Malformed JSON bodies and other unexpected errors: never leak a stack trace.
  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
    if (status >= 500) console.error(error);
    sendError(res, status >= 400 && status < 500 ? status : 500, appError(status < 500 ? 'INVALID_INPUT' : 'INTERNAL'));
  });

  return app;
}
