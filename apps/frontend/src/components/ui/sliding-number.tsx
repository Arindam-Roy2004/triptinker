import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, useSpring, useTransform, type MotionStyle } from 'motion/react';
import { cn } from '@/lib/utils';

/** The spring Aceternity's Nodus template uses for its pricing digits: a quick roll with a small overshoot. */
const SPRING = { stiffness: 280, damping: 18, mass: 0.3 };

/**
 * One digit column. The real digit stays in the DOM (in transparent ink) so the text, its width and its
 * baseline are exactly those of a plain number; the visible 0–9 strip is drawn by `.slide-digit::after`
 * and rolled by `--pos`. The strip repeats three times, so a roll from 9 to 0 goes forward one step
 * instead of back nine.
 */
function Digit({ digit }: { digit: number }) {
  const reduce = useReducedMotion();
  const last = useRef(digit);
  const target = useRef(digit);
  const spring = useSpring(digit, SPRING);

  useEffect(() => {
    if (digit === last.current) return;
    target.current += ((digit - last.current + 15) % 10) - 5; // shortest way round: -5…+4 steps
    last.current = digit;
    if (reduce) spring.jump(target.current);
    else spring.set(target.current);
  }, [digit, reduce, spring]);

  const pos = useTransform(spring, (v) => (((v % 10) + 10) % 10) + 10);
  return (
    <motion.span className="slide-digit" style={{ '--pos': pos } as MotionStyle}>
      <span>{digit}</span>
    </motion.span>
  );
}

/**
 * A number whose digits roll into place when it changes (after Aceternity's SlidingNumber).
 * Reads, copies and measures like plain text; respects reduced motion.
 */
export function SlidingNumber({ value, pad = 1, className }: { value: number; pad?: number; className?: string }) {
  const digits = String(Math.max(0, Math.round(value))).padStart(pad, '0').split('');
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>
      {/* Keyed by place from the right, so the ones column stays the ones column as the number grows. */}
      {digits.map((d, i) => (
        <Digit key={digits.length - i} digit={Number(d)} />
      ))}
    </span>
  );
}
