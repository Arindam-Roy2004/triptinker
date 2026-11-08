import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

/** Tail segments of the comet, as % of the perimeter: longer segments are fainter. */
const TAIL = [
  { length: 22, opacity: 0.18 },
  { length: 11, opacity: 0.45 },
  { length: 4, opacity: 1 },
];

/**
 * A single light that travels the card's edge while work is in progress.
 *
 * Drawn as an SVG rounded rect with `pathLength=100`, so the comet moves at an even speed
 * and keeps the same thickness on straight edges and corners. A blurred copy underneath is
 * the glow. Hidden under reduced motion; the card's own border still marks it as busy.
 */
export function RunningRing({ radius = 16, color = 'var(--clay)', duration = 3.4 }: { radius?: number; color?: string; duration?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const ring = (blur: boolean) => (
    <svg className="pointer-events-none absolute overflow-visible" style={{ inset: 0.5, width: 'calc(100% - 1px)', height: 'calc(100% - 1px)', filter: blur ? 'blur(5px)' : undefined, opacity: blur ? 0.8 : 1 }} aria-hidden>
      {TAIL.map(({ length, opacity }) => (
        <rect
          key={length}
          width="100%"
          height="100%"
          rx={radius - 0.5}
          pathLength={100}
          fill="none"
          stroke={color}
          strokeWidth={blur ? 3 : 1.5}
          strokeLinecap="round"
          strokeDasharray={`${length} ${100 - length}`}
          opacity={opacity}
          style={{ '--from': length, '--to': length - 100, animation: `ring-run ${duration}s linear infinite` } as CSSProperties}
        />
      ))}
    </svg>
  );
  return (
    <>
      {ring(true)}
      {ring(false)}
    </>
  );
}
