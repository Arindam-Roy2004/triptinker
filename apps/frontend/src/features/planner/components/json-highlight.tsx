import type { ReactNode } from 'react';

/* ── Streaming highlighter ───────────────────────────────────────────────────
 * Colours possibly-incomplete JSON text as it arrives. It never parses: an
 * unterminated string at the end is simply coloured as a string.
 */
const TOKEN = /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;

export function highlightJson(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const [whole, str, colon, num, literal, punct] = m;
    if (str !== undefined) {
      out.push(
        <span key={i++} className={colon ? 'text-syn-key' : 'text-syn-string'}>
          {str}
        </span>,
      );
      if (colon) out.push(<span key={i++} className="text-syn-punct">{colon}</span>);
    } else if (num !== undefined) out.push(<span key={i++} className="text-syn-number">{num}</span>);
    else if (literal !== undefined) out.push(<span key={i++} className="text-syn-literal">{literal}</span>);
    else if (punct !== undefined) out.push(<span key={i++} className="text-syn-punct">{punct}</span>);
    else out.push(whole);
    last = start + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
