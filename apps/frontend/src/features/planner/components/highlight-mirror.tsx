import { forwardRef, useMemo, type ReactNode } from 'react';
import { findHighlights } from '../highlight';
import { usePlaceIndex } from '../use-place-index';
import { cn } from '@/lib/utils';

/** Text with its key words wrapped in tinted pills (`.hl`), ready to drop into any text layer. */
export function HighlightedText({ text }: { text: string }) {
  const index = usePlaceIndex();
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    const seen = new Map<string, number>();
    let at = 0;
    for (const h of findHighlights(text, index)) {
      if (h.start > at) out.push(text.slice(at, h.start));
      // Keyed by word and which occurrence it is, not by position, so typing earlier in the text
      // doesn't remount (and re-animate) the pills after it.
      const word = `${h.kind}:${text.slice(h.start, h.end).toLowerCase()}`;
      const nth = (seen.get(word) ?? 0) + 1;
      seen.set(word, nth);
      out.push(
        <mark key={`${word}:${nth}`} data-kind={h.kind} className="hl">
          {text.slice(h.start, h.end)}
        </mark>,
      );
      at = h.end;
    }
    out.push(text.slice(at));
    return out;
  }, [text, index]);
  return <>{parts}</>;
}

/**
 * The visible text of a trip box, with its key words on soft tinted pills (after Cursor's file chips
 * and Wispr Flow's file tagging). It sits behind a textarea whose own text is transparent, sharing
 * its font, padding and wrapping, so every glyph and the caret line up exactly; the textarea stays a
 * plain textarea, so typing, IME, undo, paste and voice input behave as before. Pills never change
 * the width of a word (`.hl` pads and pulls back by the same amount).
 */
export const HighlightMirror = forwardRef<HTMLDivElement, { text: string; className?: string }>(function HighlightMirror({ text, className }, ref) {
  return (
    <div ref={ref} aria-hidden className={cn('hl-field pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap', className)}>
      <HighlightedText text={text} />
      {/* A trailing line break needs a character after it to keep its height, as it does in the textarea. */}
      {text.endsWith('\n') && '​'}
    </div>
  );
});
