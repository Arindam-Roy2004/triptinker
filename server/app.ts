import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { SIMULATIONS, refineRequestSchema, tripRequestSchema, type Health, type Simulation, type StreamEvent } from '@shared/schema';
import type { ProviderConfig } from './config';
import { AppError, appError, USER_MESSAGES } from './errors';
import { runGeneration, type Timeouts } from './pipeline';
import { generationMessages, refinementMessages, type ChatMessage } from './prompt';
import { createOpenAiProvider, type Provider } from './provider';
import { SIMULATION_TIMEOUTS, createSimulatedProvider } from './simulate';

export type AppOptions = {
  provider: ProviderConfig;
  configured: boolean;
  allowSimulation: boolean;
  /** Injected in tests. */
  createProvider?: (config: ProviderConfig) => Provider;
  rateLimitPerMinute?: number;
};

const shortId = () => randomUUID().slice(0, 8);

function sendError(res: Response, status: number, error: AppError) {
  res.status(status).json({ error: { code: error.code, message: error.message, retryable: error.retryable } });
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
  function resolveProvider(req: Request): { provider: Provider; timeouts: Timeouts } | AppError {
    const requested = req.get('x-simulate');
    if (requested && options.allowSimulation) {
      if (!(SIMULATIONS as readonly string[]).includes(requested)) return appError('INVALID_INPUT', `unknown simulation ${requested}`);
      return { provider: createSimulatedProvider(requested as Simulation), timeouts: SIMULATION_TIMEOUTS };
    }
    if (!options.configured) return appError('NOT_CONFIGURED');
    const create = options.createProvider ?? createOpenAiProvider;
    return { provider: create(options.provider), timeouts: options.provider };
  }

  /** Stream a generation as Server-Sent Events, cancelling upstream work if the client leaves. */
  async function stream(req: Request, res: Response, messages: ChatMessage[], knownIds?: Set<string>) {
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
      await runGeneration({ ...resolved, messages, knownIds, signal: controller.signal, emit, newId: shortId });
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
    const parsed = tripRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, new AppError('INVALID_INPUT', parsed.error.issues[0]?.message ?? USER_MESSAGES.INVALID_INPUT, false));
    }
    await stream(req, res, generationMessages(parsed.data));
  });

  app.post('/api/itinerary/refine', limiter, async (req, res) => {
    const parsed = refineRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, new AppError('INVALID_INPUT', parsed.error.issues[0]?.message ?? USER_MESSAGES.INVALID_INPUT, false));
    }
    const { itinerary, instruction } = parsed.data;
    const knownIds = new Set(itinerary.days.flatMap((day) => day.stops.map((stop) => stop.id)));
    await stream(req, res, refinementMessages(itinerary, instruction), knownIds);
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
