import {
  compileCapabilityContract,
  createCapabilityEvidence,
  createLockedIntent,
  createProposalInput,
  createProposalRecord,
  executeScenarioOneCapability,
  sha256Hex,
} from '../../lib/lab/capability-negotiation';
import { createEvidenceReceipt } from '../../lib/lab/evidence';
import { scenarioById } from '../../lib/lab/scenarios';
import type { RunContext } from '../../lib/lab/types';

export async function validCapabilityReceipt() {
  const origin = 'http://localhost:3000';
  const scenario = scenarioById['read-only-claim'];
  const intent = createLockedIntent({
    origin,
    lockedAt: '2026-09-01T12:00:00.000Z',
    baselineStateHash: await sha256Hex(scenario.initialState),
    ttlSeconds: 120,
  });
  const proposal = await createProposalRecord({
    input: createProposalInput(intent),
    intent,
    sourceTool: scenario.tool,
    proposedAt: '2026-09-01T12:00:01.000Z',
    channel: 'webmcp',
  });
  const contract = await compileCapabilityContract({
    intent,
    proposal,
    preparedAt: '2026-09-01T12:00:02.000Z',
    approvalNonce: 'c152cf41-e3d7-4528-9e29-12110dd79278',
  });
  const checkedAt = '2026-09-01T12:01:00.000Z';
  const { outcome, verification } = await executeScenarioOneCapability({
    contract,
    currentState: structuredClone(scenario.initialState),
    checkedAt,
  });
  const capability = createCapabilityEvidence({
    proposal,
    contract,
    approvedAt: '2026-09-01T12:00:03.000Z',
    claimedAt: checkedAt,
    verification,
    invalidatedAt: checkedAt,
    invalidationReason: 'consumed',
  });
  const context: RunContext = {
    channel: 'negotiated-capability',
    now: checkedAt,
    origin,
    browser: { userAgent: 'test', language: 'en', platform: 'test' },
    clientLabel: 'Test client',
    webMcp: {
      api: 'document.modelContext',
      browserSupport: 'supported',
      registration: 'registered',
      permissionsPolicy: 'allowed',
      discovery: 'discovered',
      invocation: 'observed',
      detail:
        'Observed at callback fulfillment before physical registration retirement.',
      discoveredToolNames: [contract.compiled.toolName],
    },
    confirmation: {
      presentedCopy: contract.approval.copy,
      known: true,
      approved: true,
      source: 'capability-contract',
    },
  };
  return createEvidenceReceipt({
    scenario,
    declaration: contract.compiled.declaration,
    argumentsValue: {},
    context,
    outcome,
    sessionId: '4ecf0c2b-cc5c-4854-a11e-22fa93cc4a1d',
    capability,
    id: '6f8f5771-9cde-4f2d-b9f1-66d29ef5a930',
  });
}
