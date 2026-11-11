import { useEffect, useState } from 'react';

/**
 * Whether a scroll container has more content below (and above) what is visible. Lets a list
 * fade out at an edge only while there is something to scroll to, so a row is never cut off
 * mid-line without a hint, and a list that fits stays crisp.
 */
export function useMoreBelow<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [more, setMore] = useState(false);
  const [above, setAbove] = useState(false);
  useEffect(() => {
    if (!element) return;
    const update = () => {
      setMore(element.scrollHeight - element.scrollTop - element.clientHeight > 4);
      setAbove(element.scrollTop > 4);
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const mutation = new MutationObserver(update);
    mutation.observe(element, { childList: true, subtree: true });
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [element]);
  return [setElement, more, above] as const;
}
