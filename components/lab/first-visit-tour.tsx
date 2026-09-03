'use client';

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import { firstVisitTourSteps } from '@/lib/lab/first-visit-tour';
import {
  experienceOptions,
  getExperienceTitle,
  isExperienceModeViable,
  type ExperienceMode,
  type SiteToolsSupport,
} from '@/lib/lab/novice-journey';

const TOUR_STORAGE_KEY = 'left-out-site-tools-first-visit-v2';

type StoredTourState = {
  completed: boolean;
  step: number;
};

function readStoredTour(): StoredTourState | undefined {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredTourState>;
    if (
      typeof parsed.completed !== 'boolean' ||
      typeof parsed.step !== 'number'
    ) {
      return undefined;
    }
    return {
      completed: parsed.completed,
      step: Math.max(
        0,
        Math.min(firstVisitTourSteps.length - 1, Math.floor(parsed.step)),
      ),
    };
  } catch {
    return undefined;
  }
}

function storeTourState(state: StoredTourState) {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The tour still works when browser storage is unavailable.
  }
}

export function FirstVisitTour({
  forceOpen,
  mode,
  setupConfirmed,
  siteToolsSupport,
  clientLabel,
  onModeChange,
  onConfirmSetup,
  onFinish,
}: {
  forceOpen: boolean;
  mode: ExperienceMode;
  setupConfirmed: boolean;
  siteToolsSupport: SiteToolsSupport;
  clientLabel: string;
  onModeChange: (mode: ExperienceMode) => void;
  onConfirmSetup: () => void;
  onFinish: () => void;
}) {
  const [open, setOpen] = useState(forceOpen);
  const [stepIndex, setStepIndex] = useState(0);
  const step = firstVisitTourSteps[stepIndex];
  const lastStep = stepIndex === firstVisitTourSteps.length - 1;
  const choosingSetup = step.stage === 'Choose';
  const selectedModeViable = isExperienceModeViable(mode, siteToolsSupport);
  const setupChoiceReady =
    siteToolsSupport !== 'checking' && selectedModeViable;

  useEffect(() => {
    const stored = readStoredTour();
    if (stored?.completed) return;
    const timer = window.setTimeout(() => {
      setStepIndex(stored?.step ?? 0);
      setOpen(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector<HTMLElement>(step.anchor);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('first-visit-tour-target');
    return () => target?.classList.remove('first-visit-tour-target');
  }, [open, step.anchor]);

  function dismiss() {
    storeTourState({ completed: true, step: stepIndex });
    setOpen(false);
  }

  function restart() {
    setStepIndex(0);
    storeTourState({ completed: false, step: 0 });
    setOpen(true);
  }

  function goBack() {
    const next = Math.max(0, stepIndex - 1);
    setStepIndex(next);
    storeTourState({ completed: false, step: next });
  }

  function goForward() {
    if (choosingSetup) {
      if (!setupChoiceReady) return;
      if (!setupConfirmed) onConfirmSetup();
    }
    if (lastStep) {
      storeTourState({ completed: true, step: stepIndex });
      setOpen(false);
      onFinish();
      return;
    }
    const next = stepIndex + 1;
    setStepIndex(next);
    storeTourState({ completed: false, step: next });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    dismiss();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="fixed right-3 bottom-3 z-30 h-10 border-foreground bg-background px-3 shadow-[3px_3px_0_0_var(--foreground)] sm:right-5 sm:bottom-5"
        onClick={restart}
      >
        <CircleHelp data-icon="inline-start" />
        First-time tour
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-auto bottom-4 z-[70] w-[calc(100%-1.5rem)] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 sm:bottom-6 sm:max-w-2xl"
        >
          <div className="border-b border-border bg-foreground px-5 py-4 text-background sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
                <ShieldCheck className="size-4 text-lime-300" />
                First-time walkthrough
              </div>
              <Badge className="bg-lime-300 text-slate-950">
                Nothing runs during this tour
              </Badge>
            </div>
          </div>

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-5 py-5 sm:px-6">
            <Progress
              value={((stepIndex + 1) / firstVisitTourSteps.length) * 100}
            >
              <ProgressLabel className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                {step.stage}
              </ProgressLabel>
              <ProgressValue className="font-mono text-[10px]">
                {() => `Step ${stepIndex + 1} of ${firstVisitTourSteps.length}`}
              </ProgressValue>
            </Progress>

            <DialogHeader className="mt-5 gap-3 text-left">
              <DialogTitle className="text-2xl font-semibold leading-tight tracking-[-0.03em]">
                {step.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6">
                {step.description}
              </DialogDescription>
            </DialogHeader>

            {choosingSetup ? (
              <fieldset className="mt-5 grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">
                  Choose a setup for this walkthrough
                </legend>
                {experienceOptions.map((option) => {
                  const selected = option.id === mode;
                  const selectable =
                    option.id !== 'site-tools' ||
                    siteToolsSupport === 'available';
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!selectable}
                      aria-pressed={selected}
                      className={`min-h-24 rounded-lg border p-3 text-left text-xs leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                        selected
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                          : 'border-border bg-card hover:bg-muted/50'
                      } disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-55`}
                      onClick={() => onModeChange(option.id)}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-semibold">{option.title}</span>
                        {selected ? (
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-emerald-700"
                            aria-label="Selected"
                          />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {option.id === 'site-tools'
                          ? siteToolsSupport === 'available'
                            ? 'Site Tools API detected in this page.'
                            : siteToolsSupport === 'checking'
                              ? 'Checking this page…'
                              : 'Not detected in this browser.'
                          : 'Always available; no tool invocation.'}
                      </span>
                    </button>
                  );
                })}
                <p className="rounded-lg border border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground sm:col-span-2">
                  Detected client: <strong>{clientLabel}</strong>. Selected:{' '}
                  <strong>{getExperienceTitle(mode)}</strong>. This choice does
                  not approve or invoke a tool.
                </p>
              </fieldset>
            ) : null}

            <div className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-700/25 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
              <Eye className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-emerald-800">
                  What to notice
                </p>
                <p className="mt-1 font-medium">{step.action}</p>
              </div>
            </div>
          </div>

          <DialogFooter className="m-0 flex-row items-center justify-between rounded-none px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={dismiss}>
              Skip for now
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={stepIndex === 0}
                onClick={goBack}
              >
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
              <Button
                type="button"
                disabled={choosingSetup && !setupChoiceReady}
                onClick={goForward}
              >
                {lastStep
                  ? 'Finish and start Lesson 1'
                  : choosingSetup
                    ? setupConfirmed
                      ? 'Keep this setup'
                      : 'Use this setup'
                    : 'Next'}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
