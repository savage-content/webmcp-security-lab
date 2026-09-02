'use client';

import { Bot, CheckCircle2, FlaskConical, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  experienceOptions,
  getExperienceTitle,
  isExperienceModeSelectable,
  isExperienceModeViable,
  recommendExperienceMode,
  type ExperienceMode,
  type SiteToolsSupport,
} from '@/lib/lab/novice-journey';

export type { ExperienceMode } from '@/lib/lab/novice-journey';

const experienceIcons = {
  'site-tools': Bot,
  'local-guard': ShieldCheck,
  'read-only': FlaskConical,
} as const satisfies Record<ExperienceMode, typeof Bot>;

export function ExperienceChooser({
  mode,
  confirmed,
  siteToolsSupport,
  clientLabel,
  localGuardReady,
  recoveryMessage,
  onChange,
  onLocalGuardReadyChange,
  onConfirm,
}: {
  mode: ExperienceMode;
  confirmed: boolean;
  siteToolsSupport: SiteToolsSupport;
  clientLabel: string;
  localGuardReady: boolean;
  recoveryMessage?: string;
  onChange: (mode: ExperienceMode) => void;
  onLocalGuardReadyChange: (ready: boolean) => void;
  onConfirm: () => void;
}) {
  const recommended = recommendExperienceMode(siteToolsSupport);
  const viable = isExperienceModeViable(
    mode,
    siteToolsSupport,
    localGuardReady,
  );

  return (
    <section
      id="setup"
      aria-labelledby="experience-heading"
      className="mt-8 scroll-mt-20 overflow-hidden rounded-xl border border-foreground bg-card"
    >
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-800">
              Required setup check
            </p>
            <h2 id="experience-heading" className="mt-1 text-2xl font-semibold">
              Use the path this browser can actually support.
            </h2>
          </div>
          <Badge
            variant="outline"
            className={
              siteToolsSupport === 'available'
                ? 'border-emerald-700/30 bg-emerald-50 text-emerald-900'
                : siteToolsSupport === 'unavailable'
                  ? 'border-amber-700/30 bg-amber-50 text-amber-950'
                  : ''
            }
          >
            {siteToolsSupport === 'checking'
              ? 'Checking Site Tools…'
              : siteToolsSupport === 'available'
                ? 'Site Tools API detected'
                : 'Site Tools API not detected'}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          This page checks for the Site Tools browser API; it does not guess
          from branding. Confirm one viable path before the first lesson
          unlocks. Changing paths closes any unused approval and restarts the
          lesson.
        </p>
        <p className="mt-2 text-xs font-medium text-foreground">
          Observed client: {clientLabel}
        </p>
      </div>
      <fieldset className="grid gap-px bg-border lg:grid-cols-3">
        <legend className="sr-only">Practice setup</legend>
        {experienceOptions.map((option) => {
          const selected = option.id === mode;
          const selectable = isExperienceModeSelectable(
            option.id,
            siteToolsSupport,
          );
          const Icon = experienceIcons[option.id];
          const status =
            option.id === 'site-tools'
              ? siteToolsSupport === 'available'
                ? 'Detected here · recommended'
                : siteToolsSupport === 'unavailable'
                  ? 'Unavailable in this browser'
                  : 'Detection in progress'
              : option.id === 'local-guard'
                ? localGuardReady
                  ? 'Advanced · HUD connection confirmed'
                  : 'Advanced · requires local setup'
                : recommended === 'read-only'
                  ? 'Recommended for this browser'
                  : 'Always available';
          return (
            <button
              id={
                option.id === 'local-guard' ? 'local-guard-option' : undefined
              }
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={!selectable}
              className={`min-h-56 bg-card p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 sm:p-6 ${
                selected ? 'bg-emerald-50' : 'hover:bg-muted/45'
              } disabled:cursor-not-allowed disabled:bg-muted/55 disabled:opacity-65`}
              onClick={() => onChange(option.id)}
            >
              <span className="flex items-start justify-between gap-4">
                <span className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {selected ? (
                  <CheckCircle2
                    className="size-5 text-emerald-700"
                    aria-label="Selected"
                  />
                ) : null}
              </span>
              <Badge
                variant="outline"
                className="mt-6 border-emerald-700/25 text-emerald-800"
              >
                {status}
              </Badge>
              <span className="mt-3 block text-base font-semibold">
                {option.title}
              </span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {option.detail}
              </span>
              {option.id === 'local-guard' ? (
                <span className="mt-3 block text-[11px] font-medium leading-5 text-amber-900">
                  The page cannot verify installation or pairing. Choose this
                  only after the Local Guard HUD says it is connected.
                </span>
              ) : null}
            </button>
          );
        })}
      </fieldset>
      {mode === 'local-guard' ? (
        <label className="flex cursor-pointer items-start gap-3 border-t border-amber-300/45 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950 sm:px-6">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-emerald-800"
            checked={localGuardReady}
            onChange={(event) =>
              onLocalGuardReadyChange(event.currentTarget.checked)
            }
          />
          <span>
            <strong>My Local Guard HUD says “Connected.”</strong> Pairing and
            extension state are browser-owned, so this page requires your
            confirmation before it treats the local path as viable.
          </span>
        </label>
      ) : null}
      <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-sm font-semibold">
            {confirmed
              ? `Ready: ${getExperienceTitle(mode)}`
              : 'Confirm this setup to unlock Lesson 1'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {recoveryMessage ??
              (confirmed
                ? 'Your lesson position is saved. Approvals and live authority are never restored after reload.'
                : 'This confirmation selects instructions only. It does not approve or run a tool.')}
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11 shrink-0"
          disabled={siteToolsSupport === 'checking' || !viable || confirmed}
          onClick={onConfirm}
        >
          {confirmed
            ? 'Setup confirmed'
            : `Continue with ${getExperienceTitle(mode)}`}
          {confirmed ? <CheckCircle2 data-icon="inline-end" /> : null}
        </Button>
      </div>
    </section>
  );
}
