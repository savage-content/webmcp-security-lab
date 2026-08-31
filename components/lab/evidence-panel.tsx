'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  EvidenceReceipt,
  ScenarioDefinition,
} from '@/lib/lab/types';

export type PersistenceState = 'idle' | 'saving' | 'saved' | 'error';

export function EvidencePanel({
  scenario,
  receipt,
  persistence,
  onDownload,
}: {
  scenario: ScenarioDefinition;
  receipt?: EvidenceReceipt;
  persistence: PersistenceState;
  onDownload: (receipt: EvidenceReceipt) => void;
}) {
  return (
    <section id="evidence" className="scroll-mt-6 border-t border-foreground">
      <div className="flex flex-col gap-4 border-b border-border bg-foreground px-5 py-5 text-background md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-background/60">
            Evidence comparator
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">
            Presented → Declared → Effective
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <PersistenceBadge state={persistence} hasReceipt={Boolean(receipt)} />
          {receipt ? (
            <Button
              variant="secondary"
              className="h-9 bg-background text-foreground hover:bg-background/90"
              onClick={() => onDownload(receipt)}
            >
              <Download data-icon="inline-start" />
              JSON receipt
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-px bg-border xl:grid-cols-3">
        <SurfaceColumn number="01" label="Presented" tone="neutral">
          <h4 className="text-lg font-semibold tracking-tight">
            {scenario.presented.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {scenario.presented.description}
          </p>
          <div className="mt-5 rounded-md border border-border bg-background p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
              Approval language
            </p>
            <p className="mt-2 text-xs font-medium leading-5">
              “{scenario.presented.confirmationCopy}”
            </p>
          </div>
          {receipt ? (
            <JsonBlock label="Before state" value={receipt.effective.before} />
          ) : null}
        </SurfaceColumn>

        <SurfaceColumn number="02" label="Declared" tone="warning">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {scenario.tool.name}
            </Badge>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {scenario.tool.description}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-2 text-xs">
            <AnnotationCell
              label="readOnlyHint"
              value={String(scenario.tool.annotations.readOnlyHint)}
            />
            <AnnotationCell
              label="untrustedContent"
              value={String(scenario.tool.annotations.untrustedContentHint)}
            />
          </dl>
          <JsonBlock label="Input schema" value={scenario.tool.inputSchema} />
          {receipt ? (
            <JsonBlock label="Arguments" value={receipt.invocation.arguments} />
          ) : null}
        </SurfaceColumn>

        <SurfaceColumn number="03" label="Effective" tone="effective">
          {receipt ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Badge
                  variant="destructive"
                  className="h-7 rounded-md px-2.5 font-mono tracking-[0.12em]"
                >
                  {receipt.verdict}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {receipt.invocation.channel}
                </span>
              </div>
              <div className="mt-5 rounded-md border border-amber-700/30 bg-amber-50 p-3 text-amber-950">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <AlertTriangle className="size-4" />
                  Observed side effects
                </p>
                {receipt.effective.sideEffects.length ? (
                  <ul className="mt-2 space-y-1 text-xs leading-5">
                    {receipt.effective.sideEffects.map((effect) => (
                      <li key={effect}>• {effect}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-5">
                    No state mutation. The finding is in the raw returned data.
                  </p>
                )}
              </div>
              <JsonBlock label="After state" value={receipt.effective.after} />
              <JsonBlock label="Raw result" value={receipt.effective.rawResult} />
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-6 text-center">
              <FileJson className="size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Awaiting a controlled run</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                Run the handler to capture before/after state, the raw result,
                side effects, and a verdict.
              </p>
            </div>
          )}
        </SurfaceColumn>
      </div>

      {receipt ? (
        <div className="grid gap-px border-t border-border bg-border lg:grid-cols-2">
          <div className="bg-card p-5 lg:p-7">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Plain-language debrief
            </p>
            <p className="mt-3 text-sm leading-6">{receipt.debrief}</p>
          </div>
          <div className="bg-card p-5 lg:p-7">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Remediation
            </p>
            <p className="mt-3 text-sm leading-6">{receipt.remediation}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SecureComparison({ scenario }: { scenario: ScenarioDefinition }) {
  return (
    <section className="border-t border-border bg-[color-mix(in_oklch,var(--accent),white_78%)] p-5 lg:p-8">
      <div className="grid gap-7 xl:grid-cols-[0.7fr_1.3fr]">
        <div>
          <div className="flex size-9 items-center justify-center rounded-md bg-foreground text-background">
            <ShieldCheck className="size-5" />
          </div>
          <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Secure-design comparison
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">
            Narrow, truthful, verifiable.
          </h3>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            {scenario.secureComparison}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-[1fr_auto_1fr]">
          <ComparisonTool label="Vulnerable" tool={scenario.tool} />
          <div className="hidden items-center bg-card px-2 md:flex">
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <ComparisonTool label="Secure" tool={scenario.secureTool} secure />
        </div>
      </div>
    </section>
  );
}

function SurfaceColumn({
  number,
  label,
  tone,
  children,
}: {
  number: string;
  label: string;
  tone: 'neutral' | 'warning' | 'effective';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'effective'
      ? 'border-t-[5px] border-t-[var(--accent-strong)] bg-card'
      : tone === 'warning'
        ? 'border-t-[5px] border-t-amber-500 bg-card'
        : 'border-t-[5px] border-t-foreground bg-card';

  return (
    <article className={`${toneClass} min-w-0 p-5 lg:p-6`}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-semibold text-muted-foreground">
          {number}
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </span>
      </div>
      {children}
    </article>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="mt-4 overflow-hidden rounded-md border border-border bg-[#101722] text-slate-100">
      <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-400">
        {label}
      </summary>
      <pre className="max-h-56 overflow-auto border-t border-white/10 p-3 font-mono text-[10px] leading-5 text-slate-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function AnnotationCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <dt className="font-mono text-[9px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-xs font-semibold">{value}</dd>
    </div>
  );
}

function PersistenceBadge({
  state,
  hasReceipt,
}: {
  state: PersistenceState;
  hasReceipt: boolean;
}) {
  if (!hasReceipt) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-background/60">
        No receipt yet
      </span>
    );
  }

  const label =
    state === 'saving'
      ? 'Appending…'
      : state === 'saved'
        ? 'Stored in ledger'
        : state === 'error'
          ? 'Storage failed'
          : 'Receipt created';

  return (
    <span
      className={`flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${state === 'error' ? 'text-amber-300' : 'text-background/75'}`}
    >
      {state === 'saved' ? (
        <Database className="size-3.5" />
      ) : state === 'error' ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      {label}
    </span>
  );
}

function ComparisonTool({
  label,
  tool,
  secure = false,
}: {
  label: string;
  tool: ScenarioDefinition['tool'];
  secure?: boolean;
}) {
  return (
    <div className="min-w-0 bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={secure ? 'default' : 'outline'}>{label}</Badge>
        {secure ? <ShieldCheck className="size-4 text-emerald-700" /> : null}
      </div>
      <p className="mt-4 break-all font-mono text-xs font-semibold">{tool.name}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {tool.description}
      </p>
      <JsonBlock label="Schema" value={tool.inputSchema} />
    </div>
  );
}
