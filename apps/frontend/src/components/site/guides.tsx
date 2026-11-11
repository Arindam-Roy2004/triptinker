import { cn } from '@/lib/utils';

/*
 * The page frame, after Aceternity's Mainline studio template: two dotted rails run the height of
 * the page just outside the content column, and dotted rules mark where a framed section starts
 * and ends. Their dots are 2px circles every 8px in a 4px strip (an SVG pattern there; a radial
 * gradient here, so there are no pattern ids to keep unique). Purely decorative, drawn behind the
 * content, and left out on phones where the column touches the screen edge.
 */

/** The page's content column. The rails track this box, so anything laid out in it lines up with them. */
export const COLUMN = 'mx-auto w-full max-w-[1104px] px-4 sm:px-6 xl:px-0';

/** How far the rails sit outside the column, and how far a framing rule sits off a card: 12px. */
const OUTSET = 12;
/** The dot strip is 4px wide, centred on the rail. */
const STRIP = 4;

/** The two vertical rails. Place once, as a direct child of a `relative isolate` page wrapper. */
export function GuideRails() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden sm:block">
      <div className={cn(COLUMN, 'h-full')}>
        <div className="relative h-full">
          <span className="dots-y absolute inset-y-0" style={{ left: -OUTSET - STRIP / 2, width: STRIP }} />
          <span className="dots-y absolute inset-y-0" style={{ right: -OUTSET - STRIP / 2, width: STRIP }} />
        </div>
      </div>
    </div>
  );
}

/**
 * A dotted rule from rail to rail, its ends fading out. Place inside the content column. `frame`
 * sets which side the framed card is on: the rule keeps a 12px gap on that side. The gap is
 * padding, not margin: an empty block's margins collapse into its neighbours', which would leave
 * the rule sitting on the card's edge.
 */
export function GuideLine({ frame, className }: { frame?: 'above' | 'below'; className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none relative -z-10 hidden sm:block', frame === 'below' && 'pb-3', frame === 'above' && 'pt-3', className)}>
      <div className="relative h-0">
        <span className="dots-x absolute" style={{ top: -STRIP / 2, height: STRIP, left: -OUTSET, right: -OUTSET }} />
      </div>
    </div>
  );
}
