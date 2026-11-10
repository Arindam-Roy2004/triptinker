/**
 * The scene library: pixel-art wonders shown behind the prompt. Every visit steps to the
 * next one (both themes use all ten), and a generated destination with a matching scene
 * switches to it.
 */

export type Scene = {
  id: number;
  name: string;
  place: string;
  time: 'day' | 'night';
  /** Lower-case words that, found in a generated destination, make this the matching scene. */
  match: string[];
};

export const SCENES: Scene[] = [
  { id: 1, name: 'Yosemite Valley', place: 'California, USA', time: 'day', match: ['yosemite', 'half dome', 'sierra nevada', 'california'] },
  { id: 2, name: 'Eiffel Tower', place: 'Paris, France', time: 'night', match: ['paris', 'france'] },
  { id: 3, name: 'Iguazú Falls', place: 'Argentina · Brazil', time: 'day', match: ['iguazu', 'iguazú', 'iguaçu', 'foz do', 'argentina', 'brazil', 'brasil'] },
  { id: 4, name: 'Mount Everest', place: 'Nepal', time: 'night', match: ['everest', 'nepal', 'kathmandu', 'himalaya', 'tibet'] },
  { id: 5, name: 'Mount Rushmore', place: 'South Dakota, USA', time: 'day', match: ['rushmore', 'south dakota', 'black hills'] },
  { id: 6, name: 'Grand Canyon', place: 'Arizona, USA', time: 'day', match: ['grand canyon', 'arizona', 'sedona', 'flagstaff', 'utah'] },
  { id: 7, name: 'Fitz Roy', place: 'Patagonia, Argentina', time: 'night', match: ['patagonia', 'fitz roy', 'el chaltén', 'el chalten', 'torres del paine', 'chile'] },
  { id: 8, name: 'Colosseum', place: 'Rome, Italy', time: 'night', match: ['rome', 'roma', 'italy', 'italia', 'florence', 'venice'] },
  { id: 9, name: 'Taj Mahal', place: 'Agra, India', time: 'night', match: ['agra', 'taj mahal', 'india', 'delhi', 'jaipur', 'rajasthan'] },
  { id: 10, name: 'Cascade Volcano', place: 'Pacific Northwest', time: 'day', match: ['oregon', 'washington state', 'seattle', 'portland', 'rainier', 'mount hood', 'cascades'] },
];

export const sceneSrc = (scene: Scene, width: 960 | 1920) => `/scenes/scene-${scene.id}-${width}.webp`;
export const sceneSrcSet = (scene: Scene) => `${sceneSrc(scene, 960)} 960w, ${sceneSrc(scene, 1920)} 1920w`;

/** Whole words only: a brief about a "romantic" weekend is not a trip to Roma. */
function hasWord(text: string, word: string) {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    const before = text[at - 1];
    const after = text[at + word.length];
    if (!(before && /\p{L}/u.test(before)) && !(after && /\p{L}/u.test(after))) return true;
  }
  return false;
}

/** The scene that matches a destination name or a brief, if any (longest keyword wins). */
export function sceneForDestination(destination: string): Scene | null {
  const text = destination.toLowerCase();
  let best: { scene: Scene; length: number } | null = null;
  for (const scene of SCENES) {
    for (const word of scene.match) {
      if (hasWord(text, word) && (!best || word.length > best.length)) best = { scene, length: word.length };
    }
  }
  return best?.scene ?? null;
}

/**
 * How one scene gives way to the next, so the pixels move the way the change was asked for:
 *  - `ripple`: spreads out from a point (as a fraction of the stage), used when the prompt picks the scene.
 *  - `wipe`: sweeps across from one side, used when browsing. Next comes in from the right, previous from the left.
 */
export type SceneTransition = { kind: 'ripple'; x: number; y: number } | { kind: 'wipe'; from: 'left' | 'right' };
/** A ripple from where the prompt card sits in the stage. */
export const FROM_PROMPT = { kind: 'ripple', x: 0.5, y: 0.74 } as const satisfies SceneTransition;
