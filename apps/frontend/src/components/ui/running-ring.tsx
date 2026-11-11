import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

/**
 * The train of dashes, front to back, as % of the perimeter: a long bright lead, then shorter,
 * fainter carriages with a gap between each. Square ends, no glow: it reads as a crisp marker
 * running the edge (in keeping with the pixel scenes), not a soft comet of light.
 */
const TRAIN = [
  { length: 7, gap: 0, opacity: 1 },
  { length: 3, gap: 1.6, opacity: 0.55 },
  { length: 1.5, gap: 1.6, opacity: 0.28 },
];

/**
 * A short train of dashes that travels the card's edge while work is in progress.
 *
 * Drawn as an SVG rounded rect with `pathLength=100`, so it moves at an even speed and keeps the
 * same thickness on straight edges and corners. Each dash is its own rect, offset to sit behind
 * the one in front. Hidden under reduced motion; the card's own ring still marks it as busy.
 */
export function RunningRing({ radius = 16, color = 'var(--running)', duration = 3 }: { radius?: number; color?: string; duration?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  let head = 0; // where this dash ends, behind the train's front
  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ inset: 0.5, width: 'calc(100% - 1px)', height: 'calc(100% - 1px)' }} aria-hidden>
      {TRAIN.map(({ length, gap, opacity }) => {
        head += gap;
        const from = length + head; // dashoffset that puts this dash's front `head` behind the start
        head += length;
        return (
          <rect
            key={length}
            width="100%"
            height="100%"
            rx={radius - 0.5}
            pathLength={100}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="butt"
            strokeDasharray={`${length} ${100 - length}`}
            opacity={opacity}
            style={{ '--from': from, '--to': from - 100, animation: `ring-run ${duration}s linear infinite` } as CSSProperties}
          />
        );
      })}
    </svg>
  );
}
