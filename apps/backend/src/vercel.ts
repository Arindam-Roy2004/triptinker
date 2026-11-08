import { createApp } from './app';
import { config, isConfigured } from './config';
import { createTavilySearch } from './search/tavily';

/**
 * Entry for Vercel: the same Express app as the local server, exported as a request handler
 * instead of listening on a port. The built frontend is served by Vercel's CDN, so this only
 * ever sees /api/* requests. Secrets come from Vercel's encrypted environment variables.
 */
const app = createApp({
  provider: config.provider,
  configured: isConfigured(),
  allowSimulation: config.allowSimulation,
  rateLimitPerMinute: config.rateLimitPerMinute,
  search: config.search.apiKey ? createTavilySearch({ apiKey: config.search.apiKey, timeoutMs: config.search.timeoutMs }) : null,
});

// Exactly one proxy (Vercel's edge) sits in front of the function and sets X-Forwarded-For to the
// visitor's address. Trusting that one hop, and no more, makes rate limits per visitor while a
// client can't spoof its way around them with its own X-Forwarded-For header.
app.set('trust proxy', 1);

export default app;
