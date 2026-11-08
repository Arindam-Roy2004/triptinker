import { describe, expect, it } from 'vitest';
import { GenerateItineraryDto } from '@triptinker/contracts';
import { generationMessages } from '../src/prompt';
import { searchQuery } from '../src/search/query';

const brief = "Hey I'm planning a trip home I'm making a special trip which I have to do at dzuko Valley in Nagaland during their hornbill festival so please plan a trip or up accordingly for five days I'll travel from the delhi by air?";
const request = { brief, days: null, pace: 'balanced' as const };

describe('searchQuery', () => {
  it('accepts a conversational five-day request and cleans only the search query', () => {
    expect(GenerateItineraryDto.validate(request).errors).toBeFalsy();
    const query = searchQuery(request);
    expect(query.length).toBeLessThan(brief.length);
    for (const detail of ['dzuko Valley', 'Nagaland', 'hornbill festival', 'five days', 'from', 'delhi', 'by air']) expect(query).toContain(detail);
    expect(query).not.toMatch(/\b(please|planning|accordingly)\b/i);
    expect(generationMessages(request)[1].content).toContain(brief);
  });

  it('includes the selected duration when it is not in the brief', () => {
    expect(searchQuery({ ...request, brief: 'Kyoto temples', days: 5 })).toBe('Kyoto temples 5 days travel itinerary');
  });

  it('reads beyond the old 300-character cutoff before cleaning filler', () => {
    const query = searchQuery({ ...request, brief: `${'Please plan a trip. '.repeat(25)}Dzukou Valley Nagaland Hornbill festival from Delhi by air` });
    expect(query).toContain('Dzukou Valley Nagaland Hornbill festival from Delhi by air');
    expect(query.length).toBeLessThan(400);
  });

  it('keeps Unicode names, route words, dates and negative constraints', () => {
    const query = searchQuery({ ...request, brief: 'From São Paulo to 東京 on 2026-12-01 without flights, not hiking' });
    expect(query).toContain('From São Paulo to 東京 on 2026-12-01 without flights not hiking');
  });

  it('bounds keyword-heavy briefs at whole words and retains late route details', () => {
    const query = searchQuery({ ...request, brief: `Nagaland ${'museums restaurants culture sightseeing '.repeat(25)}from Delhi by air`, days: 5 });
    expect(query.length).toBeLessThan(400);
    expect(query).toMatch(/^Nagaland /);
    expect(query).toMatch(/from Delhi by air 5 days travel itinerary$/);
  });
});
