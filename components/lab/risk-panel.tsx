import { AlertTriangle, Braces, Eye, ShieldQuestion } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { RiskAssessment, ScenarioDefinition } from '@/lib/lab/types';

export function PreflightComparison({
  scenario,
  assessment,
  compact = false,
}: {
  scenario: ScenarioDefinition;
  assessment: RiskAssessment;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-3">
      <PreflightCell
        icon={<Eye />}
        label="Presented"
        title={scenario.presented.apparentPromise}
        detail={scenario.presented.confirmationCopy}
        compact={compact}
      />
      <PreflightCell
        icon={<Braces />}
        label="Declared"
        title={scenario.tool.name}
        detail={`Inputs: ${assessment.schemaFields.join(', ') || 'none'} · readOnlyHint: ${String(scenario.tool.annotations.readOnlyHint)}`}
        compact={compact}
      />
      <PreflightCell
        icon={<ShieldQuestion />}
        label="Predicted risk"
        title={assessment.headline}
        detail={assessment.findings
          .map((finding) => `${finding.ruleId}: ${finding.why}`)
          .join(' ')}
        compact={compact}
        warning={assessment.level !== 'informational'}
      />
    </div>
  );
}

export function RiskRules({ assessment }: { assessment: RiskAssessment }) {
  return (
    <div className="space-y-2">
      {assessment.findings.map((finding) => (
        <div
          key={finding.ruleId}
          className="flex items-start gap-3 rounded-md border border-amber-700/25 bg-amber-50 p-3 text-amber-950"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-200 text-amber-950">{finding.ruleId}</Badge>
              <p className="text-xs font-semibold">{finding.title}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-amber-950/75">
              {finding.why}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreflightCell({
  icon,
  label,
  title,
  detail,
  compact,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  detail: string;
  compact: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`${warning ? 'bg-amber-50' : 'bg-card'} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <p className="mt-3 break-words text-xs font-semibold leading-5">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}
