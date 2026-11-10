import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CELL, LightField, MOTION, hexColor, veilAlpha } from './pixel-motion';
import { SCENE_SIZES, loadSceneImage, sceneLuminance, warmScene } from './scene-images';
import { FROM_PROMPT, SCENES, sceneSrc, sceneSrcSet, type Scene, type SceneTransition } from './scenes';

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

const saveData = () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '');
};

/** The light takes the theme's clay accent: the colour of the running ring and the stop button. */
const accentOf = (element: Element) => hexColor(getComputedStyle(element).getPropertyValue('--clay'), [217, 119, 87]);

/** What the dissolve canvas holds: nothing, an interrupted dissolve, or a finished one awaiting the <img>. */
type Painted = 'none' | 'partial' | 'handoff';

/**
 * A full-bleed pixel-art scene. The pixels only move for a reason, and every effect shares the
 * motion system in pixel-motion.ts:
 *
 *  - Changing `scene` plays a dissolve shaped by `transition` (a ripple from the prompt, or a
 *    wipe in the direction being browsed). Arriving pixels catch a soft light, then the finished
 *    image is handed to the <img>. A new change mid-dissolve continues from what is on screen.
 *  - `dim` (a plan is being written) spreads a veil from the prompt card behind a ring of light,
 *    keeps a twinkle and a pulse in time with the running ring going while the work runs, and
 *    lifts the same way when it ends.
 *
 * The light is one field over the frame (pixel-motion.ts), drawn like PixelButton: gapped pixels,
 * each with its own colour and brightness, lit at random as a front passes, then decaying.
 *
 * `onReveal` fires when a scene starts to appear, so a caption can change with the picture.
 * The whole stack drifts slowly (Ken Burns). Reduced motion switches once the image is ready.
 */
export function SceneStage({
  scene,
  dim = false,
  transition = FROM_PROMPT,
  onReveal,
  className,
  children,
}: {
  scene: Scene;
  dim?: boolean;
  transition?: SceneTransition;
  onReveal?: (scene: Scene) => void;
  className?: string;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(scene);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLCanvasElement>(null);
  const light = useRef<LightField | null>(null);
  const painted = useRef<Painted>('none');
  const clearOnLoad = useRef(false);
  const token = useRef(0);
  const transitionRef = useRef(transition);
  transitionRef.current = transition;
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const veilOn = useRef(false);

  useEffect(() => {
    if (lightRef.current) light.current = new LightField(lightRef.current);
    return () => light.current?.stop();
  }, []);

  // Preload: the current scene, then its neighbours, then (when idle) every other scene, so each
  // browse responds with the same timing instead of waiting on the network further out.
  useEffect(() => {
    if (saveData()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void loadSceneImage(scene)
      .then(() => {
        if (cancelled) return;
        timer = setTimeout(async () => {
          const at = SCENES.findIndex((candidate) => candidate.id === scene.id);
          for (const delta of [-1, 1]) void loadSceneImage(SCENES[(at + delta + SCENES.length) % SCENES.length], 'low').catch(() => undefined);
          for (let step = 2; step <= SCENES.length / 2 && !cancelled; step++) {
            for (const delta of [step, -step]) {
              if (cancelled) return;
              await warmScene(SCENES[(at + delta + SCENES.length) % SCENES.length]);
            }
          }
        }, 150);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scene]);

  // The veil's strength follows the scene on screen: bright scenes need more than night scenes.
  useEffect(() => {
    let cancelled = false;
    void loadSceneImage(shown)
      .then((img) => {
        const field = light.current;
        if (cancelled || !field) return;
        field.alpha = veilAlpha(sceneLuminance(img));
        field.repaint();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shown]);

  // The working veil.
  useEffect(() => {
    const field = light.current;
    const frame = frameRef.current;
    if (!field || !frame) return;
    // Nothing to lift on first render, or after a run that never dimmed the scene.
    if (!dim && !veilOn.current) return;
    veilOn.current = dim;
    field.resize(frame.clientWidth, frame.clientHeight, accentOf(frame));
    if (reduce) {
      field.settle(dim);
      return;
    }
    // A veil front still travelling is replaced, so a quick stop turns the veil around mid-way.
    field.front({ kind: 'ring', x: FROM_PROMPT.x, y: FROM_PROMPT.y }, dim ? MOTION.veilIn : MOTION.veilOut, dim);
    const timer = dim ? setTimeout(() => field.working({ x: FROM_PROMPT.x, y: FROM_PROMPT.y }), MOTION.veilIn.duration) : undefined;
    return () => {
      clearTimeout(timer);
      field.working(null);
    };
  }, [dim, reduce]);

  // The scene dissolve.
  useEffect(() => {
    if (scene.id === shown.id && painted.current !== 'partial') return;
    const run = ++token.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    let raf = 0;
    let handedOff = false;
    clearOnLoad.current = false;
    // Continuing an interrupted dissolve skips the pause: the scene is already in motion.
    const resumed = painted.current !== 'none';

    const clearCanvas = () => {
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      painted.current = 'none';
    };

    loadSceneImage(scene)
      .then((img) => {
        if (run !== token.current) return;
        if (reduce || !canvas || !frame) {
          clearCanvas();
          onRevealRef.current?.(scene);
          setShown(scene);
          return;
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.round(frame.clientWidth * dpr);
        const H = Math.round(frame.clientHeight * dpr);
        // Resizing clears a canvas, so only do it when the frame actually changed size.
        if (canvas.width !== W || canvas.height !== H) {
          canvas.width = W;
          canvas.height = H;
          painted.current = 'none';
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onRevealRef.current?.(scene);
          return setShown(scene);
        }
        ctx.imageSmoothingEnabled = false;

        // object-fit: cover mapping from canvas space back into the source image.
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const ox = (W - img.naturalWidth * s) / 2;
        const oy = (H - img.naturalHeight * s) / 2;
        const c = Math.ceil(CELL * dpr);
        const cols = Math.ceil(W / c);
        const rows = Math.ceil(H / c);
        const order = cellOrder(cols, rows, transitionRef.current);
        const motion = transitionRef.current.kind === 'wipe' ? MOTION.wipe : MOTION.ripple;
        const field = light.current;

        let drawn = 0;
        let revealed = false;
        const start = performance.now() + (resumed ? 0 : motion.delay);
        const tick = (now: number) => {
          if (run !== token.current) return;
          const t = Math.min(1, Math.max(0, (now - start) / motion.duration));
          const target = Math.floor(motion.ease(t) * order.length);
          if (target > drawn && !revealed) {
            revealed = true;
            onRevealRef.current?.(scene);
            field?.resize(frame.clientWidth, frame.clientHeight, accentOf(frame));
          }
          for (; drawn < target; drawn++) {
            const i = order[drawn];
            const x = (i % cols) * c;
            const y = Math.floor(i / cols) * c;
            ctx.drawImage(img, (x - ox) / s, (y - oy) / s, c / s, c / s, x, y, c, c);
            // Arriving pixels catch the light, exactly on the dissolve's edge.
            field?.spark(x / dpr, y / dpr, c / dpr, motion.glow * (1 - 0.4 * t));
          }
          if (drawn) painted.current = 'partial';
          if (t < 1) {
            raf = requestAnimationFrame(tick);
            return;
          }
          handedOff = true;
          if (scene.id === shown.id) {
            // Came back to the scene already in the <img>: the canvas now matches it exactly.
            clearCanvas();
          } else {
            painted.current = 'handoff';
            clearOnLoad.current = true;
            setShown(scene);
          }
        };
        raf = requestAnimationFrame(tick);
      })
      // Keep the last painted scene on failure. A later navigation can retry the image.
      .catch(() => undefined);

    return () => {
      cancelAnimationFrame(raf);
      // Invalidate pending loads, including when returning to the shown scene. The canvas keeps
      // what it has painted so far; the next dissolve continues over it instead of jumping back.
      if (!handedOff) token.current = run + 1;
    };
  }, [scene, shown.id, reduce]);

  return (
    <div ref={frameRef} className={cn('relative isolate overflow-hidden bg-[#2b3a3a]', className)}>
      <div className="pointer-events-none absolute inset-0 animate-drift will-change-transform" aria-hidden>
        <img
          key={shown.id}
          src={sceneSrc(shown, 1920)}
          srcSet={sceneSrcSet(shown)}
          sizes={SCENE_SIZES}
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
              painted.current = 'none';
            };
            img
              .decode()
              .catch(() => undefined)
              .then(() => requestAnimationFrame(() => requestAnimationFrame(clear)));
          }}
          className="absolute inset-0 size-full object-cover"
        />
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
        {/* Inside the drift, so the light lines up with the dissolve it follows. */}
        <canvas ref={lightRef} width={1} height={1} className="absolute top-0 left-0" />
      </div>
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
      <SceneArrow label="Previous scene" shortcut="←" keys="ArrowLeft" onClick={onPrev} className="ml-1">
        <CaretLeft size={12} />
      </SceneArrow>
      <SceneArrow label="Next scene" shortcut="→" keys="ArrowRight" onClick={onNext}>
        <CaretRight size={12} />
      </SceneArrow>
    </div>
  );
}

/** A caption arrow. Its tooltip names the keyboard shortcut, as Undo and Redo do. */
function SceneArrow({ label, shortcut, keys, onClick, className, children }: { label: string; shortcut: string; keys: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} aria-label={label} aria-keyshortcuts={keys} className={cn('grid size-6 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10', className)}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <span className="ml-2 opacity-60">{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}
