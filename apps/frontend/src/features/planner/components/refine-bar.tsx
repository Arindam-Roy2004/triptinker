import { ArrowUp, WarningCircle } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react';
import { LIMITS } from '@triptinker/contracts';
import { Shimmer } from '@/components/ai/shimmer';
import { Button } from '@/components/ui/button';
import { SpinnerRing } from '@/components/ui/spinner-ring';
import { formatElapsed } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ItineraryDiff } from '../diff';
import type { GenerationState } from '../use-generation';
import { describeProblem, type Problem } from '../problem-copy';
import { appendSpoken } from '../use-voice-input';
import { MicButton } from './mic-button';

const SUGGESTIONS = ['Slow down day one', 'Add vegetarian dinners', 'More outdoor stops', 'Start after 9am'];
const ease = [0.22, 1, 0.36, 1] as const;

const STAGE_TEXT = {
  connecting: 'Reading your change',
  searching: 'Reading your change',
  drafting: 'Rewriting the plan',
  repairing: 'Fixing the first draft',
  validating: 'Checking the changes',
} as const;

type Running = Extract<GenerationState, { status: 'running' }>;
export type PendingRefinement = { instruction: string; diff: ItineraryDiff; warnings: string[] };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (instruction: string) => void;
  onStop: () => void;
  /** The refinement in flight, if any. */
  run: Running | null;
  /** The last refinement's failure, if it failed. */
  problem: Problem | null;
  onRetry: () => void;
  onDismissProblem: () => void;
  /** A finished refinement waiting to be applied; its changes are marked on the plan above. */
  pending: PendingRefinement | null;
  onApply: () => void;
  onDiscard: () => void;
  error: string | null;
  onClearError: () => void;
  disabled?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Show the microphone next to Send. */
  voice?: boolean;
};

/**
 * The one place to change a plan: a row of the trip card directly under the day it changes.
 * It never adds boxes to the page or floats over the stops: asking, waiting, reviewing and
 * failing are four states of this same row. The proposed changes are marked in place on the plan.
 */
export function RefineBar(props: Props) {
  const reduce = useReducedMotion();
  const mode = props.pending ? 'review' : props.run ? 'running' : props.problem ? 'problem' : 'idle';
  return (
    <div className="border-b border-line bg-sunken/50 px-6 py-4 last:border-b-0">
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[opacity,border-color] focus-within:border-line-strong',
          props.disabled && mode === 'idle' && 'pointer-events-none opacity-60',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={reduce ? false : { opacity: 0, y: 6, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, y: -4, filter: 'blur(4px)' }}
            transition={{ duration: 0.22, ease }}
          >
            {mode === 'review' && props.pending && <Review pending={props.pending} onApply={props.onApply} onDiscard={props.onDiscard} />}
            {mode === 'running' && props.run && <Working run={props.run} instruction={props.value} onStop={props.onStop} reduce={!!reduce} />}
            {mode === 'problem' && props.problem && <Failure problem={props.problem} onRetry={props.onRetry} onEdit={props.onDismissProblem} />}
            {mode === 'idle' && <Compose {...props} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Compose({ value, onChange, onSubmit, error, onClearError, disabled, inputRef, voice }: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const tooShort = value.trim().length < LIMITS.instructionMin;
  const send = (text: string) => !disabled && onSubmit(text);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(value);
    }
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(value);
        }}
        className="flex items-end gap-3 py-2 pr-2 pl-4"
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <label htmlFor={id} className="sr-only">
          Describe a change to the plan
        </label>
        <textarea
          id={id}
          ref={inputRef}
          value={value}
          rows={1}
          maxLength={LIMITS.instructionMax}
          disabled={disabled}
          aria-invalid={!!error}
          onChange={(e) => {
            onChange(e.target.value);
            if (error) onClearError();
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask for a change to this plan…"
          className="block max-h-32 min-h-9 flex-1 resize-none bg-transparent py-[7px] text-[15px] leading-[22px] text-ink outline-none [field-sizing:content] placeholder:text-subtle focus-visible:outline-none"
        />
        {voice && (
          <MicButton
            size={9}
            disabled={disabled}
            onText={(spoken) => {
              onChange(appendSpoken(value, spoken, LIMITS.instructionMax));
              if (error) onClearError();
              inputRef?.current?.focus();
            }}
          />
        )}
        <button
          type="submit"
          aria-label="Send change request"
          disabled={disabled}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform] active:scale-95',
            tooShort ? 'bg-sunken text-subtle' : 'bg-brand text-brand-ink',
          )}
        >
          <ArrowUp size={16} weight="bold" />
        </button>
      </form>
      {error ? (
        <p id={`${id}-error`} className="px-4 pb-2.5 text-[12px] text-err" aria-live="polite">
          {error}
        </p>
      ) : (
        !value &&
        !focused && (
          <div className="flex items-center gap-3 pr-3 pb-2.5">
            <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto pl-4" aria-label="Suggested changes">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => send(s)}
                  className="h-7 shrink-0 rounded-lg border border-line px-2.5 text-[12px] text-muted transition-[color,border-color,transform] hover:border-line-strong hover:text-ink active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="hidden shrink-0 text-[12px] text-subtle md:block">Nothing changes until you review it</p>
          </div>
        )
      )}
    </div>
  );
}

function useElapsed(since: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return now - since;
}

function Working({ run, instruction, onStop, reduce }: { run: Running; instruction: string; onStop: () => void; reduce: boolean }) {
  const elapsed = useElapsed(run.startedAt);
  return (
    <div className="flex items-center gap-3 px-4 py-3" aria-live="polite">
      <SpinnerRing reduce={reduce} />
      <div className="min-w-0 flex-1">
        <Shimmer as="p" duration={1.8} className="text-[14px] font-medium">
          {`${STAGE_TEXT[run.stage]}…`}
        </Shimmer>
        <p className="truncate text-[12px] leading-5 text-muted">“{instruction}”</p>
      </div>
      <span className="tabular text-[12px] text-subtle">{formatElapsed(elapsed)}</span>
      <button type="button" onClick={onStop} className="border-b border-dotted border-subtle text-[13px] text-muted transition-colors hover:border-ink hover:text-ink">
        Stop
      </button>
    </div>
  );
}

function Review({ pending, onApply, onDiscard }: { pending: PendingRefinement; onApply: () => void; onDiscard: () => void }) {
  const { added, removed, changed } = pending.diff.counts;
  return (
    <div role="region" aria-label="Review changes">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">“{pending.instruction}”</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] leading-5">
            {added > 0 && <span className="text-ok">{added} added</span>}
            {removed > 0 && <span className="text-err">{removed} removed</span>}
            {changed > 0 && <span className="text-warn">{changed} changed</span>}
            {!added && !removed && !changed && <span className="text-muted">Trip details updated</span>}
            <span className="text-subtle">Marked on the plan</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={onDiscard} className="flex-1 sm:flex-none">
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={onApply} className="flex-1 sm:flex-none">
            Apply changes
          </Button>
        </div>
      </div>
      {pending.warnings.length > 0 && (
        <p className="max-h-20 overflow-y-auto overscroll-contain border-t border-line px-4 py-2 text-[12px] leading-5 text-muted [scrollbar-width:thin]">{pending.warnings.join(' ')}</p>
      )}
    </div>
  );
}

function Failure({ problem, onRetry, onEdit }: { problem: Problem; onRetry: () => void; onEdit: () => void }) {
  const { title, body } = describeProblem(problem);
  const retryable = problem.status === 'error' && problem.retryable;
  return (
    <div role="alert" className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <WarningCircle size={18} className={cn('mt-px shrink-0', problem.status === 'unplannable' ? 'text-warn' : 'text-err')} />
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">{title}</p>
          <p className="text-[12px] leading-5 text-muted">{body} Your plan is unchanged.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={onEdit} className="flex-1 sm:flex-none">
          Edit request
        </Button>
        {retryable && (
          <Button size="sm" variant="secondary" onClick={onRetry} className="flex-1 sm:flex-none">
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
