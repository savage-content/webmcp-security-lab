'use client';

import {
  AlertTriangle,
  Database,
  Download,
  FileSearch,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EvidenceReceipt } from '@/lib/lab/types';

export function LedgerPanel({
  receipts,
  loading,
  unavailable,
  onExport,
}: {
  receipts: EvidenceReceipt[];
  loading: boolean;
  unavailable: boolean;
  onExport: (receipt: EvidenceReceipt) => void;
}) {
  return (
    <section
      id="ledger"
      className="mx-auto max-w-[1480px] px-5 py-12 lg:px-8 lg:py-16"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Proof and responsible reporting
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            Prove what happened. Report only what is safe to share.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          A receipt is private evidence for one run. A safety report is a
          separate, redacted lead for human review—not proof that a site is
          vulnerable.
        </p>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-emerald-700" />
              <h3 className="font-semibold">Private evidence receipts</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Runs are appended, never silently replaced. Receipts retain the
              detail needed to compare approval, result, and observable effect.
            </p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Reading the evidence ledger…
            </div>
          ) : unavailable ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold">Ledger is unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">
                New runs still show a local receipt, but they are not claimed as
                durable.
              </p>
            </div>
          ) : receipts.length === 0 ? (
            <div className="flex flex-col items-center p-10 text-center">
              <Database className="size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">No stored runs yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete a fixture to append the first evidence receipt.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {receipts.slice(0, 12).map((receipt) => (
                <article
                  key={receipt.id}
                  className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto] md:items-center md:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {receipt.scenario.title}
                    </p>
                    <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">
                      {receipt.id}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(receipt.timestamp).toLocaleString()}
                  </span>
                  <Badge
                    variant={
                      receipt.verdict === 'PASS' ? 'default' : 'destructive'
                    }
                    className={`w-fit font-mono ${
                      receipt.verdict === 'PASS'
                        ? 'bg-emerald-100 text-emerald-900'
                        : ''
                    }`}
                  >
                    {receipt.verdict}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Export ${receipt.scenario.title} evidence receipt`}
                    onClick={() => onExport(receipt)}
                  >
                    <Download />
                  </Button>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900">
              <FileSearch className="size-4" />
            </span>
            <div>
              <h3 className="font-semibold">Report a WebMCP concern safely</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                The extension never reports a site automatically. You review a
                redacted draft before anything could leave your device, and a
                human reviews it before any future security feed.
              </p>
            </div>
          </div>

          <ol className="mt-5 space-y-3 text-sm">
            <ReportStep number="1" text="The HUD explains what looked wrong." />
            <ReportStep
              number="2"
              text="You inspect exactly what would be shared."
            />
            <ReportStep
              number="3"
              text="A human verifies it before publication."
            />
          </ol>

          <details className="mt-5 overflow-hidden rounded-lg border border-border">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              Preview a practice safety report
            </summary>
            <div className="space-y-4 border-t border-border bg-muted/35 p-4 text-xs leading-5">
              <div className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-amber-950">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  <strong>Practice report only.</strong> This lesson uses a
                  local address and fake data, so it cannot be submitted.
                </p>
              </div>
              <div>
                <p className="font-semibold">Included in a real draft</p>
                <p className="mt-1 text-muted-foreground">
                  Public site host, finding category, date, browser family,
                  WebMCP stages, declaration fingerprint and structural counts,
                  and observed effect counts.
                </p>
              </div>
              <div>
                <p className="font-semibold">Never included</p>
                <p className="mt-1 text-muted-foreground">
                  Page text, screenshots, paths or queries, cookies, account
                  data, agent conversations, raw results, or the full receipt.
                </p>
              </div>
              <p className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                Real submission remains disabled until a privacy and security
                review approves the intake destination.
              </p>
              <p className="text-muted-foreground">
                This report reflects self-reported evidence readiness. LeftOut
                Security has not inspected, tested, or independently validated
                the described system.
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function ReportStep({ number, text }: { number: string; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-[10px] font-semibold text-background">
        {number}
      </span>
      <span>{text}</span>
    </li>
  );
}
