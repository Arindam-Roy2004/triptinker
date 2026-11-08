import type { GenerateItineraryInput } from '@triptinker/contracts';

// Search needs keywords, while the planner still needs the complete, original brief.
// Keep connecting words and negations: they can distinguish routes and constraints.
const FILLER = new Set(
  'hey hi hello please thanks thank you i im ill ive we were weve our my me us a an the this that these those it its which so just really very want wants wanted would could can should like planning plan planned trip travel making make have has do accordingly up or'.split(' '),
);
const MAX_QUERY_LENGTH = 380; // Tavily requires queries shorter than 400 characters.

/** No extra model request, latency or token cost. This is keyword cleanup, not a summary. */
export function searchQuery(request: GenerateItineraryInput): string {
  const words = request.brief
    .normalize('NFC')
    .replace(/[’']/g, '')
    .match(/[\p{L}\p{M}\p{N}]+(?:[-./][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
  const keywords = words.filter((word) => !FILLER.has(word.toLowerCase()));
  const suffix = `${request.days ? `${request.days} days ` : ''}travel itinerary`;
  const budget = MAX_QUERY_LENGTH - suffix.length - 1;
  let selected = keywords.length ? keywords : words;

  if (selected.join(' ').length > budget) {
    // Keep whole words from both ends instead of silently dropping every late detail.
    // The full brief remains in generationMessages, even when search cannot fit it all.
    const head: string[] = [];
    const tail: string[] = [];
    let headLength = 0;
    let tailLength = 0;
    for (const word of selected) {
      if (headLength + word.length + 1 > budget / 2) break;
      head.push(word);
      headLength += word.length + 1;
    }
    for (const word of [...selected].reverse()) {
      if (tailLength + word.length + 1 > budget - headLength) break;
      tail.unshift(word);
      tailLength += word.length + 1;
    }
    selected = [...head, ...tail];
  }
  return [...selected, suffix].join(' ');
}
