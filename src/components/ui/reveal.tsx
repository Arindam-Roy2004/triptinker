import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

const ease = [0.22, 1, 0.36, 1] as const;

const TAGS = { span: motion.span, div: motion.div, p: motion.p } as const;

/**
 * Entrance used across the page: content rises a few pixels out of a soft blur, staggered
 * by `index` (the word-by-word reveal on Aceternity's Inference hero, applied per line).
 * Under reduced motion it renders in place.
 */
export function Reveal({ index = 0, as = 'span', step = 0.08, className, children }: { index?: number; as?: keyof typeof TAGS; step?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const Tag = TAGS[as];
  return (
    <Tag
      className={as === 'span' ? `inline-block ${className ?? ''}` : className}
      initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: index * step, duration: 0.6, ease }}
    >
      {children}
    </Tag>
  );
}
