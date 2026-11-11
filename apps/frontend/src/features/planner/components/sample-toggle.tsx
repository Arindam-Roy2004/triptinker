import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Cancel01 } from '@/components/animate-ui/icons/hugeicons/cancel-01';
import { Button } from '@/components/ui/button';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * One button for both states of the sample. Its cross turns a quarter into a plus when the sample
 * is hidden ("View sample") and turns back into a cross while it is shown ("Hide sample"), so each
 * press visibly reverses the last. The words slide past each other; the button's name is set
 * directly, so it never reads as both labels while they cross.
 */
export function SampleToggle({ shown, onShow, onHide }: { shown: boolean; onShow: () => void; onHide: () => void }) {
  const reduce = useReducedMotion();
  const label = shown ? 'Hide sample' : 'View sample';
  return (
    <Button variant="secondary" onClick={shown ? onHide : onShow} aria-label={label}>
      {/* `plus` turns the cross 45° and draws it in a little: a plus at rest, the cross while shown. */}
      <Cancel01 size={14} animation="plus" animate={!shown} initial={false} aria-hidden />
      <span aria-hidden className="relative inline-flex overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            initial={reduce ? { opacity: 0 } : { y: '90%', opacity: 0, filter: 'blur(3px)' }}
            animate={{ y: '0%', opacity: 1, filter: 'blur(0px)', transition: { duration: 0.32, ease: EASE } }}
            exit={reduce ? { opacity: 0 } : { y: '-90%', opacity: 0, filter: 'blur(3px)', transition: { duration: 0.22, ease: EASE } }}
            className="inline-block"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
}
