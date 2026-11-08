import { ArrowUp, Minus, Plus, SlidersHorizontal, Stop } from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { LIMITS, PACES, type Pace } from '@triptinker/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RunningRing } from '@/components/ui/running-ring';
import { cn } from '@/lib/utils';
import { appendSpoken } from '../use-voice-input';
import { MicButton } from './mic-button';

export type TripOptions = { days: number | null; pace: Pace };

const PACE_LABEL: Record<Pace, string> = { relaxed: 'Relaxed', balanced: 'Balanced', packed: 'Full days' };

/** Types and deletes example prompts into the empty field, like someone thinking out loud. */
function useTypewriter(lines: string[], enabled: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!enabled || !lines.length) return;
    let line = 0;
    let i = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = lines[line];
      i += deleting ? -3 : 1;
      i = Math.max(0, Math.min(current.length, i));
      setText(current.slice(0, i));
      let delay = deleting ? 14 : 32;
      if (!deleting && i === current.length) {
        deleting = true;
        delay = 2200;
      } else if (deleting && i === 0) {
        deleting = false;
        line = (line + 1) % lines.length;
        delay = 400;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, [lines, enabled]);
  return enabled ? text : '';
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
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const id = useId();
  const ghost = useTypewriter(typed, !value && !focused && !reduce && !running && !listening);

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
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onAnimationEnd={() => setShaking(false)}
        className={cn(
          'relative flex flex-col gap-3 rounded-md border border-line bg-surface px-4 pt-4 pb-3 shadow-lift transition-[box-shadow,border-color] duration-300',
          shaking && !reduce && 'animate-shake',
          (focused || running) && 'border-clay shadow-[0_0_0_4px_color-mix(in_oklab,var(--clay)_16%,transparent),var(--lift)]',
        )}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {running && <RunningRing radius={8} />}
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <div className={cn('relative', size === 'hero' ? 'min-h-20 md:min-h-12' : 'min-h-10')}>
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
            maxLength={maxLength}
            rows={size === 'hero' ? 2 : 1}
            aria-invalid={!!error}
            placeholder={reduce || focused ? typed[0] : ''}
            className="block max-h-48 w-full resize-none bg-transparent text-base leading-[22px] text-ink outline-none [field-sizing:content] placeholder:text-subtle focus-visible:outline-none"
          />
          {!value && !focused && !reduce && !listening && (
            <span className="pointer-events-none absolute inset-0 text-base leading-[22px] text-ink" aria-hidden>
              {ghost}
              <span className="ml-0.5 inline-block h-4 w-px animate-caret bg-ink align-middle" />
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
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="grid size-8 place-items-center rounded-xl border border-clay bg-surface text-clay transition-transform active:scale-95"
              >
                <Stop size={13} weight="fill" />
              </button>
            ) : (
              <button type="submit" aria-label={submitLabel} className="t-surface t-surface-clay relative grid size-8 place-items-center rounded-lg text-white transition-[scale] active:scale-[0.97]">
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
          <div className="mt-2 flex items-center justify-between rounded-xl border border-line p-1">
            <button
              type="button"
              aria-label="Fewer days"
              disabled={options.days === null}
              onClick={() => onChange({ ...options, days: options.days && options.days > 1 ? options.days - 1 : null })}
              className="grid size-7 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40"
            >
              <Minus size={14} />
            </button>
            <output className="label tabular text-xs text-ink" aria-live="polite">
              {options.days === null ? 'Auto' : `${options.days} days`}
            </output>
            <button
              type="button"
              aria-label="More days"
              disabled={options.days === LIMITS.maxDays}
              onClick={() => onChange({ ...options, days: options.days === null ? 3 : Math.min(LIMITS.maxDays, options.days + 1) })}
              className="grid size-7 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="label text-[11px] text-muted">Pace</p>
          <div role="radiogroup" aria-label="Pace" className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-line p-1">
            {PACES.map((pace) => (
              <button
                key={pace}
                type="button"
                role="radio"
                aria-checked={options.pace === pace}
                onClick={() => onChange({ ...options, pace })}
                className={cn('label h-7 rounded-lg text-[11px] transition-colors', options.pace === pace ? 'bg-ink text-bg' : 'text-muted hover:bg-sunken hover:text-ink')}
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
