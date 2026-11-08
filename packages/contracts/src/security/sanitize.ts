/**
 * The one sanitiser for free text a person types (trip brief, refine instruction).
 *
 * It lives in contracts so the browser's character counter and the server's limits always
 * agree. The server re-applies it to every request and never trusts the browser's copy.
 * It cleans; it never rejects. Length rules live in the DTOs.
 */

// C0 controls except \t and \n, DEL, and C1 controls.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Zero-width and invisible formatting characters: hidden from people, still read by models.
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u2060-\u2064\uFEFF]/g;
// Bidirectional overrides and isolates, which can reorder what a person sees.
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;

export function sanitizeUserText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFKC') // full-width and compatibility forms → plain characters
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(BIDI, '')
    .replace(/[^\S\n]+/g, ' ') // runs of spaces, tabs and other blanks → one space
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Length as a person counts it: in code points, so an emoji counts once. */
export const textLength = (text: string) => [...text].length;
