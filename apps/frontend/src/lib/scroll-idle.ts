/**
 * Calls `onIdle` once the page has gone `quiet` ms without a scroll event, so smooth scrolls and
 * momentum have finished. Gives up waiting after `max` ms, so a long, steady scroll still gets
 * an answer. Returns a function that cancels the wait.
 */
export function onScrollIdle(onIdle: () => void, { quiet = 140, max = 1600 }: { quiet?: number; max?: number } = {}) {
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    clearTimeout(limit);
    window.removeEventListener('scroll', arm);
  };
  const finish = () => {
    cancel();
    onIdle();
  };
  function arm() {
    clearTimeout(timer);
    timer = window.setTimeout(finish, quiet);
  }
  const limit = window.setTimeout(finish, max);
  window.addEventListener('scroll', arm, { passive: true });
  arm();
  return cancel;
}
