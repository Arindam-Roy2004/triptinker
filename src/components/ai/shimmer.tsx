import type { CSSProperties, ElementType } from 'react';
import { cn } from '@/lib/utils';

/**
 * Text with a band of light sweeping across it (after composio's / ai-elements' Shimmer),
 * done in CSS so it costs nothing per frame in React.
 */
export function Shimmer({ children, as: Tag = 'p', className, duration = 2 }: { children: string; as?: ElementType; className?: string; duration?: number }) {
  return (
    <Tag className={cn('shimmer-text', className)} style={{ '--shimmer-duration': `${duration}s`, '--spread': `${children.length * 2}px` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/**
 * sagewell's eyebrow badge: a brand-coloured label that a light band sweeps across
 * every few seconds, resting in between. Reduced motion stops it (global rule).
 */
export function ShimmerLabel({ children, number, as: Tag = 'p', className }: { children: string; number?: string; as?: ElementType; className?: string }) {
  return (
    <Tag
      className={cn('shimmer-text shimmer-rest label', className)}
      style={{ '--shimmer-duration': '3.4s', '--spread': `${Math.max(24, children.length * 1.5)}px`, '--shimmer-base': 'var(--brand)', '--shimmer-band': 'var(--shimmer-light)' } as CSSProperties}
    >
      {number && <><span className="tabular mr-2">{number}</span><span aria-hidden className="mr-2">—</span></>}
      {children}
    </Tag>
  );
}
