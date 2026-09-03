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
  'Tell me whether this page offers any WebMCP actions. Explain in plain language what each action can access or change and which safety claims still need verification. Do not run anything until I approve one specific action.';

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
      label: 'Page offered',
      value: webMcp.registration === 'registered' ? '1 action' : 'Checking',
      positive: webMcp.registration === 'registered',
    },
    {
      label: 'AI can see it',
      value:
        webMcp.discovery === 'discovered'
          ? 'Observed'
          : webMcp.discovery === 'not-checked'
            ? 'Not checked'
            : webMcp.discovery,
      positive: webMcp.discovery === 'discovered',
    },
    {
      label: 'Action ran',
      value: webMcp.invocation === 'observed' ? 'Yes' : 'No',
      positive: webMcp.invocation === 'observed',
    },
    {
      label: 'Page receipt',
      value: secureReceipt?.verdict === 'PASS' ? 'PASS' : 'Not created',
      positive: secureReceipt?.verdict === 'PASS',
    },
  ];

  async function copyPrompt() {
    await navigator.clipboard.writeText(SAFE_INSPECTION_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return (
    <aside
      id="observe"
      aria-labelledby="webmcp-heads-up-title"
      className="scroll-mt-20 overflow-hidden rounded-xl border border-foreground bg-card shadow-[6px_6px_0_0_var(--foreground)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-foreground px-4 py-3 text-background">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
          <Eye className="size-3.5" aria-hidden="true" />
          Page-observed Site Tools status
        </div>
        <Badge className="bg-lime-300 text-slate-950">
          {webMcp.invocation === 'observed'
            ? 'Run observed'
            : 'Observed · not run'}
        </Badge>
      </div>

      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-900">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {webMcp.registration === 'registered'
                ? 'WebMCP action registered on this page'
                : 'Checking this page for WebMCP'}
            </p>
            <h2
              id="webmcp-heads-up-title"
              className="mt-1 text-lg font-semibold tracking-tight"
            >
              {webMcp.registration === 'registered'
                ? 'This page currently offers an action to your AI.'
                : 'No registered page action is confirmed yet.'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              “Registered” means the page made an action available. It does not
              mean you approved it, your AI discovered it, the browser showed a
              safety review, or anything ran. Only the native Site Tools path is
              part of this public lesson.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="rounded-md border border-border bg-background p-2.5"
            >
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

        <div className="mt-4 rounded-md border border-amber-300/50 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Bot className="size-3.5" />
            The action this page declares
          </div>
          <p className="mt-2 text-sm font-semibold">
            {scenario.presented.title}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            The page labels it{' '}
            {scenario.tool.annotations.readOnlyHint
              ? 'read-only'
              : 'able to change data'}
            . That is a claim—not proof. The lesson will compare the schema,
            code effect, and before/after state.
          </p>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          Current assessment: <strong>{assessment.level} risk</strong>. The
          lesson separates the website&apos;s claim from the authority a person
          approves and the effect the page verifies.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onInspect}>
            Start the guided review
            <ChevronRight data-icon="inline-end" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => void copyPrompt()}>
            {copied ? (
              <Check data-icon="inline-start" />
            ) : (
              <Clipboard data-icon="inline-start" />
            )}
            {copied ? 'Prompt copied' : 'Copy a safe prompt for my agent'}
          </Button>
          {secureReceipt?.verdict === 'PASS' ? (
            <Badge className="h-7 bg-emerald-100 px-2.5 text-emerald-900">
              Page verification passed
            </Badge>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
