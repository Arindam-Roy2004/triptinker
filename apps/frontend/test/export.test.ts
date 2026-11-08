import { describe, expect, it } from 'vitest';
import { sample } from '@triptinker/contracts/testing';
import { fileSlug, tripAsPrintableHtml, tripAsText } from '@/features/planner/export';
import { appendSpoken } from '@/features/planner/use-voice-input';
import { encodeWav } from '@/lib/wav';

describe('trip export', () => {
  it('writes every day and stop as readable text with map links', () => {
    const itinerary = sample();
    const text = tripAsText(itinerary);
    expect(text).toContain(itinerary.title);
    itinerary.days.forEach((day, i) => expect(text).toContain(`DAY ${i + 1} · ${day.title}`));
    for (const stop of itinerary.days.flatMap((d) => d.stops)) expect(text).toContain(stop.title);
    expect(text).toContain('https://www.google.com/maps/search/');
    expect(text).not.toContain('"id"'); // not JSON
  });

  it('escapes model text in the printable page', () => {
    const itinerary = sample();
    itinerary.title = 'Trip <script>alert(1)</script>';
    itinerary.days[0].stops[0].title = 'Café "A" & <b>';
    const html = tripAsPrintableHtml(itinerary);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('Trip &lt;script&gt;');
    expect(html).toContain('Café &quot;A&quot; &amp; &lt;b&gt;');
  });

  it('names files after the destination', () => {
    expect(fileSlug({ ...sample(), destination: 'Kyoto, Japan' })).toBe('kyoto');
    expect(fileSlug({ ...sample(), destination: '!!!' })).toBe('trip');
  });
});

describe('voice input helpers', () => {
  it('appends dictated text after what is typed, within the limit', () => {
    expect(appendSpoken('', 'Three days in Rome', 100)).toBe('Three days in Rome');
    expect(appendSpoken('Food trip.  ', 'Add a cooking class', 100)).toBe('Food trip. Add a cooking class');
    expect(appendSpoken('abc', 'defgh', 6)).toBe('abc de');
  });

  it('encodes 16-bit mono PCM WAV', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const view = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(view.buffer, o, 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
    expect(blob.type).toBe('audio/wav');
  });
});
