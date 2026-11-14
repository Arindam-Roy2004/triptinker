import { Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PixelDissolve } from '@/components/ui/pixel-dissolve';

/**
 * The header's New trip button. The trip card has its own, always there next to Undo and Redo;
 * this one shows only up top, while that card is still below the fold (see useCardButtonBelow),
 * and pixel-dissolves out in place as the card arrives. Mount it inside AnimatePresence.
 */
export function NewTripButton({ onClick }: { onClick: () => void }) {
  return (
    <PixelDissolve>
      <Button variant="secondary" size="sm" onClick={onClick} aria-label="New trip">
        <Plus />
        {/* Below 360px (small phones, iOS Display Zoom) the plus alone keeps the header on one row. */}
        <span className="hidden min-[360px]:inline sm:hidden">New</span>
        <span className="hidden sm:inline">New trip</span>
      </Button>
    </PixelDissolve>
  );
}
