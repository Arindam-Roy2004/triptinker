import { BookmarkSimple, Check } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The Save button's contents, swapped the way Aceternity's Pixel Prompt Button swaps its own:
 * the icon turns over and the words blur across, "Save trip" to "Saved". The button's name is
 * set by the caller, so it never reads as both labels mid-swap; this is decoration only.
 */
export function SaveLabel({ saved }: { saved: boolean }) {
  const reduce = useReducedMotion();
  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(4px)' };
  const leave = reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(4px)' };
  return (
    <span aria-hidden className="relative inline-flex items-center gap-2 overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={saved ? 'saved' : 'save'}
          initial={reduce ? enter : { ...enter, scale: 0.6, rotate: saved ? -45 : 45 }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, rotate: 0, transition: { duration: 0.32, ease: EASE } }}
          exit={{ ...leave, transition: { duration: 0.18, ease: EASE } }}
          className="inline-flex"
        >
          {saved ? <Check weight="bold" /> : <BookmarkSimple />}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={saved ? 'Saved' : 'Save trip'}
          initial={enter}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.32, ease: EASE, delay: 0.04 } }}
          exit={{ ...leave, transition: { duration: 0.18, ease: EASE } }}
          className="inline-block"
        >
          {saved ? 'Saved' : 'Save trip'}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
