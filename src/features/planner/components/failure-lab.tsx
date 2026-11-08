import { Flask } from '@phosphor-icons/react';
import type { Simulation } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const SCENARIOS: { id: Simulation; label: string; outcome: string }[] = [
  { id: 'ok', label: 'Clean answer', outcome: 'Streams a valid plan' },
  { id: 'slow', label: 'Slow model', outcome: 'Late first token, slow stream' },
  { id: 'malformed-once', label: 'Bad JSON, then fixed', outcome: 'Auto-repair succeeds' },
  { id: 'malformed', label: 'Bad JSON twice', outcome: 'Repair fails → retry' },
  { id: 'wrong-shape', label: 'Wrong shape', outcome: 'No days array → error' },
  { id: 'partial', label: 'Partly broken stops', outcome: 'Salvaged with notes' },
  { id: 'truncated', label: 'Cut off mid-answer', outcome: 'Repaired, shorter' },
  { id: 'empty', label: 'Empty answer', outcome: 'Repair, then error' },
  { id: 'unplannable', label: 'Not a trip', outcome: 'Model declines → guidance' },
  { id: 'stall', label: 'Stream stalls', outcome: 'Idle timeout → error' },
  { id: 'provider-error', label: 'Provider 503', outcome: 'Retryable error' },
  { id: 'rate-limited', label: 'Rate limited', outcome: 'Retryable error' },
];

/** Development only: send requests to a simulated model that misbehaves on purpose. */
export function FailureLab({ value, onChange }: { value: Simulation | null; onChange: (value: Simulation | null) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label={value ? `Test mode: ${value}` : 'Test mode'} className={cn(value && 'bg-warn-wash text-warn hover:bg-warn-wash')}>
          <Flask />
          <span className="hidden sm:inline">{value ? 'Test mode on' : 'Test mode'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="border-b border-line p-4">
          <p className="label text-[11px] text-warn">Development only</p>
          <p className="mt-1 text-[15px] font-medium">Test mode</p>
          <p className="mt-0.5 text-[13px] text-muted">Route the next requests to a simulated model that fails in a specific way.</p>
        </div>
        <div role="radiogroup" aria-label="Simulated model behaviour" className="max-h-[min(60dvh,26rem)] overflow-y-auto p-1.5">
          {[{ id: null, label: 'Off: use the real model', outcome: '' } as const, ...SCENARIOS].map((s) => {
            const checked = value === s.id;
            return (
              <button
                key={s.id ?? 'off'}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onChange(s.id)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-sunken', checked && 'bg-sunken')}
              >
                <span className={cn('grid size-3.5 shrink-0 place-items-center rounded-full border', checked ? 'border-brand' : 'border-line-strong')}>
                  {checked && <span className="size-1.5 rounded-full bg-brand" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px]">{s.label}</span>
                  {s.outcome && <span className="text-[12px] text-muted">{s.outcome}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
