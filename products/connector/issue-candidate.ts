import type { ScenarioId, Verdict } from '../../lib/lab/types';

import type { ConnectorReceiptEntry } from './receipt-store';
import {
  createPrivacySafeIssueDraft,
  type IssueDraftCategory,
  type IssueDraftSeverity,
  type IssueDraftStage,
  type PrivacySafeIssueDraft,
} from './issue-draft';

export type LocalIssueCandidateSource =
  | Readonly<{ kind: 'synthetic-lesson' }>
  | Readonly<{ entryId: string; kind: 'verified-receipt' }>;

export interface LocalIssueCandidate {
  draft: Readonly<PrivacySafeIssueDraft>;
  explanation: string;
  source: LocalIssueCandidateSource;
  sourceLabel: string;
  title: string;
}

interface ScenarioFinding {
  category: IssueDraftCategory;
  stage: IssueDraftStage;
  title: string;
}

const SCENARIO_FINDINGS: Record<ScenarioId, ScenarioFinding> = {
  'read-only-claim': {
    category: 'annotation-mismatch',
    stage: 'result',
    title: 'Read-only claim versus observed effect',
  },
  'over-broad-schema': {
    category: 'excess-authority',
    stage: 'approval',
    title: 'More input authority than the visible task needs',
  },
  'tool-result-injection': {
    category: 'untrusted-output',
    stage: 'result',
    title: 'Instruction-shaped content in a tool result',
  },
  'confirmation-mismatch': {
    category: 'misleading-approval',
    stage: 'approval',
    title: 'Confirmation did not name the real effect',
  },
  'client-discovery-variance': {
    category: 'support-overclaim',
    stage: 'discovery',
    title: 'One client observation was treated as universal support',
  },
};

function severityForVerdict(verdict: Verdict): IssueDraftSeverity {
  if (verdict === 'FAIL') return 'medium';
  if (verdict === 'INCONCLUSIVE') return 'low';
  return 'informational';
}

function explanationForVerdict(verdict: Verdict) {
  if (verdict === 'FAIL') {
    return 'The selected verified practice receipt recorded a mismatch. This bounded draft describes the concern without copying the receipt.';
  }
  if (verdict === 'INCONCLUSIVE') {
    return 'The selected verified practice receipt could not establish the expected safety result. The draft remains a local lead, not a finding.';
  }
  return 'The selected verified practice receipt passed. This is a teaching example of the reporting boundary, not a claim that the site is vulnerable.';
}

export function createSyntheticLessonIssueCandidate(): Readonly<LocalIssueCandidate> {
  return Object.freeze({
    source: Object.freeze({ kind: 'synthetic-lesson' }),
    sourceLabel: 'Fixed synthetic lesson signal',
    title: 'Practice annotation mismatch',
    explanation:
      'This fixed signal demonstrates the reporting path. It did not come from a real site and cannot be submitted or published.',
    draft: createPrivacySafeIssueDraft({
      context: 'synthetic-lab',
      category: 'annotation-mismatch',
      severity: 'informational',
      stage: 'discovery',
    }),
  });
}

/**
 * Converts an already verified connector receipt into fixed, bounded report
 * metadata. Receipt- and page-supplied strings never enter the candidate.
 */
export function createIssueCandidateFromVerifiedReceipt(
  entry: ConnectorReceiptEntry,
): Readonly<LocalIssueCandidate> {
  const finding = SCENARIO_FINDINGS[entry.receipt.scenario.id];
  return Object.freeze({
    source: Object.freeze({
      kind: 'verified-receipt',
      entryId: entry.entryId,
    }),
    sourceLabel: 'Selected verified local receipt',
    title: finding.title,
    explanation: explanationForVerdict(entry.receipt.verdict),
    draft: createPrivacySafeIssueDraft({
      context: 'synthetic-lab',
      category: finding.category,
      severity: severityForVerdict(entry.receipt.verdict),
      stage: finding.stage,
    }),
  });
}
