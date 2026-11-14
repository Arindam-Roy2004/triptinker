/**
 * A soft keyboard "thock" while the user types into a text field.
 *
 * The clips are a nine-key sprite cut from Aceternity's keyboard sound pack
 * (CherryMX Black, ABS keycaps): the six deepest letter keys, plus Shift for space,
 * Enter and Backspace. They are downsampled to 22 kHz and RMS-matched (public/sounds/keys.wav).
 * Playback goes through a low-pass filter and a slight pitch drop, so it stays low and gentle.
 */

const SPRITE_URL = '/sounds/keys.wav';

/** [offsetSeconds, durationSeconds] within the sprite. */
type Clip = readonly [number, number];
const CLIPS = {
  key: [
    [0, 0.095],
    [0.115, 0.088],
    [0.223, 0.09],
    [0.333, 0.094],
    [0.4469, 0.08],
    [0.5469, 0.102],
  ],
  space: [[0.6689, 0.133]],
  enter: [[0.8219, 0.117]],
  backspace: [[0.9589, 0.11]],
} as const satisfies Record<string, readonly Clip[]>;

/** Overall loudness. The clips are normalised, so this alone sets how present the sound is. */
const VOLUME = 0.4;
/** Cuts the bright click and leaves the body of the keypress. */
const LOWPASS_HZ = 1800;
/** Ignore keypresses closer together than this, so fast typing never turns into a rattle. */
const MIN_GAP_MS = 28;

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return !target.disabled && !target.readOnly;
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type) && !target.disabled && !target.readOnly;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

function clipFor(event: KeyboardEvent): readonly Clip[] | null {
  if (event.key === ' ') return CLIPS.space;
  if (event.key === 'Enter') return CLIPS.enter;
  if (event.key === 'Backspace' || event.key === 'Delete') return CLIPS.backspace;
  if (event.key.length === 1) return CLIPS.key;
  return null; // arrows, Tab, Shift, Escape and other keys that don't type anything
}

let installed = false;

/** Listens for typing anywhere on the page. Safe to call more than once. */
export function installTypingSound() {
  if (installed || typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
  installed = true;

  let loading: Promise<void> | null = null;
  let context: AudioContext | null = null;
  let output: AudioNode | null = null;
  let buffer: AudioBuffer | null = null;
  let lastPlayed = 0;

  // Fetch and decode the sprite when a text field first gets focus, so it is ready by the first
  // keypress. An OfflineAudioContext can decode before any user gesture; the buffer it makes plays
  // in any context.
  const preload = () => {
    loading ??= fetch(SPRITE_URL)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((bytes) => (bytes ? new OfflineAudioContext(1, 1, 22050).decodeAudioData(bytes) : null))
      .then((decoded) => {
        buffer = decoded;
      })
      .catch(() => {
        // A missing or undecodable sprite just means a silent keyboard.
      });
  };

  // An AudioContext may only start after a user gesture, and a keypress counts.
  const ensureAudio = () => {
    preload();
    if (!context) {
      context = new AudioContext();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = LOWPASS_HZ;
      filter.Q.value = 0.5;
      const gain = context.createGain();
      gain.gain.value = VOLUME;
      filter.connect(gain).connect(context.destination);
      output = filter;
    }
    if (context.state === 'suspended') void context.resume();
  };

  const play = (clips: readonly Clip[]) => {
    if (!context || !output || !buffer) return;
    const [offset, duration] = clips[Math.floor(Math.random() * clips.length)]!;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // A touch lower than recorded, and never exactly the same twice.
    source.playbackRate.value = 0.86 + Math.random() * 0.08;
    const hit = context.createGain();
    hit.gain.value = 0.8 + Math.random() * 0.2;
    source.connect(hit).connect(output);
    source.start(0, offset, duration);
    source.onended = () => hit.disconnect();
  };

  document.addEventListener(
    'focusin',
    (event) => {
      if (isTypingTarget(event.target)) preload();
    },
    { passive: true },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!isTypingTarget(event.target)) return;
      const clips = clipFor(event);
      if (!clips) return;
      const now = performance.now();
      if (now - lastPlayed < MIN_GAP_MS) return;
      lastPlayed = now;
      ensureAudio();
      play(clips);
    },
    { capture: true, passive: true },
  );
}
