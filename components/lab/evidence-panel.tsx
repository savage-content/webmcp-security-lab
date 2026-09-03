'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  Download,
  FileDown,
  FileJson,
  RefreshCw,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  EvidenceReceipt,
  RiskAssessment,
  ScenarioDefinition,
} from '@/lib/lab/types';

export type PersistenceState = 'idle' | 'saved';

export function EvidencePanel({
  scenario,
  receipt,
  persistence,
  onExport,
}: {
  scenario: ScenarioDefinition;
  receipt?: EvidenceReceipt;
  persistence: PersistenceState;
  onExport: (receipt: EvidenceReceipt) => void;
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
              onClick={() => onExport(receipt)}
            >
              <Download data-icon="inline-start" />
              Export receipt
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
              <JsonBlock
                label="Raw result"
                value={receipt.effective.rawResult}
              />
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-6 text-center">
              <FileJson className="size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">
                Awaiting a controlled run
              </p>
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
          <p className="bg-muted px-5 py-4 text-[11px] leading-5 text-muted-foreground lg:col-span-2 lg:px-7">
            {receipt.limitation}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function SecureComparison({
  scenario,
  assessment,
  confirmationCopy,
  receipt,
  persistence,
  running,
  onRetest,
  onExportPolicy,
}: {
  scenario: ScenarioDefinition;
  assessment: RiskAssessment;
  confirmationCopy: string;
  receipt?: EvidenceReceipt;
  persistence: PersistenceState;
  running: boolean;
  onRetest: () => void;
  onExportPolicy: () => void;
}) {
  const securePassed = receipt?.verdict === 'PASS';

  return (
    <section
      id="builder"
      className="scroll-mt-20 border-t border-border bg-[color-mix(in_oklch,var(--accent),white_78%)] p-5 lg:p-8"
    >
      <div className="grid gap-7 xl:grid-cols-[0.72fr_1.28fr]">
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
          <ol className="mt-5 space-y-2">
            {scenario.builder.changes.map((change, index) => (
              <li
                key={change}
                className="flex items-start gap-2 text-xs leading-5"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-[9px] text-background">
                  {index + 1}
                </span>
                {change}
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-md border border-border bg-card/80 p-3">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Retest approval scope
            </p>
            <p className="mt-2 text-xs font-medium leading-5">
              “{confirmationCopy}”
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={onRetest} disabled={running}>
              <RefreshCw data-icon="inline-start" />
              {running ? 'Retesting…' : 'Run secure retest'}
            </Button>
            <Button variant="outline" onClick={onExportPolicy}>
              <FileDown data-icon="inline-start" />
              Export learning policy
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Learning policies describe allow, warn, or ask guidance. They are
            marked non-enforceable and cannot authorize another client.
          </p>
          {receipt ? (
            <div
              className={`mt-4 rounded-md border p-3 ${
                securePassed
                  ? 'border-emerald-700/25 bg-emerald-50 text-emerald-950'
                  : 'border-amber-700/30 bg-amber-50 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  {securePassed ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <AlertTriangle className="size-4" />
                  )}
                  Secure retest {receipt.verdict}
                </p>
                <span className="font-mono text-[9px] uppercase">
                  {persistence === 'saved' ? 'session receipt' : persistence}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 opacity-75">
                Receipt {receipt.id.slice(0, 8)}{' '}
                {securePassed
                  ? 'satisfies the scenario-specific safety invariants against a fresh synthetic fixture.'
                  : 'does not satisfy every scenario-specific safety invariant.'}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-[1fr_auto_1fr]">
            <ComparisonTool label="Vulnerable" tool={scenario.tool} />
            <div className="hidden items-center bg-card px-2 md:flex">
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
            <ComparisonTool label="Secure" tool={scenario.secureTool} secure />
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-2">
            <CodeComparison
              label="Before"
              code={scenario.builder.vulnerableCode}
              warning
            />
            <CodeComparison label="After" code={scenario.builder.secureCode} />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <TestTube2 className="size-3.5" />
                Regression test to add
              </p>
              <Badge variant="outline">
                {assessment.policyAction} until verified
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5">
              {scenario.builder.testToAdd}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeComparison({
  label,
  code,
  warning = false,
}: {
  label: string;
  code: string;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 bg-[#101722] p-4 text-slate-100">
      <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        <Code2
          className={`size-3.5 ${warning ? 'text-amber-300' : 'text-lime-300'}`}
        />
        {label}
      </div>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-5 text-slate-200">
        {code}
      </pre>
    </div>
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
    state === 'saved' ? 'Private session receipt' : 'Receipt created';

  return (
    <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-background/75">
      {state === 'saved' ? (
        <ShieldCheck className="size-3.5" />
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
      <p className="mt-4 break-all font-mono text-xs font-semibold">
        {tool.name}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {tool.description}
      </p>
      <JsonBlock label="Schema" value={tool.inputSchema} />
    </div>
  );
}
