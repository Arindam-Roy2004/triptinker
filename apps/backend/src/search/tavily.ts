import { z } from 'zod';
import { LIMITS, MAX_SOURCES, sanitizeUserText, webSourceSchema, type WebSource } from '@triptinker/contracts';
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
    // Validate hits separately so one malformed result does not discard valid neighbours.
    results: z.array(z.unknown()).max(100).catch([]),
  })
  .catch({ results: [] });
const hitSchema = z.object({
  title: z.string().min(1).max(4000),
  url: z.string().min(1).max(LIMITS.sourceUrlMax),
  // A missing or null snippet or score is tolerated, as before; a wrong type or range is not.
  content: z.string().max(20_000).nullish().transform((value) => value ?? ''),
  // Relevance is a fractional score, not a count.
  score: z.number().min(0).max(1).nullish().transform((value) => value ?? 1),
});
const resultLimitSchema = z.number().int().min(1).max(MAX_SOURCES);

/** Plain text only: no tags, no control characters, no runs of whitespace, bounded length. */
export function cleanSnippet(text: string, max = SNIPPET_MAX) {
  const plain = sanitizeUserText(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    // eslint-disable-next-line no-control-regex -- removing control characters is the point
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...plain];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : plain;
}

/** Keep https results with a usable title, one per site, best first (Tavily orders by relevance). */
export function toWebResults(raw: unknown, max: number = MAX_SOURCES): WebResult[] {
  const limit = resultLimitSchema.parse(max);
  const seen = new Set<string>();
  const out: WebResult[] = [];
  for (const candidate of responseSchema.parse(raw).results) {
    const parsed = hitSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const hit = parsed.data;
    if (hit.score < MIN_SCORE) continue;
    let url: URL;
    try {
      url = new URL(hit.url);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const domain = url.hostname.replace(/^www\./, '');
    const title = cleanSnippet(hit.title, LIMITS.sourceTitleMax);
    if (!title || seen.has(domain)) continue;
    const source = webSourceSchema.safeParse({ title, url: url.href, domain });
    if (!source.success) continue;
    seen.add(domain);
    out.push({ ...source.data, content: cleanSnippet(hit.content) });
    if (out.length === limit) break;
  }
  return out;
}

export function createTavilySearch({ apiKey, timeoutMs = 6_000, maxResults = MAX_SOURCES, fetchImpl = fetch }: TavilyOptions): Search {
  const limit = resultLimitSchema.parse(maxResults);
  return async (query, signal) => {
    const response = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: limit + 2, // a few spare, since duplicates and non-https links are dropped
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        include_domains: TRAVEL_DOMAINS,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    if (!response.ok) throw new Error(`Tavily responded with ${response.status}`);
    return toWebResults(await response.json(), limit);
  };
}
