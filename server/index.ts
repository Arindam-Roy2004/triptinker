import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApp } from './app';
import { config, isConfigured } from './config';

const root = path.resolve(import.meta.dirname, '..');
const app = createApp({
  provider: config.provider,
  configured: isConfigured(),
  allowSimulation: config.allowSimulation,
  rateLimitPerMinute: config.rateLimitPerMinute,
});
const server = createHttpServer(app);

if (config.production) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // One process, one port: Vite runs as middleware and its HMR socket shares our HTTP server.
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

server.listen(config.port, () => {
  const model = isConfigured() ? `model ${config.provider.model}` : 'no model configured (sample + failure lab only)';
  console.log(`\n  Roamfar → http://localhost:${config.port}  ·  ${model}\n`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`\n  Port ${config.port} is in use. Set PORT=<free port> in .env or the shell.\n`);
  else console.error(error);
  process.exit(1);
});
