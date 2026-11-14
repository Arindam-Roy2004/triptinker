import { ArrowUp, Minus, Plus, SlidersHorizontal } from '@phosphor-icons/react';
import { AnimateIcon } from '@animate-ui/react/icons';
import { Cancel01 } from '@/components/animate-ui/icons/hugeicons/cancel-01';
import { useReducedMotion } from 'motion/react';
import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { LIMITS, PACES, type Pace } from '@triptinker/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RunningRing } from '@/components/ui/running-ring';
import { SlidingNumber } from '@/components/ui/sliding-number';
import { cn } from '@/lib/utils';
import { appendSpoken } from '../use-voice-input';
import { HighlightedText, HighlightMirror } from './highlight-mirror';
import { MicButton } from './mic-button';

export type TripOptions = { days: number | null; pace: Pace };

const PACE_LABEL: Record<Pace, string> = { relaxed: 'Relaxed', balanced: 'Balanced', packed: 'Full days' };

type Ghost = { text: string; line: number; typing: boolean; fading: boolean };

const TYPE_MS = 34; // per character, with a little jitter so it doesn't tick like a metronome
const HOLD_MS = 2600; // a finished example stays long enough to read
const FADE_MS = 320; // then it fades out, rather than being backspaced
const RESUME_MS = 1400; // after a hover ends, the held example lingers a beat before moving on

/**
 * Shows example prompts in the empty field, politely: each is typed once at a natural pace, held,
 * and faded out. Pausing (hover) completes the current example at once and holds it, so it never
 * freezes mid-word. After one pass through the examples it settles on the first as a static
 * placeholder. Progress survives pauses and re-renders; only `enabled` turning off hides it.
 */
function useTypewriter(lines: string[], enabled: boolean, paused: boolean): Ghost {
  const [ghost, setGhost] = useState<Ghost>({ text: '', line: 0, typing: false, fading: false });
  const pos = useRef({ line: 0, i: 0, settled: false });
  const key = lines.join('\n'); // content, not identity: a new array with the same examples is the same set

  useEffect(() => {
    if (!enabled || !lines.length) return;
    const p = pos.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (patch: Partial<Ghost>) => setGhost((prev) => ({ ...prev, line: p.line, ...patch }));
    const full = () => lines[p.line] ?? '';

    if (p.settled || paused) {
      p.i = full().length;
      show({ text: full(), typing: false, fading: false });
      return;
    }

    const type = () => {
      const line = full();
      if (p.i < line.length) {
        p.i += 1;
        show({ text: line.slice(0, p.i), typing: true, fading: false });
        timer = setTimeout(type, TYPE_MS + Math.random() * 30);
        return;
      }
      show({ typing: false });
      timer = setTimeout(fade, HOLD_MS);
    };
    const fade = () => {
      show({ fading: true });
      timer = setTimeout(() => {
        const last = p.line === lines.length - 1;
        p.line = (p.line + 1) % lines.length;
        if (last) {
          // One full pass: settle on the first example, shown whole and still.
          p.settled = true;
          p.i = full().length;
          show({ text: full(), typing: false, fading: false });
          return;
        }
        p.i = 0;
        show({ text: '', typing: false, fading: false });
        timer = setTimeout(type, 260);
      }, FADE_MS);
    };

    const done = p.i >= full().length && p.i > 0;
    timer = setTimeout(done ? fade : type, done ? RESUME_MS : p.i === 0 ? 700 : TYPE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `lines`
  }, [key, enabled, paused]);

  return enabled ? ghost : { ...ghost, text: '' };
}

/** True while `element` is on screen and the tab is visible: no point typing to nobody. */
function useOnScreen(element: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const el = element.current;
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    const observer = el ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting)) : null;
    if (el) observer?.observe(el);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [element]);
  return inView && tabVisible;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  running: boolean;
  /** Example prompts typed into the empty field. */
  typed: string[];
  label: string;
  /** Accessible name of the send button, e.g. "Plan this trip". */
  submitLabel: string;
  minLength: number;
  maxLength: number;
  options?: TripOptions;
  onOptionsChange?: (options: TripOptions) => void;
  error?: string | null;
  onClearError?: () => void;
  size?: 'hero' | 'compact';
  className?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Show the microphone: the server can transcribe speech and the browser can record it. */
  voice?: boolean;
};

export function PromptCard({
  value,
  onChange,
  onSubmit,
  onStop,
  running,
  typed,
  label,
  submitLabel,
  minLength,
  maxLength,
  options,
  onOptionsChange,
  error,
  onClearError,
  size = 'hero',
  className,
  inputRef,
  voice,
}: Props) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [listening, setListening] = useState(false);
  // While an IME is composing, the textarea shows its own ink: the mirror can't follow an uncommitted string.
  const [composing, setComposing] = useState(false);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const mirrored = !!value && !composing;
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const onScreen = useOnScreen(formRef);
  const fieldHeight = size === 'hero' ? 'min-h-22 md:min-h-12' : 'min-h-10';
  const ghost = useTypewriter(typed, !value && !focused && !reduce && !running && !listening && onScreen, hovered);
  const ghostRef = useRef<HTMLSpanElement>(null);

  // The example can be longer than the box on a narrow phone. Scroll it like a real field would, so
  // the line being typed stays in view and the text never spills onto the buttons below.
  useLayoutEffect(() => {
    const el = ghostRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.toggleAttribute('data-clipped', el.scrollTop > 0);
  }, [ghost.text]);

  useImperativeHandle(inputRef, () => localRef.current as HTMLTextAreaElement, []);

  const submit = () => {
    if (running) return;
    if (value.trim().length < minLength) {
      setShaking(true);
      localRef.current?.focus();
    }
    onSubmit(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey || !event.shiftKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn('w-full', className)}>
      <form
        ref={formRef}
        // A mouse over the card holds the example still; touch has no hover, and a tap focuses the field.
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        // A press on any empty part of the card (its padding, the space beside the options or
        // "Enter to send") goes to the field, as in a chat composer. Controls keep their own clicks.
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target === localRef.current || target.closest('button, a, input, textarea, select, label, [role="button"], [role="radiogroup"], [data-radix-popper-content-wrapper]')) return;
          event.preventDefault();
          localRef.current?.focus();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onAnimationEnd={() => setShaking(false)}
        className={cn(
          'relative flex flex-col gap-3 rounded-md bg-raised px-4 pt-4 pb-3 shadow-elevated transition-[box-shadow] duration-300',
          shaking && !reduce && 'animate-shake',
          // Typing: the full signal ring and a soft wash. Planning: a faint track that the dashes run along.
          running
            ? 'shadow-[0_0_0_1px_color-mix(in_oklab,var(--running)_45%,transparent),var(--elevated)]'
            : focused && 'shadow-[0_0_0_1px_var(--signal),0_0_0_4px_color-mix(in_oklab,var(--signal)_18%,transparent),var(--elevated)]',
        )}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {running && <RunningRing radius={8} />}
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <div className={cn('relative', fieldHeight)}>
          {mirrored && <HighlightMirror ref={mirrorRef} text={value} className="text-base leading-[22px] text-ink" />}
          <textarea
            id={id}
            ref={localRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (error) onClearError?.();
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            maxLength={maxLength}
            rows={size === 'hero' ? 2 : 1}
            aria-invalid={!!error}
            // Focusing keeps the example that was showing, so the text doesn't swap under the caret.
            placeholder={reduce || focused ? (typed[ghost.line] ?? typed[0]) : ''}
            // As tall as its area, so a click anywhere on the example text lands in the field.
            className={cn(
              'hl-field relative block max-h-48 w-full resize-none bg-transparent text-base leading-[22px] text-ink outline-none [field-sizing:content] placeholder:text-subtle focus-visible:outline-none',
              // The mirror behind draws the words; the textarea keeps the caret, selection and input.
              mirrored && 'no-scrollbar text-transparent caret-ink',
              fieldHeight,
            )}
          />
          {!value && !focused && !reduce && !listening && (
            <span
              ref={ghostRef}
              // Placeholder grey, so it is never mistaken for the traveller's own words.
              className={cn(
                'ghost-hl pointer-events-none absolute inset-0 overflow-hidden text-base leading-[22px] text-subtle transition-opacity duration-300 data-clipped:[mask-image:linear-gradient(to_bottom,transparent,black_22px)]',
                ghost.fading && 'opacity-0',
              )}
              aria-hidden
            >
              <HighlightedText text={ghost.text} />
              {/* The caret only while it is typing: a held or settled example is just a placeholder. */}
              {ghost.typing && <span className="ml-0.5 inline-block h-4 w-px animate-caret bg-subtle align-middle" />}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">{options && onOptionsChange && <TripOptionsControl options={options} onChange={onOptionsChange} disabled={running} />}</div>
          <div className="flex items-center gap-2">
            <span className={cn('tabular hidden text-[12px] text-subtle sm:inline', listening && 'sm:hidden', value.length > maxLength * 0.9 && 'text-warn')}>
              {value.length > maxLength * 0.9 ? `${value.length}/${maxLength}` : 'Enter to send'}
            </span>
            {voice && !running && (
              <MicButton
                onActiveChange={setListening}
                onText={(spoken) => {
                  onChange(appendSpoken(value, spoken, maxLength));
                  if (error) onClearError?.();
                  localRef.current?.focus();
                }}
              />
            )}
            {running ? (
              // Keyed apart from the send button: sharing one element would turn the click on Stop into a
              // click on a submit button by the time the browser acts on it, and restart the run.
              // Hovering anywhere on the button turns the cross a quarter, so it reads as "stop this".
              <AnimateIcon key="stop" animateOnHover asChild>
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="grid size-8 place-items-center rounded-xl border border-signal bg-raised text-signal-text transition-[transform,background-color] hover:bg-signal/10 active:scale-95"
                >
                  <Cancel01 size={15} aria-hidden />
                </button>
              </AnimateIcon>
            ) : (
              <button key="send" type="submit" aria-label={submitLabel} className="signal-fill relative grid size-8 place-items-center rounded-lg transition-[scale] active:scale-[0.97]">
                <ArrowUp size={16} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </form>
      <div className="min-h-5 px-1 pt-1.5 text-xs" aria-live="polite">
        {error && (
          <p id={`${id}-error`} className="text-err [text-shadow:0_1px_8px_var(--surface)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function TripOptionsControl({ options, onChange, disabled }: { options: TripOptions; onChange: (o: TripOptions) => void; disabled: boolean }) {
  const length = options.days === null ? 'Trip length' : `${options.days} day${options.days === 1 ? '' : 's'}`;
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={`Trip options: ${length}, ${PACE_LABEL[options.pace]} pace`}
          className="group flex h-8 items-center gap-1 rounded-xl pr-2 text-ink transition-colors hover:bg-sunken active:scale-[0.97] disabled:opacity-50 aria-expanded:bg-sunken"
        >
          <span className="grid size-8 place-items-center">
            <SlidersHorizontal size={16} className="transition-colors group-aria-expanded:text-brand" />
          </span>
          <span className="text-[13px] text-muted group-hover:text-ink">{length}</span>
          <span className="hidden text-[13px] text-subtle min-[400px]:inline">· {PACE_LABEL[options.pace]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-72 rounded-2xl p-0">
        <div className="border-b border-line p-4">
          <p className="label text-[11px] text-muted">Days</p>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-sunken p-1 shadow-[inset_0_0_0_1px_var(--edge)]">
            <button
              type="button"
              aria-label="Fewer days"
              disabled={options.days === null}
              onClick={() => onChange({ ...options, days: options.days && options.days > 1 ? options.days - 1 : null })}
              className="grid size-7 place-items-center rounded-lg transition-[background-color,box-shadow] hover:bg-surface hover:shadow-chip dark:hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
            >
              <Minus size={14} />
            </button>
            <output className="label tabular text-xs text-ink" aria-live="polite">
              {options.days === null ? 'Auto' : <><SlidingNumber value={options.days} /> days</>}
            </output>
            <button
              type="button"
              aria-label="More days"
              disabled={options.days === LIMITS.maxDays}
              onClick={() => onChange({ ...options, days: options.days === null ? 3 : Math.min(LIMITS.maxDays, options.days + 1) })}
              className="grid size-7 place-items-center rounded-lg transition-[background-color,box-shadow] hover:bg-surface hover:shadow-chip dark:hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="label text-[11px] text-muted">Pace</p>
          <div role="radiogroup" aria-label="Pace" className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1 shadow-[inset_0_0_0_1px_var(--edge)]">
            {PACES.map((pace) => (
              <button
                key={pace}
                type="button"
                role="radio"
                aria-checked={options.pace === pace}
                onClick={() => onChange({ ...options, pace })}
                className={cn('label h-7 rounded-lg text-[11px] transition-colors', options.pace === pace ? 'bg-surface text-ink shadow-control dark:bg-white/10' : 'text-muted hover:text-ink')}
              >
                {PACE_LABEL[pace]}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
