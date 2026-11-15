import { useEffect, useState, type CSSProperties } from 'react';

/**
 * The sideways twin of `useMoreBelow`, for a row that scrolls across (chips, day tabs): whether
 * there is more to the left and to the right of what is visible.
 */
export function useMoreBeside<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  useEffect(() => {
    if (!element) return;
    const update = () => {
      setLeft(element.scrollLeft > 4);
      setRight(element.scrollWidth - element.scrollLeft - element.clientWidth > 4);
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [element]);
  return [setElement, left, right] as const;
}

/**
 * A mask that fades a scrolling row out at whichever edge has more beyond it, so an item cut by
 * the edge reads as "keep scrolling" instead of a control sliced by mistake. A row that fits stays crisp.
 */
export function fadeBeside(left: boolean, right: boolean, size = 32): CSSProperties | undefined {
  if (!left && !right) return undefined;
  const mask = `linear-gradient(to right, ${left ? 'transparent' : '#000'}, #000 ${left ? size : 0}px, #000 calc(100% - ${right ? size : 0}px), ${right ? 'transparent' : '#000'})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
