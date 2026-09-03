'use client';

import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { classifyConformanceObservation } from '@/lib/site-tools/conformance';

type SavedNavigationContext = {
  version: string;
  sessionId: string;
  documentId: string;
  registrationId: string;
  model: 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna' | 'unknown';
  workspace: 'eligible-workspace' | 'enterprise-or-edu' | 'unknown';
  executionSurface:
    | 'chatgpt-built-in-browser'
    | 'external-browser-membrane'
    | 'in-page-harness';
  appVersion: string;
  positiveBaseline: boolean;
};

export function NavigationControl() {
  const [saved, setSaved] = useState<SavedNavigationContext>();
  const [documentId, setDocumentId] = useState('');
  const [oldTool, setOldTool] = useState<
    'unknown' | 'observed' | 'not-observed'
  >('unknown');

  useEffect(() => {
    queueMicrotask(() => setDocumentId(crypto.randomUUID()));
    const raw = sessionStorage.getItem('leftout-site-tools-navigation-control');
    if (!raw) return;
    try {
      const value = JSON.parse(raw) as SavedNavigationContext;
      if (value && typeof value === 'object')
        queueMicrotask(() => setSaved(value));
    } catch {
      // An invalid carry-over is shown as missing rather than interpreted.
    }
  }, []);

  const result =
    saved && documentId
      ? classifyConformanceObservation({
          caseId: 'C03-navigation-binding',
          provenance: {
            model: saved.model,
            workspace: saved.workspace,
            executionSurface: saved.executionSurface,
            appVersion: saved.appVersion,
            sessionId: saved.sessionId,
            documentId,
            registrationId: saved.registrationId,
            observedAt: new Date().toISOString(),
          },
          page: { apiSupport: 'unknown', registration: 'not-attempted' },
          client: { discovery: 'unknown', invocation: 'unknown' },
          browserSafetyReview: 'unknown',
          positiveBaselineInSameSession: saved.positiveBaseline,
          previousDocumentInvocation: oldTool,
        })
      : undefined;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Badge variant="outline">C03 · Full navigation</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">
          The old document is gone.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Ask the same agent whether the previous Left Out conformance ping is
          still available. Do not ask it to invoke anything else.
        </p>

        {!saved ? (
          <Alert className="mt-6 border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle />
            <AlertTitle>No pre-navigation record</AlertTitle>
            <AlertDescription>
              Start this control from the conformance page. This result cannot
              be interpreted by itself.
            </AlertDescription>
          </Alert>
        ) : (
          <section className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-semibold">
              Record what the client reports
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setOldTool('not-observed')}>
                Old tool unavailable
              </Button>
              <Button
                variant="destructive"
                onClick={() => setOldTool('observed')}
              >
                Old tool still available
              </Button>
            </div>
            {result ? (
              <div className="mt-5 rounded-md border border-border bg-muted/50 p-4 text-sm">
                <strong>{result.verdict}</strong> — {result.summary}
              </div>
            ) : null}
          </section>
        )}

        <Link
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
          href="/conformance"
        >
          <ArrowLeft className="size-4" /> Start a fresh conformance session
        </Link>
      </div>
    </main>
  );
}
