import { ArrowRight } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { SAMPLE_ITINERARY, SAMPLE_REQUEST } from '@shared/sample';
import { LIMITS, tripRequestSchema, type Health, type Simulation, type TripRequest } from '@shared/schema';
import { HeroGlow } from '@/components/site/hero-glow';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeToggle } from '@/components/site/theme-toggle';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { readStored, writeStored } from '@/lib/storage';
import { SceneCaption, SceneStage } from '@/features/scenes/scene-stage';
import { sceneSrc } from '@/features/scenes/scenes';
import { useScene } from '@/features/scenes/use-scene';
import { fetchHealth } from './api';
import { FailureLab } from './components/failure-lab';
import { LibrarySheet } from './components/library-sheet';
import { PromptCard } from './components/prompt-card';
import { RefineSection, type PendingRefinement } from './components/refine-section';
import { ResultSection } from './components/result-section';
import { RunPanel } from './components/run-panel';
import { FeatureCells, ProblemCell } from './components/strip-cells';
import { diffItineraries } from './diff';
import { findStop, moveStop, moveStopToDay, removeStop, restoreStop } from './operations';
import { tripSchema, useTripStore, type Trip } from './trip-store';
import { useGeneration } from './use-generation';
import { useLibrary } from './use-library';
import { STORAGE_KEYS } from '@/lib/keys';

const WORKSPACE_KEY = STORAGE_KEYS.workspace;
// The draft may be half-written, so it is not held to the request's minimum length.
const workspaceSchema = z.object({ trip: tripSchema.nullable(), form: tripRequestSchema.extend({ brief: z.string().max(2000) }) });
const EMPTY_FORM: TripRequest = { brief: '', days: null, pace: 'balanced' };

const EXAMPLES = [
  { label: 'Kyoto in autumn', brief: 'Four days in Kyoto in mid-November for the autumn leaves. Temples and gardens, quiet mornings, vegetarian-friendly food, one day trip to Nara.' },
  { label: 'Mexico City + toddler', brief: 'A long weekend in Mexico City with our two-year-old. Parks, markets and great tacos, back at the hotel for naps around 1pm.' },
  { label: 'Rainy Edinburgh', brief: 'Two days in Edinburgh in February that still work if it rains all day. History, cosy pubs, one whisky tasting, no hiking.' },
  { label: 'Rome for food', brief: 'Three days in Rome for people who travel to eat: markets, trattorias, a cooking class, and one big sight a day.' },
];

/** Frosted chip over the scene, for the example briefs and the sample. */
const CHIP =
  'frost label h-8 rounded-lg px-3 text-[11px] text-ink shadow-[var(--chip-shadow)] transition-[background-color,transform] hover:bg-surface active:scale-95 disabled:opacity-60';

const newId = () => crypto.randomUUID();

function restoreWorkspace() {
  const saved = readStored(WORKSPACE_KEY, workspaceSchema);
  return { trip: saved?.trip ?? null, form: saved ? { ...EMPTY_FORM, ...saved.form } : EMPTY_FORM };
}

function download(trip: Trip) {
  const blob = new Blob([JSON.stringify(trip.itinerary, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const name = trip.itinerary.destination.split(',')[0].trim().toLowerCase().replace(/\W+/g, '-') || 'trip';
  Object.assign(document.createElement('a'), { href: url, download: `${name}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const scrollTo = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

export function PlannerPage() {
  const [initial] = useState(restoreWorkspace);
  const [form, setForm] = useState<TripRequest>(initial.form);
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
  const [confirmNew, setConfirmNew] = useState(false);
  const lastRun = useRef<{ kind: 'generate'; request: TripRequest } | { kind: 'refine'; instruction: string } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { trip } = store;
  const state = generation.state;
  const running = state.status === 'running';
  const runKind = state.status === 'idle' ? null : state.kind;
  const saved = library.isSaved(trip);
  const notConfigured = !!health && !health.configured && !simulate;
  const { matchDestination } = scene;

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then((h) => !controller.signal.aborted && setHealth(h));
    return () => controller.abort();
  }, []);

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
      const parsed = tripRequestSchema.safeParse({ ...form, brief });
      if (!parsed.success) {
        setBriefError(parsed.error.issues[0]?.message ?? 'Check the brief.');
        return;
      }
      setBriefError(null);
      setForm(parsed.data);
      const request = parsed.data;
      lastRun.current = { kind: 'generate', request };
      void generation.start(
        'generate',
        { endpoint: '/api/itinerary', body: request },
        ({ itinerary, warnings, meta }) => {
          const now = Date.now();
          store.load({ id: newId(), source: 'ai', request, itinerary, model: meta.model, meta, warnings, createdAt: now, updatedAt: now });
          setActiveDayId(null);
          setPending(null);
          if (warnings.length || meta.repairedFrom) toast('Validated, with notes', { description: 'What was fixed is listed under the trip summary.' });
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
            toast('The model made no changes', { description: 'Try describing the change more specifically.' });
            return;
          }
          setPending({ instruction: text, diff, warnings, next: itinerary });
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
    setActiveDayId(null);
    setRefineText('');
  };

  const openSample = () => {
    const now = Date.now();
    loadTrip({ id: newId(), source: 'sample', request: SAMPLE_REQUEST, itinerary: SAMPLE_ITINERARY, model: null, meta: null, warnings: [], createdAt: now, updatedAt: now });
    setForm(SAMPLE_REQUEST);
    scrollTo('trip');
  };

  const startNew = () => {
    loadTrip(null);
    setForm(EMPTY_FORM);
    setConfirmNew(false);
    focusPrompt();
  };

  const save = () => {
    if (!trip) return;
    if (library.save(trip)) toast.success('Trip saved', { description: 'Find it under Saved.' });
    else toast.error('Could not save', { description: 'Browser storage is full or unavailable.' });
  };

  const remove = (stopId: string) => {
    if (!trip) return;
    const found = findStop(trip.itinerary, stopId);
    if (!found) return;
    store.edit((it) => removeStop(it, stopId));
    toast(`Removed “${found.stop.title}”`, { action: { label: 'Undo', onClick: () => store.edit((it) => restoreStop(it, found.day.id, found.index, found.stop)) } });
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

  const runStatus = (kind: 'generate' | 'refine') => {
    if (runKind !== kind) return null;
    if (state.status === 'running') return <RunPanel key="run" state={state} model={health?.model ?? null} onCancel={generation.cancel} />;
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
        {health?.simulation && <FailureLab value={simulate} onChange={setSimulate} />}
        <LibrarySheet
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
          <button type="button" onClick={focusPrompt} className="group flex max-w-full items-stretch overflow-hidden rounded-lg border border-ink-strong text-left">
            <span className="label flex items-center bg-ink-strong px-3 text-[11px] text-bg">New</span>
            <span className="flex min-w-0 items-center gap-2 bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors group-hover:bg-sunken">
              <span className="truncate">Turn one sentence into a day-by-day plan you can edit</span>
              <ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
          <div className="flex flex-col gap-4">
            <h1 id="hero-title" className="font-display text-[42px] leading-[1.06] text-ink-strong sm:text-[56px] lg:text-[68px] lg:leading-[1.06]">
              Where to <em>next</em>? <br className="hidden sm:inline" />
              Say it in <em>one</em> sentence.
            </h1>
            <p className="mx-auto max-w-2xl text-[16px] leading-7 text-muted md:text-[18px] md:leading-7">
              Roamfar turns your brief into a day-by-day itinerary — <br className="hidden md:inline" />
              streamed, checked line by line, and yours to reorder and refine.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button variant="secondary" onClick={openSample}>
              Open a sample
            </Button>
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
                <p className="frost mt-1 rounded-xl px-3 py-2 text-center text-[13px] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
                  No model key on the server yet. Open the sample, or try the failure lab.
                </p>
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
                trip={trip}
                sceneSrc={backdrop}
                activeDayId={activeDay}
                onActiveDay={setActiveDayId}
                saved={saved}
                canUndo={store.canUndo}
                canRedo={store.canRedo}
                onUndo={store.undo}
                onRedo={store.redo}
                onSave={save}
                onExport={() => download(trip)}
                onNewTrip={() => (saved || trip.source === 'sample' ? startNew() : setConfirmNew(true))}
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
              />
            </div>
            <RefineSection
              value={refineText}
              onChange={setRefineText}
              onSubmit={refine}
              onStop={generation.cancel}
              running={running && runKind === 'refine'}
              error={refineError}
              onClearError={() => setRefineError(null)}
              disabled={notConfigured || generating}
              status={<AnimatePresence initial={false}>{runStatus('refine')}</AnimatePresence>}
              pending={pending}
              onDiscard={() => setPending(null)}
              onApply={() => {
                if (!pending) return;
                const next = pending.next;
                store.edit(() => next);
                setPending(null);
                setRefineText('');
                toast.success('Changes applied', { action: { label: 'Undo', onClick: store.undo } });
              }}
            />
          </div>
        )}
      </main>

      <footer className="mx-auto mt-24 flex w-full max-w-[1104px] flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-8 text-[13px] text-muted sm:px-6 xl:px-0">
        <span>Plans are AI-generated. Check opening hours and bookings before you go.</span>
        {health?.configured && health.model && <span className="label text-[11px] text-subtle">{health.model}</span>}
      </footer>

      <AlertDialog open={confirmNew} onOpenChange={setConfirmNew}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[22px] font-medium tracking-[-0.01em]">Start a new trip?</AlertDialogTitle>
            <AlertDialogDescription>This trip isn't saved. Save it first if you want to come back to it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">Keep editing</Button>
            </AlertDialogCancel>
            <Button variant="secondary" onClick={() => (save(), startNew())}>
              Save, then start
            </Button>
            <AlertDialogAction asChild>
              <Button variant="danger" onClick={startNew}>
                Discard
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
