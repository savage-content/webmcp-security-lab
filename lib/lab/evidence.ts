import type {
  EvidenceReceipt,
  RunContext,
  RunOutcome,
  ScenarioDefinition,
  ToolDeclaration,
} from './types';
import { SELF_REPORTED_LIMITATION } from './constants';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  throw new Error(
    'A secure random UUID generator is required for evidence receipts.',
  );
}

export function createEvidenceReceipt({
  scenario,
  declaration,
  argumentsValue,
  context,
  outcome,
  sessionId,
  capability,
  id = createId(),
}: {
  scenario: ScenarioDefinition;
  declaration: ToolDeclaration;
  argumentsValue: Record<
    string,
    EvidenceReceipt['invocation']['arguments'][string]
  >;
  context: RunContext;
  outcome: RunOutcome;
  sessionId: string;
  capability?: EvidenceReceipt['capability'];
  id?: string;
}): EvidenceReceipt {
  return {
    id,
    schemaVersion: '1.0',
    sessionId,
    scenario: {
      id: scenario.id,
      version: scenario.version,
      title: scenario.shortTitle,
    },
    timestamp: context.now,
    origin: context.origin,
    browser: context.browser,
    client: {
      label: context.clientLabel,
      webMcp: context.webMcp,
    },
    declaration: structuredClone(declaration),
    invocation: {
      channel: context.channel,
      arguments: structuredClone(argumentsValue),
      confirmation: context.confirmation,
    },
    effective: {
      before: outcome.before,
      after: outcome.after,
      rawResult: outcome.rawResult,
      sideEffects: outcome.sideEffects,
    },
    verdict: outcome.verdict,
    debrief: outcome.debrief,
    remediation: outcome.remediation,
    limitation: SELF_REPORTED_LIMITATION,
    ...(capability ? { capability: structuredClone(capability) } : {}),
  };
}
