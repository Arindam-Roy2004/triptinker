import { describe, expect, it } from 'vitest';
import { findHighlights, type HighlightKind } from '../src/features/planner/highlight';
import type { PlaceIndex } from '../src/features/planner/use-place-index';
import placesText from '../public/data/places.txt?raw';

/** The real index the browser loads, parsed the same way. */
function realIndex(): PlaceIndex {
  const names = new Map<string, boolean>();
  for (const line of placesText.split('\n')) {
    if (line) names.set(line.replace(/^~/, ''), line.startsWith('~'));
  }
  return { names, maxWords: 6 };
}
const INDEX = realIndex();

const marked = (text: string, index: PlaceIndex | null = INDEX) => findHighlights(text, index).map((h) => [text.slice(h.start, h.end), h.kind] as [string, HighlightKind]);
const places = (text: string) => marked(text).filter(([, kind]) => kind === 'place').map(([word]) => word);

describe('findHighlights', () => {
  it('marks places and times of year, and nothing else', () => {
    expect(marked('Four days in Kyoto in mid-November with my kids, love temples and street food on a budget')).toEqual([
      ['Kyoto', 'place'],
      ['November', 'time'],
    ]);
  });

  it('finds places from the full index in any case, including ones the curated list lacks', () => {
    expect(places('a week in hyderabad then mysore and coorg, flying home from bengaluru')).toEqual(['hyderabad', 'mysore', 'bengaluru']);
    expect(places('Ending in são paulo or Sao Paulo, then Montevideo')).toEqual(['são paulo', 'Sao Paulo', 'Montevideo']);
    expect(places('three nights in Ljubljana, Lake Bled and the Julian Alps')).toEqual(['Ljubljana', 'Lake Bled', 'Alps']);
  });

  it('keeps everyday words plain unless they are capitalised mid-sentence', () => {
    expect(places('a nice hotel, roast turkey, fine china and a reading list')).toEqual([]);
    expect(places('Nice weather would be great, maybe Split or Nice in June')).toEqual(['Split', 'Nice']);
  });

  it('infers unknown capitalised places only from context', () => {
    expect(places('a day trip to Hampi')).toEqual(['Hampi']);
    expect(places('travelling with Sarah and Tom')).toEqual([]);
    expect(places('Visiting Porto. Then Madrid')).toEqual(['Porto', 'Madrid']);
  });

  it('reads every month in any case, and may and march unless the sentence uses them as verbs', () => {
    const times = (text: string) => marked(text).filter(([, kind]) => kind === 'time').map(([word]) => word);
    expect(times('trip in january, june, july or december; oct, sept. or nov')).toEqual(['january', 'june', 'july', 'december', 'oct', 'sept.', 'nov']);
    expect(times('may')).toEqual(['may']);
    expect(times('march in paris')).toEqual(['march']);
    expect(times('go in may or march, maybe mid-may or 12th march')).toEqual(['may', 'march', 'may', 'march']);
    expect(times('from april to may')).toEqual(['april', 'may']);
    expect(times('In Late May or early Sept.')).toEqual(['May', 'Sept.']);
    expect(times('you may want to march on, it may rain and we may march a lot')).toEqual([]);
  });

  it('reads seasons, but not springs or falls that are something else', () => {
    const times = (text: string) => marked(text).filter(([, kind]) => kind === 'time').map(([word]) => word);
    expect(times('summer or winter, maybe spring, in the fall, or autumn before the monsoon')).toEqual(['summer', 'winter', 'spring', 'fall', 'autumn', 'monsoon']);
    expect(times('Avoid the rainy season, ideally shoulder season or off-season')).toEqual(['rainy season', 'shoulder season', 'off-season']);
    expect(times('a soak in a hot spring, spring rolls, then fall asleep; kids may fall over')).toEqual([]);
  });

  it('leaves the rest of a brief alone', () => {
    expect(places('Relaxed pace, good coffee, vegetarian food, museums, art and history. Quiet mornings, no hiking, cheap hotels, great views and markets.')).toEqual([]);
  });

  it('works on the curated list alone before the index loads', () => {
    expect(marked('Four days in Lisbon with a day in sintra', null)).toEqual([
      ['Lisbon', 'place'],
      ['sintra', 'place'],
    ]);
  });

  it('never returns overlapping spans', () => {
    const spans = findHighlights('Solo trip to Tokyo and Osaka in April, then Seoul and Busan in May, Mount Fuji at sunrise', INDEX);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    expect(spans.length).toBeGreaterThanOrEqual(7);
  });
});
