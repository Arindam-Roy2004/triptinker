import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/keys';
import { FROM_PROMPT, SCENES, sceneForDestination, type Scene, type SceneTransition } from './scenes';

const KEY = STORAGE_KEYS.sceneVisit;

/** Each visit advances one step through all scenes, so a reload always shows a new place. */
function nextVisitIndex(): number {
  const initial = document.documentElement.dataset.sceneVisit;
  if (initial !== undefined && /^\d+$/.test(initial)) {
    const index = Number(initial);
    if (index < SCENES.length) return index;
  }
  try {
    const previous = Number.parseInt(window.localStorage.getItem(KEY) ?? '-1', 10);
    return Number.isFinite(previous) && previous >= -1 ? ((previous % SCENES.length) + 1) % SCENES.length : 0;
  } catch {
    return 0;
  }
}

export function useScene() {
  const [visit] = useState(nextVisitIndex);
  // The initializer stays pure under StrictMode. The head preload and React use one index.
  useEffect(() => {
    try { window.localStorage.setItem(KEY, String(visit)); } catch { /* Rotation still works without storage. */ }
  }, [visit]);
  const [offset, setOffset] = useState(0);
  /** A destination match overrides the rotation until the traveller browses again. */
  const [pinned, setPinned] = useState<Scene | null>(null);
  const lastDestination = useRef<string | null>(null);
  /** How the next change plays: a wipe in the direction browsed, or a ripple from the prompt. */
  const [transition, setTransition] = useState<SceneTransition>(FROM_PROMPT);

  const total = SCENES.length;
  const index = (((visit + offset) % total) + total) % total;
  const scene = pinned ?? SCENES[index];

  const step = useCallback(
    (delta: number) => {
      setTransition({ kind: 'wipe', from: delta > 0 ? 'right' : 'left' });
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
    if (!match) return;
    setTransition(FROM_PROMPT);
    setPinned(match);
  }, []);

  const position = { index: SCENES.findIndex((s) => s.id === scene.id), total };
  return { scene, position, transition, next: () => step(1), prev: () => step(-1), matchDestination };
}
