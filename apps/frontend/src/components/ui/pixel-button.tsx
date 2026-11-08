import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Point = { x: number; y: number };
type Cell = Point & { base: number; light: number; gate: number; peak: number };
type Ripple = Point & { started: number; strength: number };

// Measured from Vibrant's feed-detail action: 4px pixels on a 5px grid,
// a 72px pointer halo, 420ms light decay and an 820ms expanding ripple.
const GRID = 5;
const PIXEL = 4;
const HALO = 72;
const DECAY = 420;
const RIPPLE_DURATION = 820;
const peak = () => {
  const value = Math.random();
  return value < 0.4 ? 0.1 : value < 0.72 ? 0.16 : value < 0.92 ? 0.23 : 0.3;
};

function PixelSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const button = canvas?.closest('button');
    const context = canvas?.getContext('2d');
    if (!canvas || !button || !context) return;

    let width = 0;
    let height = 0;
    let cells: Cell[] = [];
    let ripples: Ripple[] = [];
    let pointer: Point | null = null;
    let hovering = false;
    let keyboardFocus = false;
    let frame = 0;
    let last = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const cell of cells) {
        let light = cell.base + cell.light;
        if (reduce && pointer && (hovering || keyboardFocus)) {
          const distance = Math.hypot(cell.x + PIXEL / 2 - pointer.x, cell.y + PIXEL / 2 - pointer.y);
          if (cell.gate < (1 - distance / HALO) * 0.55) light += cell.peak;
        }
        context.fillStyle = `rgba(255, 255, 255, ${Math.min(light, 0.38)})`;
        context.fillRect(cell.x, cell.y, PIXEL, PIXEL);
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const elapsed = Math.min(48, last ? now - last : 16.67);
      last = now;
      const step = elapsed / 16.67;
      ripples = ripples.filter((ripple) => now - ripple.started < RIPPLE_DURATION);
      let glowing = false;
      for (const cell of cells) {
        cell.light *= Math.exp(-elapsed / DECAY);
        if (cell.light < 0.004) cell.light = 0;
        const x = cell.x + PIXEL / 2;
        const y = cell.y + PIXEL / 2;
        if (pointer && (hovering || keyboardFocus)) {
          const proximity = Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / HALO);
          if (Math.random() < proximity ** 1.5 * 0.16 * step) {
            cell.light = Math.max(cell.light, peak() * (0.55 + 0.45 * proximity));
          }
        }
        for (const ripple of ripples) {
          const progress = (now - ripple.started) / RIPPLE_DURATION;
          const radius = progress * Math.hypot(width, height) * 0.9;
          if (Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - radius) < 11 && Math.random() < 0.24 * ripple.strength * step) {
            cell.light = Math.max(cell.light, peak() * (1 - progress * 0.6));
          }
        }
        glowing ||= cell.light > 0;
      }
      draw();
      if (glowing || hovering || keyboardFocus || ripples.length) frame = requestAnimationFrame(tick);
      else last = 0;
    };

    const wake = () => {
      if (reduce) draw();
      else if (!frame) frame = requestAnimationFrame(tick);
    };
    const ripple = (point: Point, strength: number) => {
      if (!reduce) ripples = [...ripples.slice(-5), { ...point, strength, started: performance.now() }];
      wake();
    };
    const position = (event: PointerEvent): Point => {
      const rect = button.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
    };
    const resize = () => {
      width = button.clientWidth;
      height = button.clientHeight;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);
      context.setTransform(density, 0, 0, density, 0, 0);
      const cols = Math.ceil(width / GRID);
      const rows = Math.ceil(height / GRID);
      cells = Array.from({ length: cols * rows }, (_, i) => {
        const value = Math.random();
        return {
          x: (width - cols * GRID) / 2 + (i % cols) * GRID,
          y: (height - rows * GRID) / 2 + Math.floor(i / cols) * GRID,
          base: value < 0.55 ? 0.03 : value < 0.82 ? 0.06 : value < 0.95 ? 0.09 : 0.13,
          light: 0, gate: Math.random(), peak: peak(),
        };
      });
      draw();
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer = position(event);
      hovering = true;
      ripple(pointer, 0.6);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer = position(event);
      wake();
    };
    const leave = () => { hovering = false; wake(); };
    const down = (event: PointerEvent) => { ripple(position(event), 1); };
    const click = (event: MouseEvent) => {
      if (event.detail === 0) ripple({ x: width / 2, y: height / 2 }, 1);
    };
    const focus = () => {
      if (!button.matches(':focus-visible')) return;
      keyboardFocus = true;
      pointer = { x: width / 2, y: height / 2 };
      ripple(pointer, 0.6);
    };
    const blur = () => { keyboardFocus = false; wake(); };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(button);
    button.addEventListener('pointerenter', enter);
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerleave', leave);
    button.addEventListener('pointercancel', leave);
    button.addEventListener('pointerdown', down);
    button.addEventListener('click', click);
    button.addEventListener('focus', focus);
    button.addEventListener('blur', blur);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      button.removeEventListener('pointerenter', enter);
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerleave', leave);
      button.removeEventListener('pointercancel', leave);
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('click', click);
      button.removeEventListener('focus', focus);
      button.removeEventListener('blur', blur);
    };
  }, [reduce]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}

/** Opt-in treatment for actions on completed AI results, never the page header. */
export function PixelButton({ children, className, disabled, ...props }: Omit<ComponentProps<typeof Button>, 'asChild'>) {
  return (
    <Button {...props} disabled={disabled} className={cn('overflow-hidden', className)}>
      {!disabled && <PixelSurface />}
      <span className="relative inline-flex items-center justify-center gap-2">{children}</span>
    </Button>
  );
}
