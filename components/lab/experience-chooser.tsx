'use client';

import { Bot, CheckCircle2, FlaskConical, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export type ExperienceMode = 'site-tools' | 'local-guard' | 'read-only';

const experienceOptions = [
  {
    id: 'site-tools',
    icon: Bot,
    eyebrow: 'Recommended',
    title: 'ChatGPT or Codex built-in browser',
    detail:
      'Use Site Tools directly with Sol or Terra. No extension or local relay is needed. Availability also depends on workspace and rollout.',
  },
  {
    id: 'local-guard',
    icon: ShieldCheck,
    eyebrow: 'Advanced prototype',
    title: 'LeftOut Local Guard',
    detail:
      'Use regular Chromium with the unpacked LeftOut extension and local relay to test monitoring, drift alerts, one-use enforcement, and local reporting.',
  },
  {
    id: 'read-only',
    icon: FlaskConical,
    eyebrow: 'No compatible client required',
    title: 'Read-only or explicit harness',
    detail:
      'Study the declarations without invoking anything. The optional page harness is labeled separately and never counts as Site Tools discovery or invocation.',
  },
] as const satisfies ReadonlyArray<{
  id: ExperienceMode;
  icon: typeof Bot;
  eyebrow: string;
  title: string;
  detail: string;
}>;

export function ExperienceChooser({
  mode,
  onChange,
}: {
  mode: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
}) {
  return (
    <section
      id="setup"
      aria-labelledby="experience-heading"
      className="mt-8 scroll-mt-20 overflow-hidden rounded-xl border border-foreground bg-card"
    >
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Choose your setup
        </p>
        <h2 id="experience-heading" className="mt-1 text-2xl font-semibold">
          How are you opening this lab?
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          The lessons are the same, but the agent handoff is different. Choose
          one path so the page gives you the right instructions.
        </p>
      </div>
      <fieldset className="grid gap-px bg-border lg:grid-cols-3">
        <legend className="sr-only">Practice setup</legend>
        {experienceOptions.map((option) => {
          const selected = option.id === mode;
          const Icon = option.icon;
          return (
            <button
              id={
                option.id === 'local-guard' ? 'local-guard-option' : undefined
              }
              key={option.id}
              type="button"
              aria-pressed={selected}
              className={`min-h-56 bg-card p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 sm:p-6 ${
                selected ? 'bg-emerald-50' : 'hover:bg-muted/45'
              }`}
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
                {option.eyebrow}
              </Badge>
              <span className="mt-3 block text-base font-semibold">
                {option.title}
              </span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {option.detail}
              </span>
              {option.id === 'local-guard' ? (
                <span className="mt-3 block text-[11px] font-medium leading-5 text-amber-900">
                  Separate from ChatGPT Site Tools and from OpenAI&apos;s
                  browser extension.
                </span>
              ) : null}
            </button>
          );
        })}
      </fieldset>
    </section>
  );
}
