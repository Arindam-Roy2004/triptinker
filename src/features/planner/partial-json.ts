/**
 * Best-effort parse of JSON that is still being written, for the live preview only.
 * The result is never trusted: the real result is validated on the server and again in the
 * browser before anything is rendered as a trip.
 *
 * Strategy: walk the text once, tracking strings and open brackets. Close what is open and
 * try to parse; if the tail is mid-token (a dangling key, a half number), back up to the
 * last point where a value had just finished and try again.
 */
export function parsePartialJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return null;
  const s = text.slice(start);

  const stack: string[] = [];
  // Places where the text can be cut and still be closed cleanly: just before a comma, or just after an opener.
  const cuts: { at: number; open: string }[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') {
      stack.push(ch);
      cuts.push({ at: i + 1, open: stack.join('') });
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) return tryParse(s.slice(0, i + 1)); // the document is complete
    } else if (ch === ',') cuts.push({ at: i, open: stack.join('') });
  }

  // First try: close the open string (dropping a trailing backslash) and every open bracket.
  let tail = s;
  if (inString) tail = (escaped ? tail.slice(0, -1) : tail) + '"';
  const first = tryParse(tail + close(stack.join('')));
  if (first !== undefined) return first;

  // Otherwise back up to the most recent clean cut. A few attempts are always enough in practice.
  for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 8; k--, tries++) {
    const parsed = tryParse(s.slice(0, cuts[k].at) + close(cuts[k].open));
    if (parsed !== undefined) return parsed;
  }
  return null;
}

function close(open: string) {
  let out = '';
  for (let i = open.length - 1; i >= 0; i--) out += open[i] === '{' ? '}' : ']';
  return out;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export type LiveStop = { time: string | null; title: string };
export type LiveDay = { title: string; stops: LiveStop[] };
export type LivePlan = { title: string | null; destination: string | null; days: LiveDay[] };

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** What the model has written so far, reduced to what the loader shows: titles, days and stops. */
export function livePlan(raw: string): LivePlan | null {
  const root = record(parsePartialJson(raw));
  const it = record(root.itinerary ?? root);
  const days = list(it.days).map((d) => {
    const day = record(d);
    return {
      title: text(day.title) ?? '',
      stops: list(day.stops).flatMap((s) => {
        const stop = record(s);
        const title = text(stop.title);
        return title ? [{ time: text(stop.time), title }] : [];
      }),
    };
  });
  const plan = { title: text(it.title), destination: text(it.destination), days };
  return plan.title || plan.destination || days.length ? plan : null;
}
