import type { ProviderConfig } from './config';
import { appError } from './errors';
import type { ChatMessage } from './prompt';

/**
 * Minimal streaming client for any OpenAI-compatible Chat Completions API
 * (OpenRouter, OpenAI, Groq, Gemini's OpenAI endpoint, Ollama's /v1).
 * No SDK: the wire format is small and owning it keeps every failure visible.
 */

export type Chunk =
  | { type: 'text'; text: string }
  /** Upstream is alive (reasoning tokens, SSE comments) but has produced no content yet. */
  | { type: 'keepalive' }
  | { type: 'finish'; reason: string | null };

export interface Provider {
  readonly model: string;
  stream(messages: ChatMessage[], signal: AbortSignal): AsyncIterable<Chunk>;
}

type Fetch = typeof fetch;

function httpError(status: number, retryAfter: string | null) {
  if (status === 401 || status === 403) return appError('PROVIDER_AUTH', `HTTP ${status}`);
  if (status === 429) return appError('RATE_LIMITED', `HTTP 429, retry-after=${retryAfter ?? 'n/a'}`);
  if (status === 408 || status === 504) return appError('TIMEOUT', `HTTP ${status}`);
  if (status >= 500) return appError('PROVIDER_UNAVAILABLE', `HTTP ${status}`);
  return appError('PROVIDER_REJECTED', `HTTP ${status}`);
}

/** Split an SSE byte stream into `data:` payloads. Comment lines (": ping") become keepalives. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<string | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) yield line.slice(5).trimStart();
        else if (line.startsWith(':')) yield null;
      }
    }
    if (buffer.startsWith('data:')) yield buffer.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}

export function createOpenAiProvider(config: ProviderConfig, fetchImpl: Fetch = fetch): Provider {
  return {
    model: config.model,
    async *stream(messages, signal) {
      let response: Response;
      try {
        response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
            // OpenRouter attribution headers; ignored by other providers.
            'HTTP-Referer': 'https://github.com/roamfar-trip-planner',
            'X-Title': 'Roamfar',
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            stream: true,
            temperature: 0.4,
            max_tokens: config.maxOutputTokens,
            ...(config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw appError('NETWORK', error instanceof Error ? error.message : String(error));
      }

      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {});
        throw httpError(response.status, response.headers.get('retry-after'));
      }

      for await (const data of readSse(response.body)) {
        if (data === null) {
          yield { type: 'keepalive' };
          continue;
        }
        if (data === '[DONE]') return;
        let payload: {
          error?: { message?: string; code?: number | string };
          choices?: { delta?: { content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
        };
        try {
          payload = JSON.parse(data);
        } catch {
          continue; // a corrupt frame is not fatal; the final output is validated anyway
        }
        if (payload.error) {
          const status = Number(payload.error.code);
          throw Number.isFinite(status) ? httpError(status, null) : appError('PROVIDER_UNAVAILABLE', payload.error.message);
        }
        const choice = payload.choices?.[0];
        if (!choice) continue;
        const text = choice.delta?.content;
        if (text) yield { type: 'text', text };
        else if (choice.delta?.reasoning) yield { type: 'keepalive' };
        if (choice.finish_reason) yield { type: 'finish', reason: choice.finish_reason };
      }
    },
  };
}
