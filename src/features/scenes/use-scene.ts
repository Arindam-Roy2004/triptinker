import { useCallback, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/keys';
import { SCENES, sceneForDestination, type Scene } from './scenes';

const KEY = STORAGE_KEYS.sceneVisit;

/** Each visit advances one step through all scenes, so a reload always shows a new place. */
function nextVisitIndex(): number {
  try {
    const previous = Number.parseInt(window.localStorage.getItem(KEY) ?? '-1', 10);
    const next = Number.isFinite(previous) ? previous + 1 : 0;
    window.localStorage.setItem(KEY, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * SCENES.length);
  }
}

export function useScene() {
  const [visit] = useState(nextVisitIndex);
  const [offset, setOffset] = useState(0);
  /** A destination match overrides the rotation until the traveller browses again. */
  const [pinned, setPinned] = useState<Scene | null>(null);
  const lastDestination = useRef<string | null>(null);

  const total = SCENES.length;
  const index = (((visit + offset) % total) + total) % total;
  const scene = pinned ?? SCENES[index];

  const step = useCallback(
    (delta: number) => {
      // Browsing from a pinned scene continues from that scene, not from where the rotation was.
      if (pinned) {
        const at = SCENES.findIndex((s) => s.id === pinned.id);
        setOffset(at - visit + delta);
        setPinned(null);
        return;
      }
      setOffset((o) => o + delta);
    },
    [pinned, visit],
  );

  const matchDestination = useCallback((destination: string | null) => {
    if (!destination || destination === lastDestination.current) return;
    lastDestination.current = destination;
    const match = sceneForDestination(destination);
    if (match) setPinned(match);
  }, []);

  const position = { index: SCENES.findIndex((s) => s.id === scene.id), total };
  return { scene, position, next: () => step(1), prev: () => step(-1), matchDestination };
}
