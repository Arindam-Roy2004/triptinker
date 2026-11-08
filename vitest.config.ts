import { defineConfig } from 'vitest/config';

/** One `npm test` runs every workspace's suite; each package owns its own config. */
export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
});
