import { SCENES } from '@/features/scenes/scenes';
import type { PlaceIndex } from './use-place-index';
import { PLACES } from './places';

/**
 * Finds the words in a trip brief worth lighting up as you type: places (cities, countries,
 * regions) and times of year (months, seasons), after Cursor's file chips and Wispr Flow's file tagging. Pure and instant,
 * no model call: a full place index when it has loaded (use-place-index.ts), a curated list until then,
 * and a few patterns. Offsets index into the text exactly as typed.
 */

export type HighlightKind = 'place' | 'time';
export type Highlight = { start: number; end: number; kind: HighlightKind };

const L = '\\p{L}\\p{M}\\p{N}';
const BEFORE = `(?<![${L}'’])`;
const AFTER = `(?![${L}])`;

// Ordinary words that are also place names: a place only with a capital ("Nice", not "a nice hotel").
const AMBIGUOUS = new Set(['nice', 'turkey', 'china', 'jordan', 'champagne', 'highlands', 'petra', 'rio', 'fuji', 'santiago', 'georgia', 'victoria', 'reading', 'bath', 'split', 'mobile', 'sale', 'date', 'best', 'union', 'florence', 'march', 'may']);
// Destinations people type in lowercase: always a place, even where the full index calls the name an everyday word.
const CURATED = new Set<string>([...PLACES, ...SCENES.flatMap((s) => s.match)].filter((name) => !AMBIGUOUS.has(name)));
const CURATED_WORDS = Math.max(...[...CURATED].map((name) => name.split(' ').length));

// Month names and short forms in any case ("october", "Oct", "sept.").
const MONTH_RE = new RegExp(`${BEFORE}(?:(?:january|february|april|june|july|august|september|october|november|december)|(?:jan|feb|apr|jun|jul|aug|sept?|oct|nov|dec)\\.?)${AFTER}`, 'giu');
// Seasons, and the travel seasons people plan around ("summer", "monsoon", "shoulder season", "off-season").
const SEASON_RE = new RegExp(`${BEFORE}(?:summer|winter|autumn|monsoon|(?:rainy|dry|wet|shoulder|high|low|peak|off|holiday|ski|festive|cherry\\s+blossom|blossom)[-\\s]season)${AFTER}`, 'giu');
// "Mar" with a capital ("mar" is an ordinary word).
const MAR_RE = new RegExp(`${BEFORE}Mar\\.?${AFTER}`, 'gu');
// Words that are a time of year unless the sentence uses them otherwise: "may" and "march" are also verbs,
// "spring" and "fall" too. Each is a month or season unless one of these says it isn't.
const TIME_WORD_RE = new RegExp(`${BEFORE}(?:may|march|spring|fall)${AFTER}`, 'giu');
const NOT_TIME: Record<string, { before?: RegExp; after?: RegExp }> = {
  // "you may", "it may rain", "may be", "may want"
  may: {
    before: /(?:^|[^\p{L}])(?:i|you|we|they|it|he|she|which|that|who|there|this|these|those|kids|plans|weather|prices|things|places|someone|anyone|one|what)\s+$/iu,
    after: /^\s+(?:be|have|not|also|need|want|get|take|rain|change|find|go|prefer|like|try|help|cost|vary|close|open|work|end|include|well|just|still|even|only|feel|seem|look|book|stay|visit|see|do|make|come|bring|use|cause|depend|enjoy|love|wish|require|differ)(?![\p{L}])/iu,
  },
  // "want to march", "we march on"
  march: {
    before: /(?:^|[^\p{L}])(?:to|will|would|can|could|may|might|must|should|shall|we|they|you|soldiers|bands|protesters)\s+$/iu,
    after: /^\s+(?:on|through|into|along|past|up|down|off|forward|ahead)(?![\p{L}])/iu,
  },
  // "hot spring", "spring water", "spring rolls", "a spring in my step"
  spring: {
    before: /(?:^|[^\p{L}])(?:hot|thermal|natural|mineral|a)\s+$/iu,
    after: /^\s+(?:water|rolls?|onions?|mattress)(?![\p{L}])/iu,
  },
  // "fall asleep", "fall in love", "don't fall", "the waterfall"
  fall: {
    before: /(?:^|[^\p{L}])(?:to|will|would|can|could|might|may|don['’]?t|not|we|they|you|i|it|kids|rain|leaves|prices|could)\s+$/iu,
    after: /^\s+(?:asleep|in\s+love|behind|apart|off|over|down|into|for|through|short|ill|sick|back)(?![\p{L}])/iu,
  },
};

function timeWords(text: string): Highlight[] {
  const out: Highlight[] = [];
  for (const m of matches(TIME_WORD_RE, text)) {
    const word = text.slice(m.start, m.end).toLowerCase();
    const not = NOT_TIME[word]!;
    if (not.before?.test(text.slice(Math.max(0, m.start - 30), m.start)) || not.after?.test(text.slice(m.end, m.end + 30))) continue;
    out.push({ ...m, kind: 'time' });
  }
  return out;
}

// Capitalised words that are never places on their own.
const NOT_PLACE = new Set(
  (
    'i im i’m i\'m ive i’ve i\'ve id i’d i\'d ill i’ll i\'ll we us my our me ok okay please thanks hi hey hello ' +
    'one two three four five six seven eight nine ten eleven twelve a an the and or but with for in on at to from of ' +
    'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec ' +
    'monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun weekend ' +
    'christmas easter new year diwali eid thanksgiving halloween ramadan hanukkah ' +
    'day days week weeks night nights trip plan airbnb uber early late mid next this last summer winter spring autumn fall'
  ).split(' '),
);
// An unknown capitalised name counts as a place after one of these ("trip to Hampi", not "with Sarah")…
const PLACE_CUE = /(?:^|[^\p{L}])(?:in|to|from|visit|visiting|visited|around|near|via|explore|exploring|towards?|through|across|outside|reach|head(?:ing)?\s+to|fly(?:ing)?\s+(?:to|into)|based\s+in|stay(?:ing)?\s+in)\s+$/iu;
// …or when it carries a geographic word of its own ("Lake Bled", "Cape Point").
const GEO_WORD = new Set('lake mount mt mountain mountains isle island islands bay cape coast valley national park gorge falls peninsula desert glacier river beach fjord canyon sea gulf hills forest delta lagoon reef'.split(' '));

type Word = { start: number; end: number; lower: string; capital: boolean };

function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’.-]*/gu)) {
    const raw = m[0].replace(/[.'’-]+$/u, ''); // "Porto." → "Porto"
    out.push({ start: m.index, end: m.index + raw.length, lower: raw.toLowerCase(), capital: /^\p{Lu}/u.test(raw) });
  }
  return out;
}

/** True when `index` begins a sentence: the start of the text, or after . ! ? or a line break. */
function sentenceStart(text: string, index: number) {
  for (let i = index - 1; i >= 0; i--) {
    const c = text[i]!;
    if (/\s/.test(c) && c !== '\n') continue;
    return c === '\n' || c === '.' || c === '!' || c === '?';
  }
  return true;
}

/** Known place names, longest first, from the curated list and (once loaded) the full index. */
function knownPlaces(text: string, ws: Word[], index: PlaceIndex | null): Highlight[] {
  const out: Highlight[] = [];
  const longest = Math.max(CURATED_WORDS, index?.maxWords ?? 1);
  for (let i = 0; i < ws.length; i++) {
    for (let n = Math.min(longest, ws.length - i); n >= 1; n--) {
      const span = ws.slice(i, i + n);
      // A name runs across spaces only, never across punctuation ("Paris, Rome" is two places).
      if (span.some((w, k) => k > 0 && !/^[ \t]+$/.test(text.slice(span[k - 1]!.end, w.start)))) continue;
      const name = span.map((w) => w.lower).join(' ');
      const curated = CURATED.has(name);
      const listed = index?.names.get(name);
      if (!curated && listed === undefined) continue;
      if (n === 1 && NOT_PLACE.has(name)) continue;
      // An everyday word is a place only when capitalised mid-sentence ("in Nice", not "Nice weather").
      const ambiguous = AMBIGUOUS.has(name) || (!curated && listed === true);
      if (ambiguous && (!span[0]!.capital || sentenceStart(text, span[0]!.start))) continue;
      out.push({ start: span[0]!.start, end: span.at(-1)!.end, kind: 'place' });
      i += n - 1;
      break;
    }
  }
  return out;
}

/** Capitalised names the index doesn't know, when the sentence says they're places. */
function inferredPlaces(text: string, ws: Word[]): Highlight[] {
  const out: Highlight[] = [];
  for (let i = 0; i < ws.length; i++) {
    if (!ws[i]!.capital || NOT_PLACE.has(ws[i]!.lower)) continue;
    let j = i;
    while (j + 1 < ws.length && ws[j + 1]!.capital && !NOT_PLACE.has(ws[j + 1]!.lower) && /^[ \t]+$/.test(text.slice(ws[j]!.end, ws[j + 1]!.start))) j++;
    const run = ws.slice(i, j + 1);
    const cued = PLACE_CUE.test(text.slice(Math.max(0, run[0]!.start - 24), run[0]!.start));
    if (cued || run.some((w) => GEO_WORD.has(w.lower))) out.push({ start: run[0]!.start, end: run.at(-1)!.end, kind: 'place' });
    i = j;
  }
  return out;
}

function* matches(re: RegExp, text: string) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) yield { start: m.index, end: m.index + m[0].length };
}

export function findHighlights(text: string, index: PlaceIndex | null = null): Highlight[] {
  if (!text.trim()) return [];
  const ws = words(text);
  const found: Highlight[] = [...knownPlaces(text, ws, index), ...inferredPlaces(text, ws)];
  for (const re of [MONTH_RE, SEASON_RE, MAR_RE]) for (const m of matches(re, text)) found.push({ ...m, kind: 'time' });
  found.push(...timeWords(text));

  // Longest span wins an overlap; on a tie, a place beats a time.
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || (a.kind === 'place' ? -1 : 1) || a.start - b.start);
  const kept: Highlight[] = [];
  for (const h of found) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}
