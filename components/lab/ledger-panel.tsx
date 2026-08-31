'use client';

import { Database, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EvidenceReceipt } from '@/lib/lab/types';

export function LedgerPanel({
  receipts,
  loading,
  unavailable,
  onDownload,
}: {
  receipts: EvidenceReceipt[];
  loading: boolean;
  unavailable: boolean;
  onDownload: (receipt: EvidenceReceipt) => void;
}) {
  return (
    <section id="ledger" className="mx-auto max-w-[1480px] px-5 py-12 lg:px-8 lg:py-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Durable evidence ledger
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            Runs are appended, never silently replaced.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          The ledger stores the declaration, arguments, confirmation state, raw
          result, before/after state, side effects, verdict, and remediation.
        </p>
      </div>

      <div className="mt-7 overflow-hidden rounded-xl border border-border bg-card">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Reading the evidence ledger…
          </div>
        ) : unavailable ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">Ledger is unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New runs still show a local receipt, but they are not claimed as durable.
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
                  variant={receipt.verdict === 'PASS' ? 'default' : 'destructive'}
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
                  aria-label={`Download ${receipt.scenario.title} evidence receipt`}
                  onClick={() => onDownload(receipt)}
                >
                  <Download />
                </Button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
