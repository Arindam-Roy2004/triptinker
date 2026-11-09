import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FROM_PROMPT, sceneSrc, sceneSrcSet, type Scene, type SceneTransition } from './scenes';

const CELL = 8; // CSS px per dissolve block: fine enough to read as a shimmer of pixels, not as tiles
const DURATION = 1000;
const VEIL_IN = 700;
const VEIL_OUT = 450;


/**
 * Cell indices in the order they change. A ripple goes nearest-to-the-point first; a wipe goes
 * column by column from one side. Both get enough jitter that the front reads as scattered
 * pixels rather than a clean edge.
 */
function cellOrder(cols: number, rows: number, transition: SceneTransition) {
  let progress: (col: number, row: number) => number;
  let jitter: number;
  if (transition.kind === 'wipe') {
    const fromRight = transition.from === 'right';
    progress = (col) => (fromRight ? cols - col - 0.5 : col + 0.5) / cols;
    jitter = 0.16;
  } else {
    const ox = transition.x * cols;
    const oy = transition.y * rows;
    const reach = Math.hypot(Math.max(ox, cols - ox), Math.max(oy, rows - oy)) || 1;
    progress = (col, row) => Math.hypot(col + 0.5 - ox, row + 0.5 - oy) / reach;
    jitter = 0.28;
  }
  const keyed = Array.from({ length: cols * rows }, (_, i) => [i, progress(i % cols, Math.floor(i / cols)) + Math.random() * jitter] as const);
  keyed.sort((a, b) => a[1] - b[1]);
  return keyed.map(([i]) => i);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * A full-bleed pixel-art scene. The pixels only move for a reason:
 *
 *  - Changing `scene` plays a dissolve shaped by `transition` (a ripple from the prompt, or a
 *    wipe in the direction being browsed): the next image is revealed block by block on a
 *    canvas, then handed to the <img>.
 *  - `dim` (a plan is being written) draws a dark veil over the scene the same way, spreading
 *    from the prompt card, and lifts it again when the work ends.
 *
 * The whole stack drifts slowly (Ken Burns). Under reduced motion everything is instant.
 */
export function SceneStage({ scene, dim = false, transition = FROM_PROMPT, className, children }: { scene: Scene; dim?: boolean; transition?: SceneTransition; className?: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(scene);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLCanvasElement>(null);
  const clearOnLoad = useRef(false);
  const token = useRef(0);
  const transitionRef = useRef(transition);
  transitionRef.current = transition;

  // The working veil: one canvas pixel per block, scaled up crisp by CSS.
  useEffect(() => {
    const canvas = veilRef.current;
    const frame = frameRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !frame || !ctx) return;
    if (dim) {
      canvas.width = Math.max(1, Math.ceil(frame.clientWidth / CELL));
      canvas.height = Math.max(1, Math.ceil(frame.clientHeight / CELL));
    }
    const cols = canvas.width;
    const rows = canvas.height;
    ctx.fillStyle = 'rgb(12 10 9 / 0.45)';
    if (reduce) {
      ctx.clearRect(0, 0, cols, rows);
      if (dim) ctx.fillRect(0, 0, cols, rows);
      return;
    }
    const order = cellOrder(cols, rows, FROM_PROMPT);
    const duration = dim ? VEIL_IN : VEIL_OUT;
    let done = 0;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const target = Math.floor((1 - (1 - t) ** 2) * order.length);
      for (; done < target; done++) {
        const x = order[done] % cols;
        const y = Math.floor(order[done] / cols);
        ctx.clearRect(x, y, 1, 1);
        if (dim) ctx.fillRect(x, y, 1, 1);
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      // Interrupted mid-way (a quick stop, or a restart): settle to the state this run was heading for.
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, cols, rows);
      if (dim) ctx.fillRect(0, 0, cols, rows);
    };
  }, [dim, reduce]);

  useEffect(() => {
    if (scene.id === shown.id) return;
    const run = ++token.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (reduce || !canvas || !frame) {
      setShown(scene);
      return;
    }

    let raf = 0;
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const src = sceneSrc(scene, width * dpr > 1100 ? 1920 : 960);

    loadImage(src)
      .then((img) => {
        if (run !== token.current) return;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return setShown(scene);
        ctx.imageSmoothingEnabled = false;

        // object-fit: cover mapping from canvas space back into the source image.
        const W = canvas.width;
        const H = canvas.height;
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const ox = (W - img.naturalWidth * s) / 2;
        const oy = (H - img.naturalHeight * s) / 2;
        const c = Math.ceil(CELL * dpr);
        const cols = Math.ceil(W / c);
        const rows = Math.ceil(H / c);
        const cells = cellOrder(cols, rows, transitionRef.current).map((i): [number, number] => [(i % cols) * c, Math.floor(i / cols) * c]);

        let drawn = 0;
        const start = performance.now();
        const tick = (now: number) => {
          if (run !== token.current) return;
          const t = Math.min(1, (now - start) / DURATION);
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const target = Math.floor(eased * cells.length);
          for (; drawn < target; drawn++) {
            const [x, y] = cells[drawn];
            ctx.drawImage(img, (x - ox) / s, (y - oy) / s, c / s, c / s, x, y, c, c);
          }
          if (t < 1) raf = requestAnimationFrame(tick);
          else {
            clearOnLoad.current = true;
            setShown(scene);
          }
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => run === token.current && setShown(scene));

    return () => cancelAnimationFrame(raf);
  }, [scene, shown.id, reduce]);

  return (
    <div ref={frameRef} className={cn('relative isolate overflow-hidden bg-[#2b3a3a]', className)}>
      <div className="absolute inset-0 animate-drift will-change-transform" aria-hidden>
        <img
          key={shown.id}
          src={sceneSrc(shown, 1920)}
          srcSet={sceneSrcSet(shown)}
          sizes="(min-width: 1104px) 1104px, 100vw"
          alt=""
          decoding="async"
          fetchPriority="high"
          onLoad={(event) => {
            // Hand-off from the dissolve canvas to the <img>. `load` can fire before an async-decoded
            // image is actually painted, and clearing the canvas then flashes the dark backdrop for a
            // frame. So wait for the decode, then for the next painted frame, and only then clear —
            // unless another dissolve has started in the meantime.
            if (!clearOnLoad.current) return;
            clearOnLoad.current = false;
            const run = token.current;
            const img = event.currentTarget;
            const clear = () => {
              if (run !== token.current) return;
              const canvas = canvasRef.current;
              canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            };
            img
              .decode()
              .catch(() => undefined)
              .then(() => requestAnimationFrame(() => requestAnimationFrame(clear)));
          }}
          className="absolute inset-0 size-full object-cover"
        />
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      </div>
      <canvas ref={veilRef} width={1} height={1} className="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated]" aria-hidden />
      {children}
    </div>
  );
}

/** Frosted caption naming the place, with quiet controls to browse the other scenes. */
export function SceneCaption({ scene, position, onPrev, onNext, className }: { scene: Scene; position: { index: number; total: number }; onPrev: () => void; onNext: () => void; className?: string }) {
  return (
    <div className={cn('frost flex h-8 items-center gap-1 rounded-xl pr-1 pl-3 text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_4px_12px_-4px_rgb(0_0_0/0.25)]', className)}>
      <p className="label truncate text-[11px]" aria-live="polite">
        {scene.name} <span className="text-muted">· {scene.place}</span>
      </p>
      <span className="label tabular ml-1 text-[11px] text-subtle">
        {String(position.index + 1).padStart(2, '0')}/{String(position.total).padStart(2, '0')}
      </span>
      <button type="button" onClick={onPrev} aria-label="Previous scene" className="ml-1 grid size-6 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
        <CaretLeft size={12} />
      </button>
      <button type="button" onClick={onNext} aria-label="Next scene" className="grid size-6 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
        <CaretRight size={12} />
      </button>
    </div>
  );
}
