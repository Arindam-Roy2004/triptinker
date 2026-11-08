import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApp } from './app';
import { config, isConfigured } from './config';
import { createTavilySearch } from './search/tavily';
import { createTranscriber } from './stt';

// The frontend workspace: Vite serves it in development, its build is served in production.
const root = path.resolve(import.meta.dirname, '../../frontend');
const app = createApp({
  provider: config.provider,
  configured: isConfigured(),
  allowSimulation: config.allowSimulation,
  rateLimitPerMinute: config.rateLimitPerMinute,
  search: config.search.apiKey ? createTavilySearch({ apiKey: config.search.apiKey, timeoutMs: config.search.timeoutMs }) : null,
  transcribe: config.stt.enabled ? createTranscriber({ apiKey: config.provider.apiKey, baseUrl: config.provider.baseUrl, model: config.stt.model, timeoutMs: config.stt.timeoutMs }) : null,
});
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
const server = createHttpServer(app);

if (config.production) {
  const dist = path.join(root, 'dist');
  // Hashed build assets never change under the same name, so browsers keep them for a year. The
  // HTML is always revalidated, so after a deploy nobody is left asking for chunks that are gone.
  app.use('/assets', express.static(path.join(dist, 'assets'), { index: false, immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
} else {
  // One process, one port: Vite runs as middleware and its HMR socket shares our HTTP server.
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

server.listen(config.port, () => {
  const model = isConfigured() ? `model ${config.provider.model}` : 'no model configured (sample + failure lab only)';
  const search = config.search.apiKey ? 'web search on' : 'web search off';
  console.log(`\n  TripTinker → http://localhost:${config.port}  ·  ${model}  ·  ${search}\n`);
});
// On `docker stop` / a redeploy: stop taking new connections, let in-flight plans finish briefly,
// then exit. Streams still open after the grace period are cut rather than holding the stop up.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`  ${signal}: shutting down`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`\n  Port ${config.port} is in use. Set PORT=<free port> in .env or the shell.\n`);
  else console.error(error);
  process.exit(1);
});
