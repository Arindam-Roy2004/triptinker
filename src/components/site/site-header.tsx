import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      {/* The Roamfar mark: a snow-capped peak with a road winding up to it. */}
      <img src="/roamfar-mark.png" alt="" width={128} height={105} className="h-7 w-auto select-none" draggable={false} />
      <span className="wordmark text-[19px] leading-none text-ink">ROAMFAR</span>
    </span>
  );
}

/** Floating glass bar: transparent at rest, it condenses into a blurred pill on scroll. */
export function SiteHeader({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));
  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <motion.div
        initial={false}
        animate={{ maxWidth: scrolled ? 840 : 1024, borderRadius: scrolled ? 999 : 16 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
        className={cn(
          'mx-auto flex h-16 items-center justify-between gap-4 border px-3 transition-[background-color,border-color,box-shadow] duration-300 sm:px-4',
          scrolled
            ? 'border-line bg-surface/82 shadow-[0_10px_30px_-14px_rgb(28_25_23/0.28)] backdrop-blur-md'
            : 'border-transparent bg-transparent',
        )}
      >
        <a href="/" aria-label="Roamfar, home" className="rounded-md">
          <Logo />
        </a>
        <nav aria-label="Tools" className="flex items-center gap-1.5">
          {children}
        </nav>
      </motion.div>
    </header>
  );
}
