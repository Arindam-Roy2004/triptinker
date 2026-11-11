/**
 * One motion system for every pixel effect on the scene: the browse wipe, the ripple from the
 * prompt, and the quiet light that marks a plan being written. They share curves, durations and
 * one light field, built on the same recipe as PixelButton (the Save trip button): gapped pixels,
 * each with its own brightness tier, lit at random as a front passes, then decaying.
 *
 * Restraint, after Aceternity's Pixel Prompt Button: the light is a pale tint of the scene, never
 * a new hue; a press sends one soft ripple, and work in progress is a sparse twinkle. The scene
 * is never darkened, and nothing repeats on a timer.
 */

/** CSS px per dissolve block for the scene image itself (the artwork's own pixel scale). */
export const CELL = 8;

/** CSS-style cubic-bezier easing, solved for x with Newton's method plus a bisection fallback. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let t = progress;
    for (let i = 0; i < 6; i++) {
      const error = x(t) - progress;
      const slope = dx(t);
      if (Math.abs(error) < 1e-5) return y(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = progress;
    for (let i = 0; i < 20; i++) {
      if (x(t) < progress) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return y(t);
  };
}

export const EASE = {
  /**
   * Leaves the prompt quickly, then settles (ease-out cubic). Material's emphasized decelerate
   * was tried first: it fires most cells in the first frames, so the front read as a fog, not a ring.
   */
  out: cubicBezier(0.33, 1, 0.68, 1),
  /** A symmetric sweep for browsing, so the wipe has a clear middle. */
  sweep: cubicBezier(0.65, 0, 0.35, 1),
};

export type PixelMotion = { delay: number; duration: number; ease: (t: number) => number; glow: number };

export const MOTION = {
  /** Browsing: a beat after the click, then an unhurried sweep the eye can follow. */
  wipe: { delay: 140, duration: 950, ease: EASE.sweep, glow: 0.6 },
  /** A destination matched from the prompt: spreads from the card. */
  ripple: { delay: 0, duration: 800, ease: EASE.out, glow: 0.7 },
  /** A plan starts: one soft ripple from the card, slower and fainter than a scene change. Once. */
  start: { delay: 0, duration: 1200, ease: EASE.out, glow: 0.75 },
} satisfies Record<string, PixelMotion>;

/**
 * While a plan is written: sparks per cell per second. Over a ~16k-cell scene this lights about
 * eighty pixels a second, each fading in under half a second: a quiet shimmer, not a sparkler.
 */
const TWINKLE = 0.005;

/** PixelButton's light decay, so the scene and the buttons fade at one rate. */
const DECAY = 420;
/** The button's 4-on-5 grid, scaled for a surface many times larger. */
const GRID = 6;
const PIXEL = 5;
/** Half-width of the band around a front in which pixels can light. */
const BAND = 18;
/** How far a ring overshoots the farthest corner, so its band clears the frame by the end. */
const OVERSHOOT = 46;

type Rgb = [number, number, number];

/** Parses `#rrggbb` (as the theme tokens are written), or returns the fallback. */
export function hexColor(value: string, fallback: Rgb): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : fallback;
}

/** Mixes a colour towards white by `amount` (0–1). */
const toward = ([r, g, b]: Rgb, amount: number): Rgb => [r, g, b].map((v) => Math.round(v + (255 - v) * amount)) as Rgb;

/**
 * Light, not colour: each pixel is white, a warm white, or a pale wash of the theme's running
 * colour (dusty blue). Like the Pixel Prompt Button's lighter tints of its own blue, it lifts the
 * scene under it rather than painting a new hue over it.
 */
function palette(running: Rgb): { rgb: Rgb; weight: number }[] {
  return [
    { rgb: [255, 255, 255], weight: 0.5 },
    { rgb: toward(running, 0.65), weight: 0.3 },
    { rgb: [255, 247, 236], weight: 0.2 }, // warm white
  ];
}

/** PixelButton's peak tiers, kept soft: most pixels brighten a little, a few catch the light. */
const peakTier = () => {
  const value = Math.random();
  return value < 0.45 ? 0.3 : value < 0.75 ? 0.45 : value < 0.93 ? 0.62 : 0.8;
};

export type Wave = { kind: 'ring'; x: number; y: number };

type Front = { wave: Wave; motion: PixelMotion; start: number };

/**
 * The light field over a scene. Cells sit on a 6px grid; each holds a gapped 5px light pixel.
 * Fronts travel out as rings, `spark` lights a dissolve's edge, and `working` keeps a sparse
 * twinkle going; lit pixels decay. It runs its own frame loop only while something changes.
 */
export class LightField {
  private readonly ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private cols = 0;
  private rows = 0;
  private ox = 0;
  private oy = 0;
  private colors: string[] = [];
  private colorOf = new Uint8Array(0);
  private peak = new Float32Array(0);
  private light = new Float32Array(0);
  private paintedLight = new Float32Array(0);
  private fronts: Front[] = [];
  private raf = 0;
  private last = 0;
  private spawnDebt = 0;
  private twinkling = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  /** While a plan is written: a sparse twinkle over the scene. Lit pixels fade out on their own when it stops. */
  working(on: boolean) {
    this.twinkling = on;
    if (on) this.kick();
  }

  /** Sizes the field to the frame, in CSS px. Keeps state when the size is unchanged. */
  resize(width: number, height: number, signal: Rgb) {
    const choices = palette(signal);
    this.colors = choices.map(({ rgb }) => `${rgb[0]} ${rgb[1]} ${rgb[2]}`);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * density);
    this.canvas.height = Math.round(height * density);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx?.setTransform(density, 0, 0, density, 0, 0);
    this.cols = Math.ceil(width / GRID);
    this.rows = Math.ceil(height / GRID);
    this.ox = (width - this.cols * GRID) / 2;
    this.oy = (height - this.rows * GRID) / 2;
    const n = this.cols * this.rows;
    this.colorOf = new Uint8Array(n);
    this.peak = new Float32Array(n);
    this.light = new Float32Array(n);
    this.paintedLight = new Float32Array(n);
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    for (let i = 0; i < n; i++) {
      let pick = Math.random() * total;
      let c = 0;
      while (c < choices.length - 1 && (pick -= choices[c].weight) > 0) c++;
      this.colorOf[i] = c;
      this.peak[i] = peakTier();
    }
    this.fronts = [];
    this.ctx?.clearRect(0, 0, width, height);
  }

  /** Starts a front. Rings are given as fractions of the frame (0–1). */
  front(wave: Wave, motion: PixelMotion, now = performance.now()) {
    if (!this.cols) return;
    const at = { ...wave, x: wave.x * this.width, y: wave.y * this.height };
    this.fronts.push({ wave: at, motion, start: now + motion.delay });
    this.kick();
  }

  /**
   * Lights pixels at random inside a square (CSS px), e.g. where a dissolve just revealed the new
   * scene, so the light sits exactly on the moving edge.
   */
  spark(x: number, y: number, size: number, strength: number) {
    if (!this.cols) return;
    const c0 = Math.max(0, Math.floor((x - this.ox) / GRID));
    const r0 = Math.max(0, Math.floor((y - this.oy) / GRID));
    const c1 = Math.min(this.cols - 1, Math.floor((x + size - this.ox) / GRID));
    const r1 = Math.min(this.rows - 1, Math.floor((y + size - this.oy) / GRID));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * this.cols + c;
        if (Math.random() < 0.55) this.light[i] = Math.max(this.light[i], this.peak[i] * strength);
      }
    }
    this.kick();
  }


  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private reach(wave: Wave) {
    return Math.hypot(Math.max(wave.x, this.width - wave.x), Math.max(wave.y, this.height - wave.y)) || 1;
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    const elapsed = Math.min(48, this.last ? now - this.last : 16.67);
    this.last = now;
    const step = elapsed / 16.67;
    const n = this.cols * this.rows;
    const fade = Math.exp(-elapsed / DECAY);
    for (let i = 0; i < n; i++) {
      if (this.light[i] > 0) {
        this.light[i] *= fade;
        if (this.light[i] < 0.01) this.light[i] = 0;
      }
    }

    if (this.twinkling && n) {
      this.spawnDebt += (TWINKLE * n * elapsed) / 1000;
      for (; this.spawnDebt >= 1; this.spawnDebt--) {
        const i = Math.floor(Math.random() * n);
        this.light[i] = Math.max(this.light[i], this.peak[i] * 0.8);
      }
    }

    this.fronts = this.fronts.filter((front) => {
      const t = (now - front.start) / front.motion.duration;
      if (t < 0) return true;
      const p = front.motion.ease(Math.min(1, t));
      const span = this.reach(front.wave);
      const radius = p * (span + OVERSHOOT);
      const strength = front.motion.glow * (1 - p * 0.55);
      for (let i = 0; i < n; i++) {
        const x = this.ox + (i % this.cols) * GRID + GRID / 2;
        const y = this.oy + Math.floor(i / this.cols) * GRID + GRID / 2;
        const d = Math.hypot(x - front.wave.x, y - front.wave.y);
        if (Math.abs(d - radius) < BAND && Math.random() < 0.45 * step) {
          this.light[i] = Math.max(this.light[i], this.peak[i] * strength);
        }
      }
      return t < 1;
    });

    const lit = this.paint();
    if (lit || this.fronts.length || this.twinkling) this.kick();
    else this.last = 0;
  };

  /** Draws the cells that changed since the last paint. Returns whether any light remains. */
  private paint() {
    const ctx = this.ctx;
    if (!ctx) return false;
    const inset = (GRID - PIXEL) / 2;
    let lit = false;
    for (let i = 0; i < this.cols * this.rows; i++) {
      const light = this.light[i];
      if (light > 0) lit = true;
      if (Math.abs(light - this.paintedLight[i]) < 0.008) continue;
      this.paintedLight[i] = light;
      const x = this.ox + (i % this.cols) * GRID;
      const y = this.oy + Math.floor(i / this.cols) * GRID;
      ctx.clearRect(x, y, GRID, GRID);
      if (light > 0) {
        ctx.fillStyle = `rgb(${this.colors[this.colorOf[i]]} / ${Math.min(0.8, light).toFixed(3)})`;
        ctx.fillRect(x + inset, y + inset, PIXEL, PIXEL);
      }
    }
    return lit;
  }
}
