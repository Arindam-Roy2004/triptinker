import { ArrowRight, Plus, X } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { SAMPLE_ITINERARY, SAMPLE_REQUEST } from '@triptinker/contracts';
import { GenerateItineraryDto, LIMITS, type GenerateItineraryInput, type Health, type Simulation } from '@triptinker/contracts';
import { HeroGlow } from '@/components/site/hero-glow';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeToggle } from '@/components/site/theme-toggle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { readStored, writeStored } from '@/lib/storage';
import { SceneCaption, SceneStage } from '@/features/scenes/scene-stage';
import { sceneSrc } from '@/features/scenes/scenes';
import { useScene } from '@/features/scenes/use-scene';
import { fetchHealth } from './api';
import { FailureLab } from './components/failure-lab';
import { LibraryMenu } from './components/library-menu';
import { PromptCard } from './components/prompt-card';
import { RefineBar, type PendingRefinement } from './components/refine-bar';
import { ResultSection, type ExportFormat } from './components/result-section';
import { RunPanel } from './components/run-panel';
import { FeatureCells, ProblemCell } from './components/strip-cells';
import { diffItineraries, reviewMarks } from './diff';
import { downloadText, printTrip, tripAsText } from './export';
import { findStop, moveStop, moveStopToDay, removeStop, restoreStop } from './operations';
import { tripSchema, useTripStore, type Trip } from './trip-store';
import { useGeneration } from './use-generation';
import { useLibrary } from './use-library';
import { voiceSupported } from './use-voice-input';
import { STORAGE_KEYS } from '@/lib/keys';

const WORKSPACE_KEY = STORAGE_KEYS.workspace;
// The draft may be half-written, so it is not held to the request's minimum length.
const workspaceSchema = z.object({ trip: tripSchema.nullable(), form: GenerateItineraryDto.schema.extend({ brief: z.string().max(2000) }) });
const EMPTY_FORM: GenerateItineraryInput = { brief: '', days: null, pace: 'balanced' };

const EXAMPLES = [
  { label: 'Kyoto in autumn', brief: 'Four days in Kyoto in mid-November for the autumn leaves. Temples and gardens, quiet mornings, vegetarian-friendly food, one day trip to Nara.' },
  { label: 'Mexico City with kids', brief: 'A long weekend in Mexico City with our two-year-old. Parks, markets and great tacos, back at the hotel for naps around 1pm.' },
  { label: 'Rainy Edinburgh', brief: 'Two days in Edinburgh in February that still work if it rains all day. History, cosy pubs, one whisky tasting, no hiking.' },
  { label: 'Food in Rome', brief: 'Three days in Rome for people who travel to eat: markets, trattorias, a cooking class, and one big sight a day.' },
];

/** Frosted chip over the scene, for the example briefs and the sample. */
const CHIP = 'frost h-8 rounded-lg px-3 text-[13px] font-medium text-ink shadow-[var(--chip-shadow)] transition-[background-color,transform] hover:bg-surface active:scale-95 disabled:opacity-60';

const newId = () => crypto.randomUUID();

function restoreWorkspace() {
  const saved = readStored(WORKSPACE_KEY, workspaceSchema);
  return { trip: saved?.trip ?? null, form: saved ? { ...EMPTY_FORM, ...saved.form } : EMPTY_FORM };
}

function exportTrip(trip: Trip, format: ExportFormat) {
  const { itinerary } = trip;
  if (format === 'pdf') return printTrip(itinerary);
  if (format === 'text') return downloadText(itinerary);
  const failed = () => toast.error('Could not copy', { description: 'Use “Download as text” instead.' });
  if (!navigator.clipboard) return failed();
  navigator.clipboard.writeText(tripAsText(itinerary)).then(() => toast.success('Trip copied', { description: 'Paste it into a chat, email or notes app.' }), failed);
}

const scrollTo = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

export function PlannerPage() {
  const [initial] = useState(restoreWorkspace);
  const [form, setForm] = useState<GenerateItineraryInput>(initial.form);
  const store = useTripStore(initial.trip);
  const generation = useGeneration();
  const library = useLibrary();
  const scene = useScene();
  const [health, setHealth] = useState<Health | null>(null);
  const [simulate, setSimulate] = useState<Simulation | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [refineText, setRefineText] = useState('');
  const [refineError, setRefineError] = useState<string | null>(null);
  const [pending, setPending] = useState<(PendingRefinement & { next: Trip['itinerary'] }) | null>(null);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  // After Apply, the changed stops stay marked and tinted for a few seconds, so the edit is visible.
  const [applied, setApplied] = useState<ReturnType<typeof reviewMarks> | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const lastRun = useRef<{ kind: 'generate'; request: GenerateItineraryInput } | { kind: 'refine'; instruction: string } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const refineRef = useRef<HTMLTextAreaElement>(null);

  const { trip } = store;
  const state = generation.state;
  const running = state.status === 'running';
  const runKind = state.status === 'idle' ? null : state.kind;
  const saved = library.isSaved(trip);
  const notConfigured = !!health && !health.configured && !simulate;
  const { matchDestination } = scene;
  const [canRecord] = useState(voiceSupported);
  const voice = !!health?.voice && canRecord;

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then((h) => !controller.signal.aborted && setHealth(h));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!applied) return;
    const timer = setTimeout(() => setApplied(null), 4000);
    return () => clearTimeout(timer);
  }, [applied]);

  // Autosave the workspace so a reload picks up exactly where the traveller left off.
  // Writes are debounced, and flushed when the page is hidden so a quick reload never loses an edit.
  const latest = useRef({ trip, form });
  useEffect(() => {
    latest.current = { trip, form };
    const timer = setTimeout(() => writeStored(WORKSPACE_KEY, latest.current), 300);
    return () => clearTimeout(timer);
  }, [trip, form]);
  useEffect(() => {
    const flush = () => writeStored(WORKSPACE_KEY, latest.current);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // When the trip's destination has a matching scene, show it.
  useEffect(() => matchDestination(trip?.itinerary.destination ?? null), [trip?.itinerary.destination, matchDestination]);

  /* ── AI runs ──────────────────────────────────────────────────────────── */

  const generate = useCallback(
    (brief: string) => {
      const { errors, value: request } = GenerateItineraryDto.validate({ ...form, brief });
      if (errors) {
        setBriefError(errors[0]?.message ?? 'Check the brief.');
        return;
      }
      setBriefError(null);
      setForm(request);
      lastRun.current = { kind: 'generate', request };
      void generation.start(
        'generate',
        { endpoint: '/api/itinerary', body: request },
        ({ itinerary, warnings, meta, sources }) => {
          const now = Date.now();
          store.load({ id: newId(), source: 'ai', request, itinerary, model: meta.model, meta, warnings, sources, createdAt: now, updatedAt: now });
          setActiveDayId(null);
          setPending(null);
          scrollTo('trip');
        },
        simulate,
      );
    },
    [form, generation, store, simulate],
  );

  const refine = useCallback(
    (instruction: string) => {
      if (!trip) return;
      const text = instruction.trim();
      if (text.length < LIMITS.instructionMin) {
        setRefineError('Describe the change you want.');
        return;
      }
      setRefineError(null);
      setRefineText(text);
      lastRun.current = { kind: 'refine', instruction: text };
      const base = trip.itinerary;
      void generation.start(
        'refine',
        { endpoint: '/api/itinerary/refine', body: { instruction: text, itinerary: base } },
        ({ itinerary, warnings }) => {
          const diff = diffItineraries(base, itinerary);
          if (diff.isEmpty) {
            toast('No changes made', { description: 'Try a more specific request.' });
            return;
          }
          setPending({ instruction: text, diff, warnings, next: itinerary });
          const marks = reviewMarks(diff, itinerary);
          const first = marks.perDay.findIndex((n) => n > 0);
          if (first !== -1) setActiveDayId(itinerary.days[first].id);
        },
        simulate,
      );
    },
    [generation, trip, simulate],
  );

  const retry = () => {
    const run = lastRun.current;
    if (run?.kind === 'generate') generate(run.request.brief);
    else if (run?.kind === 'refine') refine(run.instruction);
  };

  const focusPrompt = useCallback(() => {
    scrollTo('scene');
    setTimeout(() => promptRef.current?.focus({ preventScroll: true }), 350);
  }, []);

  /* ── Trip actions ─────────────────────────────────────────────────────── */

  const loadTrip = (next: Trip | null) => {
    generation.cancel(); // whatever was in flight must not land on top of this
    store.load(next);
    setPending(null);
    setApplied(null);
    setActiveDayId(null);
    setRefineText('');
  };

  const openSample = () => {
    const now = Date.now();
    loadTrip({ id: newId(), source: 'sample', request: SAMPLE_REQUEST, itinerary: SAMPLE_ITINERARY, model: null, meta: null, warnings: [], sources: [], createdAt: now, updatedAt: now });
    setForm(SAMPLE_REQUEST);
    scrollTo('trip');
  };

  /** Puts the page back as it was before the sample was opened. */
  const hideSample = () => {
    loadTrip(null);
    setForm(EMPTY_FORM);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startNew = () => {
    loadTrip(null);
    setForm(EMPTY_FORM);
    setConfirmNew(false);
    focusPrompt();
  };

  const save = () => {
    if (!trip) return;
    if (library.save(trip)) toast.success('Trip saved');
    else toast.error('Could not save trip', { description: 'Download your trip as a PDF or text file to keep a copy.' });
  };

  const remove = (stopId: string) => {
    if (!trip) return;
    const found = findStop(trip.itinerary, stopId);
    if (!found) return;
    // Was Remove pressed from the keyboard? Mouse users keep no focus ring after the button disappears.
    const fromKeyboard = !!document.activeElement?.matches(':focus-visible');
    store.edit((it) => removeStop(it, stopId));
    // The Remove button disappears with its stop, so keep keyboard users in place: focus the stop
    // that took its place, or the day's tab when the day is now empty.
    // Only when focus was actually lost: never pull it away from wherever the user has moved on to.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!fromKeyboard || (document.activeElement && document.activeElement !== document.body)) return;
        document.querySelector<HTMLElement>('#trip [aria-current="true"], #trip [role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
      }),
    );
    // One toast for removals: each new one replaces the last instead of stacking up.
    toast(`Removed “${found.stop.title}”`, { id: 'stop-removed', action: { label: 'Undo', onClick: () => store.edit((it) => restoreStop(it, found.day.id, found.index, found.stop)) } });
  };

  // ⌘K focuses the prompt; ⌘Z / ⇧⌘Z undo and redo outside text fields.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        focusPrompt();
        return;
      }
      if (key !== 'z' || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, focusPrompt]);

  const activeDay = trip?.itinerary.days.some((d) => d.id === activeDayId) ? activeDayId! : (trip?.itinerary.days[0]?.id ?? '');
  const backdrop = sceneSrc(scene.scene, 1920);
  const problem = state.status === 'error' || state.status === 'unplannable' ? state : null;
  const generating = running && runKind === 'generate';
  const refining = running && runKind === 'refine';
  const review = useMemo(() => (pending ? reviewMarks(pending.diff, pending.next) : null), [pending]);
  const requestNew = () => (!trip || saved || trip.source === 'sample' ? startNew() : setConfirmNew(true));

  const runStatus = (kind: 'generate' | 'refine') => {
    if (runKind !== kind) return null;
    if (state.status === 'running') return <RunPanel key="run" state={state} onCancel={generation.cancel} />;
    if (problem) {
      return (
        <ProblemCell
          key="problem"
          problem={problem}
          hasTrip={!!trip}
          onRetry={retry}
          onEdit={() => {
            generation.dismiss();
            if (kind === 'generate') focusPrompt();
          }}
          onSample={!trip ? openSample : undefined}
        />
      );
    }
    return null;
  };
  const generateStatus = runStatus('generate');

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <HeroGlow />
      <SiteHeader>
        {trip && (
          <Button variant="secondary" size="sm" onClick={requestNew} aria-label="New trip">
            <Plus />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New trip</span>
          </Button>
        )}
        <LibraryMenu
          trips={library.trips}
          currentId={trip?.id ?? null}
          onOpen={(t) => {
            loadTrip(t);
            if (t.request) setForm(t.request);
            scrollTo('trip');
          }}
          onDelete={library.remove}
        />
        <ThemeToggle />
      </SiteHeader>

      <main className="mx-auto w-full max-w-[1104px] flex-1 px-4 sm:px-6 xl:px-0">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="flex flex-col items-center gap-6 pt-8 pb-10 text-center sm:pt-10 md:pb-12">
          <div className="flex flex-col gap-4">
            <h1 id="hero-title" className="font-display text-[42px] leading-[1.06] text-ink-strong sm:text-[56px] lg:text-[68px] lg:leading-[1.06]">
              Where to <em>next</em>? <br className="hidden sm:inline" />
              Say it in <em>one</em> sentence.
            </h1>
            <p className="mx-auto max-w-2xl text-[16px] leading-7 text-muted md:text-[18px] md:leading-7">
              Get a day-by-day plan built around your interests. <br className="hidden md:inline" />
              Move stops, save your trip, or ask AI to make changes.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {trip?.source === 'sample' ? (
              <Button variant="secondary" onClick={hideSample}>
                <X /> Hide sample
              </Button>
            ) : (
              <Button variant="secondary" onClick={openSample}>
                View sample
              </Button>
            )}
            <Button variant="primary" onClick={focusPrompt}>
              Plan a trip <ArrowRight />
            </Button>
          </div>
        </section>

        {/* Scene, prompt and status strip */}
        <div id="scene" className="scroll-mt-20 overflow-hidden rounded-md shadow-lift">
          {/* The card sits in the lower part of the scene, leaving the landmark visible above it. */}
          <SceneStage scene={scene.scene} dim={generating} className="flex min-h-[520px] flex-col items-center justify-end px-4 pt-36 pb-16 md:min-h-[540px] md:pb-20">
            <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-2">
              <PromptCard
                inputRef={promptRef}
                label="Describe your trip"
                submitLabel="Plan this trip"
                value={form.brief}
                onChange={(brief) => setForm((f) => ({ ...f, brief }))}
                onSubmit={generate}
                onStop={generation.cancel}
                running={generating}
                typed={EXAMPLES.map((e) => e.brief)}
                minLength={LIMITS.briefMin}
                maxLength={LIMITS.briefMax}
                options={{ days: form.days, pace: form.pace }}
                onOptionsChange={(o) => setForm((f) => ({ ...f, ...o }))}
                error={briefError}
                onClearError={() => setBriefError(null)}
                voice={voice}
              />
              <div className="flex flex-wrap justify-center gap-2" aria-label="Example trips">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    disabled={running}
                    onClick={() => {
                      setForm((f) => ({ ...f, brief: example.brief }));
                      generate(example.brief);
                    }}
                    className={CHIP}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
              {notConfigured && (
                <p className="frost mt-1 rounded-xl px-3 py-2 text-center text-[13px] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">AI planning is unavailable. You can still view a sample trip.</p>
              )}
            </div>
            <SceneCaption
              scene={scene.scene}
              position={scene.position}
              onPrev={scene.prev}
              onNext={scene.next}
              className="absolute right-3 bottom-3 z-10 max-w-[calc(100%-1.5rem)] sm:right-4 sm:bottom-4"
            />
          </SceneStage>
          <AnimatePresence mode="wait" initial={false}>
            {generateStatus ?? (!trip && <FeatureCells key="features" />)}
          </AnimatePresence>
        </div>

        {trip && (
          <div className="mt-16 flex flex-col gap-10 sm:mt-24">
            <div className={generating ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'} inert={generating}>
              <ResultSection
                key={trip.id} // a different trip replays the entrance; edits to this one don't
                trip={pending ? { ...trip, itinerary: pending.next } : trip}
                review={review}
                highlight={applied}
                locked={!!pending || refining}
                sceneSrc={backdrop}
                activeDayId={activeDay}
                onActiveDay={setActiveDayId}
                saved={saved}
                canUndo={store.canUndo}
                canRedo={store.canRedo}
                onUndo={store.undo}
                onRedo={store.redo}
                onSave={save}
                onHideSample={hideSample}
                onExport={(format) => exportTrip(trip, format)}
                onReorder={(dayId, from, to) => store.edit((it) => moveStop(it, dayId, from, to))}
                actionsFor={(dayId, stop, index) => ({
                  onMove: (to) => store.edit((it) => moveStop(it, dayId, index, to)),
                  onMoveToDay: (target) => {
                    store.edit((it) => moveStopToDay(it, stop.id, target));
                    const n = trip.itinerary.days.findIndex((d) => d.id === target) + 1;
                    toast(`Moved to day ${n}`, { action: { label: 'Show', onClick: () => setActiveDayId(target) } });
                  },
                  onRemove: () => remove(stop.id),
                })}
                onAskForDay={
                  notConfigured
                    ? undefined
                    : (n) => {
                        setRefineText(`Add three or four stops to day ${n}`);
                        requestAnimationFrame(() => refineRef.current?.focus());
                      }
                }
              >
                <RefineBar
                  value={refineText}
                  onChange={setRefineText}
                  onSubmit={refine}
                  onStop={generation.cancel}
                  run={refining && state.status === 'running' ? state : null}
                  problem={runKind === 'refine' ? problem : null}
                  onRetry={retry}
                  onDismissProblem={generation.dismiss}
                  pending={pending}
                  onDiscard={() => setPending(null)}
                  onApply={() => {
                    if (!pending) return;
                    const next = pending.next;
                    store.edit(() => next);
                    setApplied(review);
                    setPending(null);
                    setRefineText('');
                    toast.success('Changes applied', { action: { label: 'Undo', onClick: store.undo } });
                  }}
                  error={refineError}
                  onClearError={() => setRefineError(null)}
                  disabled={notConfigured || generating}
                  inputRef={refineRef}
                  voice={voice}
                />
              </ResultSection>
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto mt-24 flex w-full max-w-[1104px] flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-8 text-[13px] text-muted sm:px-6 xl:px-0">
        <span>Check opening hours and bookings before you go.</span>
        {health?.simulation && <FailureLab value={simulate} onChange={setSimulate} />}
      </footer>

      <AlertDialog open={confirmNew} onOpenChange={setConfirmNew}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[22px] font-medium tracking-[-0.01em]">Start a new trip?</AlertDialogTitle>
            <AlertDialogDescription>This trip has unsaved changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">Keep editing</Button>
            </AlertDialogCancel>
            <Button variant="secondary" onClick={() => (save(), startNew())}>
              Save and start
            </Button>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={startNew}>
                Start without saving
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
