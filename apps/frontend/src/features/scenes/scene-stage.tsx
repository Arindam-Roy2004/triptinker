import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { sceneSrc, sceneSrcSet, type Scene } from './scenes';

const CELL = 14; // CSS px per dissolve block — roughly the art's own pixel size at desktop widths
const DURATION = 900;

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
 * A full-bleed pixel-art scene. Changing `scene` plays a pixel dissolve: the next image is
 * revealed block by block in random order on a canvas, then handed to the <img>. The whole
 * stack drifts slowly (Ken Burns); both stop under reduced motion.
 */
export function SceneStage({ scene, dim = false, className, children }: { scene: Scene; dim?: boolean; className?: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(scene);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const clearOnLoad = useRef(false);
  const token = useRef(0);

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
        const cells: [number, number][] = [];
        for (let y = 0; y < H; y += c) for (let x = 0; x < W; x += c) cells.push([x, y]);
        for (let i = cells.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cells[i], cells[j]] = [cells[j], cells[i]];
        }

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
      <div className={cn('pointer-events-none absolute inset-0 bg-[#0c0a09] transition-opacity duration-700', dim ? 'opacity-45' : 'opacity-0')} aria-hidden />
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
