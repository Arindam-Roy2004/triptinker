import { CATEGORIES, LIMITS, itinerarySchema, stripUnsafeText, type Category, type Day, type ErrorCode, type Itinerary, type Stop } from '@triptinker/contracts';

/**
 * Turns raw model text into a validated Itinerary — or a precise reason it can't.
 *
 * Policy:
 *  - Envelope and top-level structure are strict: no days → reject.
 *  - Individual stops/days are salvaged: a bad stop is dropped with a warning rather than
 *    failing the whole plan. If too much is dropped, the response is rejected so the
 *    caller can ask the model to repair it.
 *  - Small, unambiguous fixes (time "9:30 pm" → "21:30", unknown category → "other",
 *    numeric strings → numbers) are applied silently; they never change meaning.
 */

export type Failure = { ok: false; code: ErrorCode; detail: string };
export type Normalized =
  | { ok: true; itinerary: Itinerary; warnings: string[] }
  | { ok: 'unplannable'; reason: string }
  | Failure;

const fail = (code: ErrorCode, detail: string): Failure => ({ ok: false, code, detail });

/* ── Step 1: text → JSON ──────────────────────────────────────────────────── */

export function extractJson(raw: string): { ok: true; value: unknown } | Failure {
  const text = raw.trim();
  if (!text) return fail('EMPTY_OUTPUT', 'The model returned an empty response.');

  // Models sometimes wrap JSON in a ```json fence or add a sentence before it.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return fail('MALFORMED_JSON', 'The response did not contain a JSON object.');

  try {
    return { ok: true, value: JSON.parse(body.slice(start, end + 1)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'parse error';
    return fail('MALFORMED_JSON', `The response was not valid JSON (${message.slice(0, 120)}).`);
  }
}

/* ── Step 2: JSON → Itinerary ─────────────────────────────────────────────── */

type Options = {
  newId: () => string;
  /** Ids already present in the plan being refined; a model `ref` is only honoured if it matches one. */
  knownIds?: ReadonlySet<string>;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // Drop only what the schema rejects: joiners in emoji and Persian or Indic words must survive.
  const s = stripUnsafeText(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : s;
}

export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(v);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase().replace(/\./g, '');
  if (!m[2] && !meridiem) return null; // a bare "9" is too ambiguous to place
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function duration(v: unknown): number | null {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(LIMITS.durationMax, Math.max(LIMITS.durationMin, Math.round(n)));
}

const CATEGORY_ALIASES: Record<string, Category> = {
  sightseeing: 'sight', landmark: 'sight', museum: 'sight', culture: 'sight', temple: 'sight',
  restaurant: 'food', cafe: 'food', meal: 'food', dining: 'food', drinks: 'nightlife', bar: 'nightlife',
  hike: 'nature', park: 'nature', outdoors: 'nature', beach: 'nature',
  shop: 'shopping', market: 'shopping', travel: 'transit', transport: 'transit',
  hotel: 'stay', accommodation: 'stay', lodging: 'stay', experience: 'activity', tour: 'activity',
};

function category(v: unknown): Category {
  if (typeof v !== 'string') return 'other';
  const key = v.trim().toLowerCase();
  if ((CATEGORIES as readonly string[]).includes(key)) return key as Category;
  return CATEGORY_ALIASES[key] ?? 'other';
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function normalizeItinerary(value: unknown, { newId, knownIds }: Options): Normalized {
  if (!isRecord(value)) return fail('SCHEMA_MISMATCH', 'The response was not a JSON object.');

  if (value.status === 'unplannable') {
    const reason = str(value.reason, LIMITS.reasonMax);
    return { ok: 'unplannable', reason: reason ?? 'The brief does not describe a trip that can be planned.' };
  }

  // Accept either the requested envelope { status, itinerary } or a bare itinerary.
  const trip = isRecord(value.itinerary) ? value.itinerary : value;
  if (!Array.isArray(trip.days)) return fail('SCHEMA_MISMATCH', 'The response had no "days" list.');
  if (trip.days.length === 0) return fail('SCHEMA_MISMATCH', 'The response contained zero days.');

  const usedIds = new Set<string>();
  const claimId = (ref: unknown) => {
    if (typeof ref === 'string' && knownIds?.has(ref) && !usedIds.has(ref)) {
      usedIds.add(ref);
      return ref;
    }
    return newId();
  };

  let droppedStops = 0;
  let droppedDays = 0;
  let trimmedStops = 0;
  let totalStops = 0;
  const days: Day[] = [];

  for (const [index, rawDay] of trip.days.slice(0, LIMITS.maxDays).entries()) {
    if (!isRecord(rawDay) || !Array.isArray(rawDay.stops)) {
      droppedDays += 1;
      continue;
    }
    const stops: Stop[] = [];
    for (const rawStop of rawDay.stops) {
      totalStops += 1;
      const title = isRecord(rawStop) ? str(rawStop.title ?? rawStop.name, LIMITS.titleMax) : null;
      if (!isRecord(rawStop) || !title) {
        droppedStops += 1;
        continue;
      }
      if (stops.length >= LIMITS.maxStopsPerDay) {
        trimmedStops += 1;
        continue;
      }
      stops.push({
        id: claimId(rawStop.ref ?? rawStop.id),
        time: normalizeTime(rawStop.time),
        title,
        description: str(rawStop.description, LIMITS.descriptionMax) ?? '',
        category: category(rawStop.category),
        durationMinutes: duration(rawStop.durationMinutes ?? rawStop.duration),
        area: str(rawStop.area ?? rawStop.neighborhood, LIMITS.areaMax),
        tip: str(rawStop.tip, LIMITS.tipMax),
      });
    }
    if (stops.length === 0) {
      droppedDays += 1;
      continue;
    }
    days.push({
      id: newId(),
      title: str(rawDay.title, LIMITS.dayTitleMax) ?? `Day ${index + 1}`,
      summary: str(rawDay.summary, LIMITS.daySummaryMax) ?? '',
      stops,
    });
  }

  if (days.length === 0) return fail('SCHEMA_MISMATCH', 'None of the days contained a usable stop.');
  // Salvage has limits: if most of the plan was unusable, ask for a repair instead.
  if (totalStops > 0 && droppedStops / totalStops > 0.5) {
    return fail('SCHEMA_MISMATCH', `${plural(droppedStops, 'stop')} of ${totalStops} were missing a name.`);
  }

  const warnings: string[] = [];
  if (droppedStops) warnings.push(`Removed ${plural(droppedStops, 'stop')} the model returned without a name.`);
  if (droppedDays) warnings.push(`Removed ${plural(droppedDays, 'day')} with no usable stops.`);
  if (trimmedStops) warnings.push(`Trimmed ${plural(trimmedStops, 'extra stop')} to keep days to ${LIMITS.maxStopsPerDay}.`);
  if (trip.days.length > LIMITS.maxDays) warnings.push(`Kept the first ${LIMITS.maxDays} days of a longer plan.`);

  const notes = Array.isArray(trip.notes)
    ? trip.notes.map((n) => str(n, LIMITS.noteMax)).filter((n): n is string => n !== null).slice(0, LIMITS.maxNotes)
    : [];

  const candidate: Itinerary = {
    title: str(trip.title, LIMITS.titleMax) ?? 'Untitled trip',
    destination: str(trip.destination, LIMITS.destinationMax) ?? 'Somewhere',
    summary: str(trip.summary, LIMITS.summaryMax) ?? '',
    days,
    notes,
  };

  // Final guard: the object we hand to the client must satisfy the strict contract.
  const checked = itinerarySchema.safeParse(candidate);
  if (!checked.success) return fail('SCHEMA_MISMATCH', checked.error.issues[0]?.message ?? 'Invalid itinerary.');
  return { ok: true, itinerary: checked.data, warnings };
}

/** Cheap progress estimate from partial JSON, for the live status. Never used as data. */
export function estimateProgress(partial: string) {
  // Only days have a "stops" key and only stops have a "category" key (see the prompt schema).
  return {
    days: Math.min(LIMITS.maxDays, (partial.match(/"stops"\s*:/g) ?? []).length),
    stops: Math.min(LIMITS.maxTotalStops, (partial.match(/"category"\s*:/g) ?? []).length),
  };
}
