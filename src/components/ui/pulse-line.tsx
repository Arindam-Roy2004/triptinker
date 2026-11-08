import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * sagewell's connector line: a quiet 1px track with a bright brand pulse that travels along it,
 * pauses, and goes again. Horizontal lines run left → right, vertical ones top → bottom.
 * It fills its box, so position it over the edge it should trace. Under reduced motion only
 * the track is drawn.
 */
export function PulseLine({ vertical = false, duration = 2.4, delay = 0, repeatDelay = 3, className }: { vertical?: boolean; duration?: number; delay?: number; repeatDelay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const id = `pulse${useId().replace(/:/g, '')}`;
  const line = vertical ? { x1: '0.5', y1: '0', x2: '0.5', y2: '100%' } : { x1: '0', y1: '0.5', x2: '100%', y2: '0.5' };
  const from = vertical ? { x1: '0', x2: '0', y1: '-30%', y2: '0%' } : { x1: '-30%', x2: '0%', y1: '0', y2: '0' };
  const to = vertical ? { x1: '0', x2: '0', y1: '100%', y2: '130%' } : { x1: '100%', x2: '130%', y1: '0', y2: '0' };
  return (
    <svg aria-hidden className={cn('pointer-events-none overflow-visible', vertical ? 'h-full w-px' : 'h-px w-full', className)}>
      <line {...line} stroke="var(--line)" />
      {!reduce && (
        <>
          <line {...line} stroke={`url(#${id})`} strokeWidth={1.5} strokeLinecap="round" />
          <defs>
            <motion.linearGradient id={id} gradientUnits="userSpaceOnUse" initial={from} animate={to} transition={{ duration, delay, repeat: Infinity, repeatDelay, ease: 'easeInOut' }}>
              <stop offset="0" stopColor="var(--brand)" stopOpacity="0" />
              <stop offset="0.5" stopColor="var(--brand)" stopOpacity="1" />
              <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
            </motion.linearGradient>
          </defs>
        </>
      )}
    </svg>
  );
}

/** sagewell's question reveal: words fade in one after another (20ms apart). Static under reduced motion. */
export function WordsIn({ text, className, step = 0.02 }: { text: string; className?: string; step?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.split(/(\s+)/).map((word, i) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <motion.span key={i} className="inline-block" initial={{ opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.25, delay: step * i, ease: 'linear' }}>
            {word}
          </motion.span>
        ),
      )}
    </span>
  );
}
