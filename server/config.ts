import 'dotenv/config';

/** All server configuration in one place. Secrets never leave this process. */

function int(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const production = process.env.NODE_ENV === 'production';

export type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  jsonMode: boolean;
  /** Max wait for the first token of content. */
  firstTokenTimeoutMs: number;
  /** Max silence between streamed chunks once output has started. */
  idleTimeoutMs: number;
  /** Hard ceiling for one attempt. */
  totalTimeoutMs: number;
  maxOutputTokens: number;
};

export const config = {
  production,
  port: int('PORT', 4317),
  /** Generation requests allowed per IP per minute. */
  rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 20),
  /** The dev-only failure lab. Never enabled in production unless explicitly asked for. */
  allowSimulation: process.env.ALLOW_SIMULATION ? process.env.ALLOW_SIMULATION === 'true' : !production,
  provider: {
    apiKey: (process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '').trim(),
    baseUrl: (process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL ?? 'minimax/minimax-m3.1-flash',
    jsonMode: process.env.LLM_JSON_MODE !== 'off',
    firstTokenTimeoutMs: int('LLM_FIRST_TOKEN_TIMEOUT_MS', 30_000),
    idleTimeoutMs: int('LLM_IDLE_TIMEOUT_MS', 20_000),
    totalTimeoutMs: int('LLM_TOTAL_TIMEOUT_MS', 90_000),
    maxOutputTokens: int('LLM_MAX_OUTPUT_TOKENS', 6_000),
  } satisfies ProviderConfig,
};

export const isConfigured = () => config.provider.apiKey.length > 0 || config.provider.baseUrl.includes('localhost');
