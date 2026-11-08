import { CircleNotch, Microphone, Stop } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Shimmer } from '@/components/ai/shimmer';
import { formatElapsed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MAX_RECORDING_MS, useVoiceInput } from '../use-voice-input';

type Props = {
  /** Receives the transcript; the caller decides how it joins what is already typed. */
  onText: (text: string) => void;
  disabled?: boolean;
  /** Matches the send button next to it. */
  size?: 8 | 9;
  /** Told when recording or transcribing starts and ends, so the field can quiet its own hints. */
  onActiveChange?: (active: boolean) => void;
};

const ease = [0.22, 1, 0.36, 1] as const;
const BARS = 5;

/**
 * Press to speak, press again to stop. While it listens, a pill beside the button shows the
 * microphone's live level and the time; the words then land in the text field for the
 * traveller to check and edit. This button never sends anything to the planner by itself.
 */
export function MicButton({ onText, disabled, size = 8, onActiveChange }: Props) {
  const reduce = !!useReducedMotion();
  const voice = useVoiceInput(onText);
  const recording = voice.state === 'recording';
  const busy = voice.state === 'transcribing';
  const { cancel } = voice;
  const active = recording || busy;
  useEffect(() => onActiveChange?.(active), [active, onActiveChange]);

  // Escape throws a recording away.
  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, cancel]);

  const label = recording ? 'Stop recording' : busy ? 'Transcribing' : 'Speak your request';
  const fade = reduce ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, x: 8, filter: 'blur(4px)' }, animate: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: { opacity: 0, x: 8, filter: 'blur(4px)' } };

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="popLayout" initial={false}>
        {recording && (
          <motion.div key="live" {...fade} transition={{ duration: 0.25, ease }} className="flex h-8 items-center gap-2 rounded-lg bg-err-wash px-2.5 text-err" aria-hidden>
            <LiveBars analyser={voice.analyser} reduce={reduce} />
            <Elapsed since={voice.startedAt} />
          </motion.div>
        )}
        {busy && (
          <motion.div key="busy" {...fade} transition={{ duration: 0.25, ease }} aria-live="polite">
            <Shimmer as="span" duration={1.6} className="text-[12px] font-medium">
              Transcribing…
            </Shimmer>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={recording ? voice.stop : () => void voice.start()}
        disabled={(disabled && !recording) || busy}
        aria-label={label}
        aria-pressed={recording}
        title={recording ? 'Stop recording (Esc to discard)' : busy ? undefined : 'Speak your request'}
        className={cn(
          'relative grid shrink-0 place-items-center rounded-lg border transition-[background-color,color,border-color,transform] duration-200 active:scale-95 disabled:opacity-60',
          size === 9 ? 'size-9' : 'size-8',
          recording ? 'border-err bg-err text-white' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
        )}
      >
        {/* Two soft rings ripple out while it listens; with reduced motion the stop square alone says so. */}
        {recording &&
          !reduce &&
          [0, 0.7].map((delay) => (
            <motion.span
              key={delay}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-lg border border-err"
              initial={{ scale: 1, opacity: 0.55 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 1.4, delay, repeat: Infinity, ease: 'easeOut' }}
            />
          ))}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={voice.state}
            className="relative grid place-items-center"
            initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -45, filter: 'blur(2px)' }}
            animate={{ scale: 1, opacity: 1, rotate: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { scale: 0.4, opacity: 0, rotate: 45, filter: 'blur(2px)' }}
            transition={{ duration: 0.22, ease }}
          >
            {recording ? <Stop size={13} weight="fill" /> : busy ? <CircleNotch size={16} className="animate-spin" /> : <Microphone size={16} weight="regular" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}

/** Five bars that follow the voice: the middle ones take the speech band, the outer ones its edges. */
function LiveBars({ analyser, reduce }: { analyser: AnalyserNode | null; reduce: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    // Bins up to ~4 kHz carry speech; split them into bands and mirror them, loudest in the middle.
    const usable = Math.max(BARS, Math.floor((4000 / (analyser.context.sampleRate / 2)) * analyser.frequencyBinCount));
    const order = [3, 1, 0, 2, 4];
    let frame = 0;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const band = Math.floor(usable / BARS);
      for (let b = 0; b < BARS; b++) {
        let sum = 0;
        for (let i = 1 + b * band; i < 1 + (b + 1) * band; i++) sum += data[i];
        const level = Math.min(1, sum / band / 170);
        const el = bars.current[order[b]];
        if (el) el.style.transform = `scaleY(${0.2 + level * 0.8})`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return (
    <span className="flex h-4 items-center gap-[3px]">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          style={{ transform: 'scaleY(0.2)', animationDelay: `${i * 120}ms` }}
          className={cn(
            'h-4 w-[3px] origin-center rounded-full bg-current transition-transform duration-75',
            // No level to show (the meter could not start): a gentle idle wave instead.
            !analyser && !reduce && 'animate-[voice-bar_1s_ease-in-out_infinite]',
          )}
        />
      ))}
    </span>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = MAX_RECORDING_MS - (now - since);
  return <span className={cn('tabular text-[12px] font-medium', left < 10_000 && 'text-warn')}>{formatElapsed(now - since)}</span>;
}
