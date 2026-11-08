import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const HEADER_SPRING = { type: 'spring', stiffness: 380, damping: 36, mass: 0.8 } as const;

export function Logo({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="flex shrink-0 items-center gap-2">
      <motion.img
        src="/triptinker-logo.svg"
        alt=""
        width={40}
        height={36}
        draggable={false}
        initial={false}
        animate={{ width: compact ? 28 : 40, height: compact ? 24 : 36 }}
        transition={reduce ? { duration: 0 } : HEADER_SPRING}
        className="shrink-0 select-none object-contain dark:invert"
      />
      <span className="wordmark whitespace-nowrap text-[21px] leading-none text-ink">TripTinker</span>
    </span>
  );
}

/** Floating glass bar: transparent at rest, it condenses into a blurred pill on scroll. */
export function SiteHeader({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(() => window.scrollY > 12);
  const reduce = useReducedMotion();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));
  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <motion.div
        initial={false}
        animate={{ maxWidth: scrolled ? 840 : 1024, borderRadius: scrolled ? 999 : 16 }}
        transition={reduce ? { duration: 0 } : HEADER_SPRING}
        className={cn(
          'mx-auto flex h-16 items-center justify-between gap-4 border px-3 transition-[background-color,border-color,box-shadow] duration-300 sm:px-4',
          scrolled
            ? 'border-line bg-surface/82 shadow-[0_10px_30px_-14px_rgb(28_25_23/0.28)] backdrop-blur-md'
            : 'border-transparent bg-transparent',
        )}
      >
        <a href="/" aria-label="TripTinker, home" className="inline-flex h-12 shrink-0 items-center rounded-md">
          <Logo compact={scrolled} />
        </a>
        <nav aria-label="Tools" className="flex items-center gap-1.5">
          {children}
        </nav>
      </motion.div>
    </header>
  );
}
