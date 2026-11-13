import { useCallback, useEffect, useState } from 'react';
import { onScrollIdle } from '@/lib/scroll-idle';

/**
 * Whether the trip card's New trip button is still below the screen (the visitor is up top,
 * above the trip), so the header should offer its own. On screen, or scrolled past upwards into
 * the trip, the card's button is the only one.
 *
 *   on screen / past ──(card drops below the fold)──▶ waiting ──(scrolling settles)──▶ below
 *          ▲                                             │                               │
 *          └─────────────(back on screen or past, at once, from either)───────────────────┘
 *
 * Hiding the header's copy is immediate; showing it waits for the scroll to settle, so passing
 * through on the way somewhere (a reload restoring its scroll) never flashes it. "On screen"
 * means any part of it is visible below the floating header bar. Pass `slotRef` as its ref.
 */
export function useCardButtonBelow() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [below, setBelow] = useState(false);
  // No card: the next one starts from "on screen", never from a stale "below".
  const slotRef = useCallback((node: HTMLElement | null) => {
    setEl(node);
    if (!node) setBelow(false);
  }, []);
  useEffect(() => {
    if (!el) return;
    let cancelWait: (() => void) | null = null;
    // The floating bar's real bottom edge: a button any lower is visible, so the header stays out of it.
    const bar = Math.round(document.querySelector('header')?.getBoundingClientRect().bottom ?? 76);
    const observer = new IntersectionObserver(
      ([entry]) => {
        cancelWait?.();
        cancelWait = null;
        const isBelow = !entry.isIntersecting && entry.boundingClientRect.top >= (entry.rootBounds?.bottom ?? window.innerHeight);
        if (!isBelow) setBelow(false);
        else cancelWait = onScrollIdle(() => setBelow(true));
      },
      { rootMargin: `-${bar}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelWait?.();
    };
  }, [el]);
  return { slotRef, below: below && !!el };
}
