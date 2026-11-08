import { describe, expect, it } from 'vitest';
import { sanitizeUserText, textLength } from '../src';

describe('sanitizeUserText', () => {
  it('trims and collapses blank runs but keeps paragraph breaks', () => {
    expect(sanitizeUserText('  3 days \t in   Lisbon \r\n\r\n\r\n\r\nslow   evenings  ')).toBe('3 days in Lisbon\n\nslow evenings');
  });

  it('removes zero-width characters used to hide text', () => {
    expect(sanitizeUserText('Ky\u200Boto\u200D\uFEFF trip\u2060')).toBe('Kyoto trip');
  });

  it('removes bidi overrides and isolates', () => {
    expect(sanitizeUserText('Rome \u202Eedisrever\u202C and \u2066Paris\u2069')).toBe('Rome edisrever and Paris');
  });

  it('removes control characters but keeps newlines and turns tabs into spaces', () => {
    expect(sanitizeUserText('a\u0000b\u0007c\u007F\u0085d\te\nf')).toBe('abcd e\nf');
  });

  it('applies NFKC so full-width and compatibility forms become plain text', () => {
    expect(sanitizeUserText('Ｔｏｋｙｏ\u00A0ｔｒｉｐ')).toBe('Tokyo trip');
  });

  it('returns an empty string for anything that is not a string', () => {
    expect(sanitizeUserText(undefined)).toBe('');
    expect(sanitizeUserText(42)).toBe('');
    expect(sanitizeUserText({ toString: () => 'x' })).toBe('');
  });

  it('is idempotent', () => {
    const once = sanitizeUserText(' Ｌｉｓｂｏｎ\u200B \n\n\n\n tram  28 ');
    expect(sanitizeUserText(once)).toBe(once);
  });
});

describe('textLength', () => {
  it('counts code points, so an emoji counts once', () => {
    expect(textLength('Lisbon 🚋')).toBe(8);
    expect('Lisbon 🚋'.length).toBe(9);
  });
});
