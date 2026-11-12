import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GenerateItineraryDto, RefineItineraryDto, SAMPLE_ITINERARY, SAMPLE_REQUEST, type GenerateItineraryInput, type Health, type Simulation, type Stop } from '@triptinker/contracts';
import { useScene } from '@/features/scenes/use-scene';
import { fetchHealth } from './api';
import type { PendingRefinement } from './components/refine-bar';
import type { ExportFormat } from './components/result-section';
import { diffItineraries, reviewMarks } from './diff';
import { downloadText, printTrip, tripAsText } from './export';
import { findStop, moveStop, moveStopToDay, removeStop, restoreStop } from './operations';
import type { Trip } from './trip-store';
import { useGeneration } from './use-generation';
import { useLibrary } from './use-library';
import { voiceSupported } from './use-voice-input';
import { EMPTY_FORM, useWorkspace } from './use-workspace';

const newId = () => crypto.randomUUID();

function exportTrip(trip: Trip, format: ExportFormat) {
  const { itinerary } = trip;
  if (format === 'pdf') return printTrip(itinerary);
  if (format === 'text') return downloadText(itinerary);
  const failed = () => toast.error('Could not copy', { description: 'Use “Download as text” instead.' });
  if (!navigator.clipboard) return failed();
  navigator.clipboard.writeText(tripAsText(itinerary)).then(() => toast.success('Trip copied', { description: 'Paste it into a chat, email or notes app.' }), failed);
}

/** Elements that use ← and → themselves; scene browsing leaves the keys to them. */
const ARROW_KEY_OWNERS = 'input, textarea, select, [contenteditable="true"], [role="tablist"], [role="radiogroup"], [role="listbox"], [role="slider"], [role="menu"], [role="grid"], [aria-roledescription^="sortable"]';

const scrollTo = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

/** Coordinates generation, refinement review and editing actions for the planner page. */
export function usePlanner() {
  const { form, setForm, store } = useWorkspace();
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
  /** A refinement is in flight or under review; the trip on screen is not the one the store holds. */
  const reviewLocked = !!pending || (running && runKind === 'refine');
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
      // A place named in the brief takes over the scene the moment it is sent, not when the plan lands.
      matchDestination(request.brief);
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
    [form, setForm, generation, store, simulate, matchDestination],
  );

  const refine = useCallback(
    (instruction: string) => {
      if (!trip) return;
      const { errors, value } = RefineItineraryDto.validate({ instruction, itinerary: trip.itinerary });
      if (errors) {
        setRefineError(errors[0]?.message ?? 'Check the requested change.');
        return;
      }
      const { instruction: text, itinerary: base } = value;
      setRefineError(null);
      setRefineText(text);
      lastRun.current = { kind: 'refine', instruction: text };
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

  // ⌘K focuses the prompt; ⌘Z / ⇧⌘Z undo and redo outside text fields, except while a refinement
  // is running or under review: the itinerary is locked then, and Apply would overwrite the undo.
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
      if (reviewLocked) return;
      if (event.shiftKey) store.redo();
      else store.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, focusPrompt, reviewLocked]);

  // ← / → browse the scenes, like the caption's arrows, whenever the arrow keys are not already
  // someone else's: text fields, the day tabs, keyboard reordering, radio groups, menus, dialogs.
  const browse = useRef(scene);
  useEffect(() => {
    browse.current = scene;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(ARROW_KEY_OWNERS)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      // Only while the scene is on screen: browsing a picture nobody can see would be a surprise.
      const rect = document.getElementById('scene')?.getBoundingClientRect();
      if (!rect || rect.bottom < 120 || rect.top > window.innerHeight - 120) return;
      event.preventDefault();
      if (event.key === 'ArrowRight') browse.current.next();
      else browse.current.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeDay = trip?.itinerary.days.some((d) => d.id === activeDayId) ? activeDayId! : (trip?.itinerary.days[0]?.id ?? '');
  const problem = state.status === 'error' || state.status === 'unplannable' ? state : null;
  const generating = running && runKind === 'generate';
  const refining = running && runKind === 'refine';
  const review = useMemo(() => (pending ? reviewMarks(pending.diff, pending.next) : null), [pending]);
  const requestNew = () => (!trip || saved || trip.source === 'sample' ? startNew() : setConfirmNew(true));

  const openTrip = (next: Trip) => {
    loadTrip(next);
    if (next.request) setForm(next.request);
    scrollTo('trip');
  };

  const applyRefinement = () => {
    if (!pending) return;
    const next = pending.next;
    store.edit(() => next);
    setApplied(review);
    setPending(null);
    setRefineText('');
    toast.success('Changes applied', { action: { label: 'Undo', onClick: store.undo } });
  };

  const actionsFor = (dayId: string, stop: Stop, index: number) => ({
    onMove: (to: number) => store.edit((it) => moveStop(it, dayId, index, to)),
    onMoveToDay: (target: string) => {
      if (!trip) return;
      store.edit((it) => moveStopToDay(it, stop.id, target));
      const n = trip.itinerary.days.findIndex((d) => d.id === target) + 1;
      toast(`Moved to day ${n}`, { action: { label: 'Show', onClick: () => setActiveDayId(target) } });
    },
    onRemove: () => remove(stop.id),
  });

  const askForDay = (dayNumber: number) => {
    setRefineText(`Add three or four stops to day ${dayNumber}`);
    requestAnimationFrame(() => refineRef.current?.focus());
  };

  return {
    form, setForm, trip, store, generation, library, scene, health, simulate, setSimulate,
    briefError, clearBriefError: () => setBriefError(null),
    refineText, setRefineText, refineError, clearRefineError: () => setRefineError(null),
    pending, discardRefinement: () => setPending(null), applyRefinement,
    activeDay, setActiveDayId, applied, review, confirmNew, setConfirmNew,
    promptRef, refineRef, state, running, runKind, saved, notConfigured, voice,
    generate, refine, retry, focusPrompt, openSample, hideSample, openTrip,
    startNew, requestNew, save, actionsFor, askForDay, problem, generating, refining,
    exportCurrentTrip: (format: ExportFormat) => { if (trip) exportTrip(trip, format); },
    reorder: (dayId: string, from: number, to: number) => store.edit((it) => moveStop(it, dayId, from, to)),
  };
}
