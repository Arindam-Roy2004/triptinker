import { usePresence, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Symmetric ease-in-out, so the reversed curve is the same curve: e(1 - x) = 1 - e(x). */
const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * Mount inside AnimatePresence: the content dissolves in on mount and out before removal, in
 * place, with no movement. It breaks into square cells that switch on in random order and off in
 * the reverse order, so a reversal mid-way (back in before it has gone) carries on from exactly
 * the pixels showing. Each cell is one layer of a CSS mask: what shows through the gaps is what
 * is really behind (the frosted header), not a painted cover.
 *
 * 4px cells match the app's other pixel effects (PixelFill, the pixel button). A random order
 * read better than an ordered (Bayer) dither, whose checkerboard looked like a glitch midway,
 * or a wipe, which reads as movement. Under reduced motion it appears and goes at once.
 */
export function PixelDissolve({ cell = 4, duration = 320, className, children }: { cell?: number; duration?: number; className?: string; children: ReactNode }) {
  const [isPresent, safeToRemove] = usePresence();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // How far along it is (0 hidden to 1 shown) and when each cell switches, kept across reversals.
  const level = useRef(0);
  const grid = useRef<{ cols: number; rows: number; at: Float32Array } | null>(null);

  // Before paint, so content about to dissolve in never flashes fully drawn first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setMask = (mask: string | null) => {
      for (const prop of ['mask', '-webkit-mask']) {
        if (mask) el.style.setProperty(prop, mask);
        else el.style.removeProperty(prop);
      }
    };
    const done = () => {
      level.current = isPresent ? 1 : 0;
      // Gone: keep it fully masked until it is removed, so it can't flash back for a frame.
      setMask(isPresent ? null : 'linear-gradient(transparent 0 0)');
      if (!isPresent) safeToRemove?.();
    };
    if (reduce) return done();

    const { width, height } = el.getBoundingClientRect();
    const cols = Math.max(1, Math.ceil(width / cell));
    const rows = Math.max(1, Math.ceil(height / cell));
    if (grid.current?.cols !== cols || grid.current.rows !== rows) {
      grid.current = { cols, rows, at: Float32Array.from({ length: cols * rows }, Math.random) };
    }
    const { at } = grid.current;
    const paint = (shown: number) => {
      level.current = shown;
      const edge = smoothstep(shown);
      const layers: string[] = [];
      for (let i = 0; i < at.length; i++) {
        if (at[i] < edge) layers.push(`linear-gradient(#000 0 0) ${(i % cols) * cell}px ${Math.floor(i / cols) * cell}px / ${cell}px ${cell}px no-repeat`);
      }
      setMask(layers.length ? layers.join(',') : 'linear-gradient(transparent 0 0)');
    };

    // Carry on from what is showing now, at the same speed either way.
    const from = level.current;
    const target = isPresent ? 1 : 0;
    const span = Math.abs(target - from) * duration;
    paint(from);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = span ? Math.min(1, (now - start) / span) : 1;
      if (t >= 1) return done();
      paint(from + (target - from) * t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when presence flips
  }, [isPresent]);

  return (
    // The 4px pad (taken back by the margin) brings the button's shadow inside the mask, so it
    // dissolves with the button instead of popping in at the end.
    <span ref={ref} inert={!isPresent} aria-hidden={isPresent ? undefined : true} className={cn('-m-1 inline-flex p-1', className)}>
      {children}
    </span>
  );
}
