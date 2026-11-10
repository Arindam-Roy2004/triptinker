import { sceneSrc, sceneSrcSet, type Scene } from './scenes';

/** Use the same responsive candidate in the preload, canvas and displayed image. */
export const SCENE_SIZES = '(min-width: 1104px) 1104px, 100vw';

type LoadedImage = { probe: HTMLImageElement; ready: Promise<HTMLImageElement> };
const images = new Map<string, LoadedImage>();
const CACHE_LIMIT = 4;

/**
 * Re-open the file the browser picked, without srcset. A srcset image reports a density-corrected
 * natural size (1104px for a 1920px file in a 1104px slot) while drawImage crops in file pixels,
 * so the dissolve painted a zoomed-in crop before snapping to the real framing. The plain copy
 * comes from the image cache and its natural size is the file's.
 */
function plainCopy(chosen: HTMLImageElement): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = chosen.currentSrc || chosen.src;
  return image.decode().then(() => image);
}

const warming = new Map<number, Promise<void>>();
const warmImages = new Set<HTMLImageElement>();

/**
 * Fetches a scene's chosen file into the browser cache at low priority, without decoding it,
 * so browsing past the preloaded neighbours responds as quickly as browsing to them.
 */
export function warmScene(scene: Scene): Promise<void> {
  const known = warming.get(scene.id);
  if (known) return known;
  const image = new Image();
  image.fetchPriority = 'low';
  image.decoding = 'async';
  warmImages.add(image); // keep it referenced so the fetched copy stays in the page's image cache
  const done = new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => {
      warming.delete(scene.id);
      warmImages.delete(image);
      resolve();
    };
  });
  warming.set(scene.id, done);
  image.sizes = SCENE_SIZES;
  image.srcset = sceneSrcSet(scene);
  image.src = sceneSrc(scene, 1920);
  return done;
}

const luminance = new Map<string, number>();

/** Mean relative luminance (0–1) of a decoded scene, from a tiny downscaled copy. */
export function sceneLuminance(image: HTMLImageElement): number {
  const key = image.currentSrc || image.src;
  const known = luminance.get(key);
  if (known !== undefined) return known;
  let value = 0.45;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      value = sum / (data.length / 4) / 255;
    }
  } catch {
    // Keep the middle value; the veil still works, just without adapting to the scene.
  }
  luminance.set(key, value);
  return value;
}

/** Decode before animating; retain a small working set rather than all full-size scenes. */
export function loadSceneImage(scene: Scene, priority: 'high' | 'low' = 'high'): Promise<HTMLImageElement> {
  const key = `${scene.id}:${window.innerWidth}:${window.devicePixelRatio}`;
  const cached = images.get(key);
  if (cached) {
    if (priority === 'high') cached.probe.fetchPriority = priority;
    images.delete(key);
    images.set(key, cached);
    return cached.ready;
  }

  // The browser chooses the candidate here exactly as for the head preload and the <img>.
  const probe = new Image();
  probe.decoding = 'async';
  probe.fetchPriority = priority;
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    probe.onload = () => plainCopy(probe).then(resolve, reject);
    probe.onerror = () => reject(new Error(`Could not load scene ${scene.id}`));
  });
  const entry = { probe, ready };
  images.set(key, entry);
  while (images.size > CACHE_LIMIT) images.delete(images.keys().next().value!);
  // A failed preload must be retryable when the traveller navigates to it.
  void ready.catch(() => {
    if (images.get(key) === entry) images.delete(key);
  });
  probe.sizes = SCENE_SIZES;
  probe.srcset = sceneSrcSet(scene);
  probe.src = sceneSrc(scene, 1920);
  return ready;
}
