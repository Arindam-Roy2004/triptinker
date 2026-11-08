import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The active-item treatment from sagewell: when an item becomes active, a faint field of
 * pixels fills in random order (4px cells, like the scenes' pixel art), fading toward the
 * bottom, while a 2px brand line draws across the bottom edge.
 *
 * Mount it inside a `relative` element when that element becomes active; it animates once
 * on mount. Use it on one active item per view (as sagewell does); for secondary selections
 * pass `pixels={false}` to keep only the line. Under reduced motion both appear complete.
 */
export function PixelFill({
  cell = 4,
  duration = 1100,
  line = true,
  pixels = true,
  className,
}: {
  cell?: number;
  duration?: number;
  line?: boolean;
  pixels?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!pixels || !canvas || !parent || !ctx) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    canvas.width = width;
    canvas.height = height;
    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const order = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    ctx.fillStyle = getComputedStyle(canvas).color; // the brand colour, via text-brand
    // Leave roughly every other pixel empty, so the field reads as a texture, not a fill.
    const total = Math.floor(order.length * 0.55);
    const paint = (from: number, to: number) => {
      for (let k = from; k < to; k++)
        ctx.fillRect(
          (order[k] % cols) * cell,
          Math.floor(order[k] / cols) * cell,
          cell,
          cell,
        );
    };
    if (reduce) {
      paint(0, total);
      return;
    }
    let drawn = 0;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const target = Math.floor(Math.min(1, (now - start) / duration) * total);
      paint(drawn, target);
      drawn = target;
      if (drawn < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cell, duration, reduce, pixels]);

  return (
    <>
      {pixels && (
        <canvas
          ref={ref}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full text-brand opacity-[0.1] [image-rendering:pixelated] [mask-image:linear-gradient(to_bottom,black,transparent_80%)] dark:opacity-[0.2]",
            className,
          )}
        />
      )}
      {line && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 origin-left rounded-full bg-brand"
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: duration / 1000, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </>
  );
}
