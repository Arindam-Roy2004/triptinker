import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A thin spinning arc on a faint track, the "working" mark used by the loader and the change bar. */
export function SpinnerRing({ reduce, className, children }: { reduce?: boolean; className?: string; children?: ReactNode }) {
  return (
    <span className={cn('relative grid size-5 shrink-0 place-items-center text-brand', className)}>
      <svg viewBox="0 0 20 20" className={cn('absolute inset-0 size-full', !reduce && 'animate-spin [animation-duration:1.1s]')} aria-hidden>
        <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--line)" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="14 60" />
      </svg>
      {children}
    </span>
  );
}
