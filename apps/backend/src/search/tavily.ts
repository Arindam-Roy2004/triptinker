import { z } from 'zod';
import { MAX_SOURCES, type WebSource } from '@triptinker/contracts';
export { searchQuery } from './query';

/** One search hit: the link shown to the traveller, plus a snippet that only the model sees. */
export type WebResult = WebSource & { content: string };
export type Search = (query: string, signal: AbortSignal) => Promise<WebResult[]>;

export type TavilyOptions = {
  apiKey: string;
  timeoutMs?: number;
  maxResults?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
};

const SNIPPET_MAX = 600;
/** Below this Tavily relevance score a hit is more likely noise than a guide to the trip. */
const MIN_SCORE = 0.3;

/**
 * Travel publishers and references the search is limited to. An open web search on a chatty brief
 * ("a relaxed family weekend…") returns dictionary pages; these return itineraries and guides.
 */
export const TRAVEL_DOMAINS = [
  'wikivoyage.org',
  'wikipedia.org',
  'lonelyplanet.com',
  'timeout.com',
  'cntraveler.com',
  'atlasobscura.com',
  'theculturetrip.com',
  'travelandleisure.com',
  'fodors.com',
  'roughguides.com',
  'afar.com',
  'nationalgeographic.com',
  'eater.com',
  'nytimes.com',
  'tripadvisor.com',
];

// Tavily's response is untrusted input like any other: validate the parts we use, ignore the rest.
const responseSchema = z
  .object({
    results: z.array(z.object({ title: z.string().catch(''), url: z.string().catch(''), content: z.string().catch(''), score: z.number().catch(1) })).catch([]),
  })
  .catch({ results: [] });

/** Plain text only: no tags, no control characters, no runs of whitespace, bounded length. */
export function cleanSnippet(text: string, max = SNIPPET_MAX) {
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    // eslint-disable-next-line no-control-regex -- removing control characters is the point
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** Keep https results with a usable title, one per site, best first (Tavily orders by relevance). */
export function toWebResults(raw: unknown, max = MAX_SOURCES): WebResult[] {
  const seen = new Set<string>();
  const out: WebResult[] = [];
  for (const hit of responseSchema.parse(raw).results) {
    if (hit.score < MIN_SCORE) continue;
    let url: URL;
    try {
      url = new URL(hit.url);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const domain = url.hostname.replace(/^www\./, '');
    const title = cleanSnippet(hit.title, 200);
    if (!title || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ title, url: url.href, domain, content: cleanSnippet(hit.content) });
    if (out.length === max) break;
  }
  return out;
}

export function createTavilySearch({ apiKey, timeoutMs = 6_000, maxResults = MAX_SOURCES, fetchImpl = fetch }: TavilyOptions): Search {
  return async (query, signal) => {
    const response = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: maxResults + 2, // a few spare, since duplicates and non-https links are dropped
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        include_domains: TRAVEL_DOMAINS,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    if (!response.ok) throw new Error(`Tavily responded with ${response.status}`);
    return toWebResults(await response.json(), maxResults);
  };
}
