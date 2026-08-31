'use client';

import {
  Bell,
  Box,
  CheckCircle2,
  CircleUserRound,
  Info,
  ScanSearch,
  ShieldQuestion,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type {
  JsonValue,
  ScenarioDefinition,
  WebMcpStatus,
} from '@/lib/lab/types';

function display(value: JsonValue | undefined) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}

export function PresentedFixture({
  scenario,
  state,
  noticeDraft,
  onNoticeDraftChange,
  webMcp,
}: {
  scenario: ScenarioDefinition;
  state: Record<string, JsonValue>;
  noticeDraft: string;
  onNoticeDraftChange: (value: string) => void;
  webMcp: WebMcpStatus;
}) {
  switch (scenario.id) {
    case 'read-only-claim':
      return (
        <FixtureFrame icon={<CircleUserRound />} label="Training account">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{display(state.owner)}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {display(state.accountId)}
              </p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-900" variant="secondary">
              {display(state.eligibility)}
            </Badge>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <StateCell label="Reviewed" value={state.reviewed ? 'Yes' : 'No'} />
            <StateCell label="Review count" value={display(state.reviewCount)} />
          </div>
        </FixtureFrame>
      );

    case 'over-broad-schema':
      return (
        <FixtureFrame icon={<CircleUserRound />} label="Profile banner">
          <label className="text-xs font-semibold" htmlFor="notice-draft">
            Short notice
          </label>
          <Input
            id="notice-draft"
            className="mt-2 h-10 bg-background"
            maxLength={80}
            value={noticeDraft}
            onChange={(event) => onNoticeDraftChange(event.target.value)}
          />
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Visible field: notice</span>
            <span className="font-mono">{noticeDraft.length}/80</span>
          </div>
          <div className="mt-5 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            No target or instruction controls are presented to the human.
          </div>
        </FixtureFrame>
      );

    case 'tool-result-injection':
      return (
        <FixtureFrame icon={<Box />} label="Parcel Pilot · training">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-semibold">
                {display(state.trackingId)}
              </p>
              <p className="mt-1 text-sm font-semibold">{display(state.status)}</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
          <div className="mt-5 rounded-md border border-border bg-background p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Estimated arrival
            </p>
            <p className="mt-1 text-sm font-semibold">{display(state.eta)}</p>
          </div>
        </FixtureFrame>
      );

    case 'confirmation-mismatch':
      return (
        <FixtureFrame icon={<Bell />} label="Notification subscription">
          <div className="flex items-center justify-between gap-5 rounded-lg border border-border bg-background p-4">
            <div>
              <p className="text-sm font-semibold">{display(state.channel)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {display(state.frequency)} training digest
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {state.subscribed ? 'On' : 'Off'}
              </span>
              <Switch checked={Boolean(state.subscribed)} disabled />
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            The visible action below says it will preview a change, not apply it.
          </p>
        </FixtureFrame>
      );

    case 'client-discovery-variance':
      return (
        <FixtureFrame icon={<ScanSearch />} label="Compatibility claim">
          <div className="mb-4 flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-950">
            <CheckCircle2 className="size-4" />
            Available to every connected agent
          </div>
          <div className="space-y-2">
            <CapabilityRow
              label="Browser API support"
              value={webMcp.browserSupport}
              good={webMcp.browserSupport === 'supported'}
            />
            <CapabilityRow
              label="Registered on page"
              value={webMcp.registration}
              good={webMcp.registration === 'registered'}
            />
            <CapabilityRow
              label="Allowed by policy"
              value={webMcp.permissionsPolicy}
              good={webMcp.permissionsPolicy === 'allowed'}
            />
            <CapabilityRow
              label="Discovered here"
              value={webMcp.discovery}
              good={webMcp.discovery === 'discovered'}
            />
            <CapabilityRow
              label="Invocation observed"
              value={webMcp.invocation}
              good={webMcp.invocation === 'observed'}
            />
          </div>
          <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
            <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
            These are separate observations; none proves universal client support.
          </p>
        </FixtureFrame>
      );
  }
}

function FixtureFrame({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-5 flex items-center gap-2 border-b border-border pb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function StateCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CapabilityRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <span className="text-xs font-medium">{label}</span>
      <span
        className={`font-mono text-[10px] font-semibold uppercase ${good ? 'text-emerald-700' : 'text-amber-800'}`}
      >
        {value}
      </span>
    </div>
  );
}
