import path from 'node:path';
import dotenv from 'dotenv';

// npm workspaces run this package with apps/backend as the working directory, so load the
// repo-root .env explicitly (an apps/backend/.env, if present, overrides it). Real environment
// variables always win over both files.
const repoRoot = path.resolve(import.meta.dirname, '../../..');
dotenv.config({ path: [path.join(import.meta.dirname, '../.env'), path.join(repoRoot, '.env')], quiet: true });

/** All server configuration in one place. Secrets never leave this process. */

function int(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const production = process.env.NODE_ENV === 'production';
const reasoningEffort = process.env.LLM_REASONING_EFFORT?.trim() ?? 'none';

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
  /**
   * OpenRouter's unified `reasoning.effort`, sent only when set. Reasoning models think before they
   * answer, and that thinking counts against `maxOutputTokens`: high effort makes plans slow and can
   * cut the JSON short. Unset leaves the model's default.
   */
  reasoningEffort?: string | null;
};

export const config = {
  production,
  port: int('PORT', 4317),
  /** Generation requests allowed per IP per minute. */
  rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 20),
  /**
   * Reverse proxies in front of the server (nginx on a VPS: 1). Trusting exactly that many hops makes
   * rate limits per visitor instead of per proxy, without letting clients spoof X-Forwarded-For.
   * 0 (the default) trusts none, for running directly on a port.
   */
  trustProxy: Math.max(0, Number.parseInt(process.env.TRUST_PROXY ?? '0', 10) || 0),
  /** The dev-only failure lab. Never enabled in production unless explicitly asked for. */
  allowSimulation: process.env.ALLOW_SIMULATION ? process.env.ALLOW_SIMULATION === 'true' : !production,
  provider: {
    apiKey: (process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '').trim(),
    baseUrl: (process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL ?? 'qwen/qwen3.8-flash',
    jsonMode: process.env.LLM_JSON_MODE !== 'off',
    firstTokenTimeoutMs: int('LLM_FIRST_TOKEN_TIMEOUT_MS', 30_000),
    idleTimeoutMs: int('LLM_IDLE_TIMEOUT_MS', 20_000),
    totalTimeoutMs: int('LLM_TOTAL_TIMEOUT_MS', 120_000),
    maxOutputTokens: int('LLM_MAX_OUTPUT_TOKENS', 6_000),
    reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort) ? reasoningEffort : null,
  } satisfies ProviderConfig,
  /** Voice input: a cheap audio-capable model on the same provider and key as planning. */
  stt: {
    model: (process.env.STT_MODEL ?? 'google/gemini-2.5-flash-lite').trim(),
    timeoutMs: int('STT_TIMEOUT_MS', 20_000),
    enabled: process.env.STT_ENABLED !== 'false',
  },
  /** Optional: ground new plans in a Tavily web search. Off when no key is set. */
  search: {
    apiKey: (process.env.TAVILY_API_KEY ?? '').trim(),
    timeoutMs: int('SEARCH_TIMEOUT_MS', 6_000),
  },
};

export const isConfigured = () => config.provider.apiKey.length > 0 || config.provider.baseUrl.includes('localhost');
