import { ArrowRight, Plus, X } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { LIMITS } from '@triptinker/contracts';
import { HeroGlow } from '@/components/site/hero-glow';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeToggle } from '@/components/site/theme-toggle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SceneCaption, SceneStage } from '@/features/scenes/scene-stage';
import { SCENES, sceneSrc } from '@/features/scenes/scenes';
import { FailureLab } from './components/failure-lab';
import { LibraryMenu } from './components/library-menu';
import { PromptCard } from './components/prompt-card';
import { RefineBar } from './components/refine-bar';
import { ResultSection } from './components/result-section';
import { RunPanel } from './components/run-panel';
import { FeatureCells, ProblemCell } from './components/strip-cells';
import { usePlanner } from './use-planner';

const EXAMPLES = [
  { label: 'Kyoto in autumn', brief: 'Four days in Kyoto in mid-November for the autumn leaves. Temples and gardens, quiet mornings, vegetarian-friendly food, one day trip to Nara.' },
  { label: 'Mexico City with kids', brief: 'A long weekend in Mexico City with our two-year-old. Parks, markets and great tacos, back at the hotel for naps around 1pm.' },
  { label: 'Rainy Edinburgh', brief: 'Two days in Edinburgh in February that still work if it rains all day. History, cosy pubs, one whisky tasting, no hiking.' },
  { label: 'Food in Rome', brief: 'Three days in Rome for people who travel to eat: markets, trattorias, a cooking class, and one big sight a day.' },
];

/** Frosted chip over the scene, for the example briefs and the sample. */
const CHIP = 'frost h-8 rounded-lg px-3 text-[13px] font-medium text-ink shadow-[var(--chip-shadow)] transition-[background-color,transform] hover:bg-surface active:scale-95 disabled:opacity-60';

export function PlannerPage() {
  const {
    form, setForm, trip, store, generation, library, scene, health, simulate, setSimulate,
    briefError, clearBriefError, refineText, setRefineText, refineError, clearRefineError,
    pending, discardRefinement, applyRefinement, activeDay, setActiveDayId, applied, review,
    confirmNew, setConfirmNew, promptRef, refineRef, state, running, runKind, saved,
    notConfigured, voice, generate, refine, retry, focusPrompt, openSample, hideSample,
    openTrip, startNew, requestNew, save, actionsFor, askForDay, problem, generating,
    refining, exportCurrentTrip, reorder,
  } = usePlanner();
  // The caption names the scene on screen, so it changes when the picture starts to, not before.
  const [revealed, setRevealed] = useState(scene.scene);

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
          onOpen={openTrip}
          onDelete={library.remove}
        />
        <ThemeToggle />
      </SiteHeader>

      <main className="mx-auto w-full max-w-[1104px] flex-1 px-4 sm:px-6 xl:px-0">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="flex flex-col items-center gap-6 pt-8 pb-10 text-center sm:pt-10 md:pb-12">
          <div className="flex flex-col gap-4">
            <h1 id="hero-title" className="font-display text-[clamp(1.5rem,calc((100vw-2rem)*0.1),2.625rem)] leading-[1.06] text-ink-strong sm:text-[56px] lg:text-[68px] lg:leading-[1.06]">
              Where to <em>next</em>? <br />
              Say it in <em>one</em> sentence.
            </h1>
            <p className="mx-auto max-w-2xl text-[16px] leading-7 text-balance text-muted md:text-[18px] md:leading-7">
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
          <SceneStage scene={scene.scene} transition={scene.transition} dim={generating} onReveal={setRevealed} className="flex min-h-[520px] flex-col items-center justify-end px-4 pt-36 pb-16 md:min-h-[540px] md:pb-20">
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
                onClearError={() => clearBriefError()}
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
              scene={revealed}
              position={{ index: SCENES.findIndex((s) => s.id === revealed.id), total: SCENES.length }}
              onPrev={scene.prev}
              onNext={scene.next}
              className="absolute right-4 bottom-4 z-10 max-w-[calc(100%-2rem)]"
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
                sceneSrc={sceneSrc(scene.scene, 1920)}
                activeDayId={activeDay}
                onActiveDay={setActiveDayId}
                saved={saved}
                canUndo={store.canUndo}
                canRedo={store.canRedo}
                onUndo={store.undo}
                onRedo={store.redo}
                onSave={save}
                onHideSample={hideSample}
                onExport={exportCurrentTrip}
                onReorder={reorder}
                actionsFor={actionsFor}
                onAskForDay={notConfigured ? undefined : askForDay}
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
                  onDiscard={discardRefinement}
                  onApply={applyRefinement}
                  error={refineError}
                  onClearError={() => clearRefineError()}
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
