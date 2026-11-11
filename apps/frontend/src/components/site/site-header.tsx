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
  const [scrolled, setScrolled] = useState(() => window.scrollY > 24);
  const reduce = useReducedMotion();
  // Condense past 24px, expand again only near the very top: a gap between the two, so iOS's
  // rubber-band bounce around one threshold can't make the bar flicker between states.
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled((was) => (was ? y > 4 : y > 24)));
  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <motion.div
        initial={false}
        animate={{ maxWidth: scrolled ? 840 : 1128, borderRadius: scrolled ? 999 : 16 }}
        transition={reduce ? { duration: 0 } : HEADER_SPRING}
        className={cn(
          // At rest the bar is as wide as the page content, so the logo and tools sit on its edges.
          'mx-auto flex h-16 items-center justify-between gap-4 border transition-[background-color,border-color,box-shadow,padding] duration-300',
          scrolled
            ? 'border-[rgb(229_229_229/0.5)] bg-surface/90 px-3 shadow-lg shadow-black/10 backdrop-blur-xl sm:px-4 dark:border-[rgb(64_64_64/0.5)] dark:shadow-black/30'
            : 'border-transparent bg-transparent px-[3px] sm:px-[11px]',
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
