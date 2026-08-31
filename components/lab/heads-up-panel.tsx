'use client';

import {
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  EvidenceReceipt,
  RiskAssessment,
  ScenarioDefinition,
  WebMcpStatus,
} from '@/lib/lab/types';

const SAFE_INSPECTION_PROMPT =
  'Inspect the WebMCP tool registered by this page. Explain its name, input schema, annotations, and likely side effects. Do not invoke it until I approve.';

export function HeadsUpPanel({
  scenario,
  assessment,
  webMcp,
  secureReceipt,
  onInspect,
}: {
  scenario: ScenarioDefinition;
  assessment: RiskAssessment;
  webMcp: WebMcpStatus;
  secureReceipt?: EvidenceReceipt;
  onInspect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const facts = [
    {
      label: 'Browser API',
      value: webMcp.browserSupport,
      positive: webMcp.browserSupport === 'supported',
    },
    {
      label: 'Page registration',
      value: webMcp.registration,
      positive: webMcp.registration === 'registered',
    },
    {
      label: 'Policy',
      value: webMcp.permissionsPolicy,
      positive: webMcp.permissionsPolicy === 'allowed',
    },
    {
      label: 'Client discovery',
      value: webMcp.discovery,
      positive: webMcp.discovery === 'discovered',
    },
    {
      label: 'Invocation',
      value: webMcp.invocation,
      positive: webMcp.invocation === 'observed',
    },
  ];

  async function copyPrompt() {
    await navigator.clipboard.writeText(SAFE_INSPECTION_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return (
    <aside
      aria-labelledby="webmcp-heads-up-title"
      className="overflow-hidden rounded-xl border border-foreground bg-card shadow-[6px_6px_0_0_var(--foreground)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-foreground px-4 py-3 text-background">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
          <Eye className="size-3.5" aria-hidden="true" />
          WebMCP heads-up
        </div>
        <Badge className="bg-lime-300 text-slate-950">No auto-run</Badge>
      </div>

      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-900">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {assessment.level} risk · policy: {assessment.policyAction}
            </p>
            <h2 id="webmcp-heads-up-title" className="mt-1 text-lg font-semibold tracking-tight">
              {assessment.headline}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {assessment.summary}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-md border border-border bg-background p-2.5">
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
                {fact.label}
              </p>
              <p
                className={`mt-1 truncate font-mono text-[9px] font-semibold uppercase ${
                  fact.positive ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {fact.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-border bg-muted/45 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Bot className="size-3.5" />
            What an agent can see
          </div>
          <p className="mt-2 break-all font-mono text-[10px] font-semibold">
            {scenario.tool.name}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Inputs: {assessment.schemaFields.join(', ') || 'none'} · readOnlyHint:{' '}
            {String(scenario.tool.annotations.readOnlyHint)}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onInspect}>
            Inspect before acting
            <ChevronRight data-icon="inline-end" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => void copyPrompt()}>
            {copied ? <Check data-icon="inline-start" /> : <Clipboard data-icon="inline-start" />}
            {copied ? 'Prompt copied' : 'Copy safe agent prompt'}
          </Button>
          {secureReceipt?.verdict === 'PASS' ? (
            <Badge className="h-7 bg-emerald-100 px-2.5 text-emerald-900">
              Secure retest passed
            </Badge>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
