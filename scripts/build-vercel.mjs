// Builds TripTinker in Vercel's Build Output API v3 format (.vercel/output), so a deploy
// uploads only built files: the static frontend and one bundled API function. No source
// and no .env ever leave this machine; secrets live in Vercel's environment variables.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '.vercel/output');
const fn = path.join(out, 'functions/api.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

// 1. Frontend → static files served from Vercel's CDN.
execSync('npm run build --silent -w @triptinker/frontend', { cwd: root, stdio: 'inherit' });
cpSync(path.join(root, 'apps/frontend/dist'), path.join(out, 'static'), { recursive: true });

// 2. Backend (Express + contracts) → one ESM file. CommonJS dependencies inside the bundle
//    still call require(), so give the module a real one.
await build({
  entryPoints: [path.join(root, 'apps/backend/src/vercel.ts')],
  outfile: path.join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});
writeFileSync(
  path.join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 300 }, null, 2),
);

// 3. Routing: /api/* → the function; real files from the CDN; anything else → the app shell.
writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('Built .vercel/output (static + api function).');
