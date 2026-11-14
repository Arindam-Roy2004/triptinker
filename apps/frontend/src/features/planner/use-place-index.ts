import { useEffect, useSyncExternalStore } from 'react';

/**
 * Every city of 15,000+ people, every state or region and every country (GeoNames, CC BY 4.0), built by
 * scripts/build-places.mjs into public/data/places.txt (~190 KB gzipped). Loaded once, when the browser
 * is idle, so it never competes with the first paint; until then the curated list in places.ts is used.
 */
export type PlaceIndex = {
  /** Lowercase name → whether it is also an everyday English word (then it needs a capital). */
  names: Map<string, boolean>;
  /** The most words in any name, so the matcher knows how far to look ahead. */
  maxWords: number;
};

let index: PlaceIndex | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  loading ??= fetch('/data/places.txt')
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => {
      if (!text) return;
      const names = new Map<string, boolean>();
      let maxWords = 1;
      for (const line of text.split('\n')) {
        if (!line) continue;
        const ambiguous = line.startsWith('~');
        const name = ambiguous ? line.slice(1) : line;
        names.set(name, ambiguous);
        maxWords = Math.max(maxWords, name.split(' ').length);
      }
      index = { names, maxWords: Math.min(maxWords, 6) };
      listeners.forEach((notify) => notify());
    })
    .catch(() => {
      // Offline or blocked: the curated list keeps working on its own.
      loading = null;
    });
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** The full place index once it has loaded (null before), starting the load when the browser is idle. */
export function usePlaceIndex(): PlaceIndex | null {
  useEffect(() => {
    if (index || loading) return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1200));
    idle(load);
  }, []);
  return useSyncExternalStore(subscribe, () => index, () => null);
}
