import { defineConfig, devices } from '@playwright/test';

const PORT = 4399;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // No key: the app runs against the simulated model only, so tests are deterministic and free.
  webServer: {
    // Test the production build: realistic, and much lighter than Vite's dev transforms under parallel browsers.
    command: 'npm run build --silent -w @triptinker/frontend -- --logLevel error && npm run start --silent -w @triptinker/backend',
    url: `http://localhost:${PORT}/api/health`,
    env: { NODE_ENV: 'production', PORT: String(PORT), LLM_API_KEY: '', ALLOW_SIMULATION: 'true', RATE_LIMIT_PER_MINUTE: '1000' },
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
