import { describe, expect, it, vi } from 'vitest';

import {
  CAPABILITY_HANDLER_VERSION,
  capabilityApprovalCopy,
  compileCapabilityContract,
  createDocumentCapabilityLease,
  createCapabilityEvidence,
  createLockedIntent,
  createProposalInput,
  createProposalRecord,
  createProposalToolDeclaration,
  executeScenarioOneCapability,
  prepareDocumentCapabilityActivation,
  SCENARIO_ONE_CAPABILITY_TTL_SECONDS,
  sha256Hex,
  validateCapabilityEvidenceIntegrity,
  verifyCapabilityBinding,
} from '../lib/lab/capability-negotiation';
import { createEvidenceReceipt } from '../lib/lab/evidence';
import { scenarioById } from '../lib/lab/scenarios';
import {
  evidenceReceiptSchema,
  parseCapabilityEvidenceReceipt,
} from '../lib/lab/schemas';
import { validateConnectorCapabilityReceipt } from '../products/connector/lesson-capability-policy';
import type { CapabilityProposalRecord, RunContext } from '../lib/lab/types';

const origin = 'https://lab.example';
const lockedAt = '2026-08-31T12:00:00.000Z';
const proposedAt = '2026-08-31T12:00:01.000Z';
const approvedAt = '2026-08-31T12:00:02.000Z';

async function setup(channel: CapabilityProposalRecord['channel'] = 'webmcp') {
  const scenario = scenarioById['read-only-claim'];
  const intent = createLockedIntent({
    origin,
    lockedAt,
    baselineStateHash: await sha256Hex(scenario.initialState),
    ttlSeconds: SCENARIO_ONE_CAPABILITY_TTL_SECONDS,
  });
  const proposal = await createProposalRecord({
    input: createProposalInput(intent),
    intent,
    sourceTool: scenario.tool,
    proposedAt,
    channel,
  });
  const contract = await compileCapabilityContract({
    intent,
    proposal,
    preparedAt: approvedAt,
    approvalNonce: 'c152cf41-e3d7-4528-9e29-12110dd79278',
  });
  return { scenario, intent, proposal, contract };
}

describe('Scenario 1 capability negotiation', () => {
  it('atomically grants one same-document claim and rejects the exact TTL boundary', () => {
    let monotonicNow = 1_000;
    const lease = createDocumentCapabilityLease({
      ttlSeconds: 30,
      now: () => monotonicNow,
    });

    const first = lease.claim();
    const second = lease.claim();
    expect(first).toEqual({ ok: true, callNumber: 1 });
    expect(second).toEqual({ ok: false, reason: 'consumed' });

    const expiringLease = createDocumentCapabilityLease({
      ttlSeconds: 30,
      now: () => monotonicNow,
    });
    monotonicNow = expiringLease.deadline;
    expect(expiringLease.claim()).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('does not withdraw the source when approval revalidation reaches expiry', () => {
    const suppressSource = vi.fn(() => true as const);
    const expired = prepareDocumentCapabilityActivation({
      expiresAt: '2026-08-31T12:00:00.001Z',
      suppressSource,
      wallNow: () => Date.parse('2026-08-31T12:00:00.001Z'),
    });
    expect(expired).toEqual({ ok: false, reason: 'expired' });
    expect(suppressSource).not.toHaveBeenCalled();

    const active = prepareDocumentCapabilityActivation({
      expiresAt: '2026-08-31T12:00:01.000Z',
      suppressSource,
      wallNow: () => Date.parse('2026-08-31T12:00:00.000Z'),
      monotonicNow: () => 100,
    });
    expect(active.ok).toBe(true);
    expect(suppressSource).toHaveBeenCalledOnce();
  });

  it('publishes an exact proposal schema and rejects unknown or widened fields', async () => {
    const { intent } = await setup();
    const declaration = createProposalToolDeclaration(intent);
    const schema = declaration.inputSchema;

    expect(schema.additionalProperties).toBe(false);
    expect(declaration.annotations.readOnlyHint).toBe(false);
    expect((schema.properties as Record<string, unknown>).account_id).toEqual({
      type: 'string',
      const: 'TRAINING-1042',
    });

    await expect(
      createProposalRecord({
        input: { ...createProposalInput(intent), target: 'other-account' },
        intent,
        sourceTool: scenarioById['read-only-claim'].tool,
        proposedAt,
        channel: 'webmcp',
      }),
    ).rejects.toThrow('exactly');

    await expect(
      createProposalRecord({
        input: { ...createProposalInput(intent), max_calls: 2 },
        intent,
        sourceTool: scenarioById['read-only-claim'].tool,
        proposedAt,
        channel: 'webmcp',
      }),
    ).rejects.toThrow('widens');
  });

  it('compiles a unique no-input, single-use, expiring contract', async () => {
    const { intent, proposal, contract } = await setup();

    expect(contract.proposalHash).toBe(proposal.proposalHash);
    expect(contract.compiled.toolName).toMatch(
      /^get_training_1042_eligibility_once_[0-9a-f]{16}$/,
    );
    expect(contract.compiled.declaration.inputSchema).toEqual({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    });
    expect(contract.compiled.declaration.annotations.readOnlyHint).toBe(true);
    expect(SCENARIO_ONE_CAPABILITY_TTL_SECONDS).toBe(300);
    expect(contract.compiled.expiresAt).toBe('2026-08-31T12:05:02.000Z');
    expect(capabilityApprovalCopy(proposal)).toContain(
      proposal.source.sourceDeclarationHash,
    );

    const second = await compileCapabilityContract({
      intent,
      proposal,
      preparedAt: approvedAt,
      approvalNonce: '4ba3f159-d934-4335-aa0d-5a9802307688',
    });
    expect(second.contractHash).not.toBe(contract.contractHash);
    expect(second.compiled.toolName).not.toBe(contract.compiled.toolName);
  });

  it('tracks proposal provenance without changing authority identity', async () => {
    const records = await Promise.all([
      setup('page-lesson'),
      setup('webmcp'),
      setup('fallback-harness'),
    ]);

    expect(records.map(({ proposal }) => proposal.channel)).toEqual([
      'page-lesson',
      'webmcp',
      'fallback-harness',
    ]);
    expect(
      new Set(records.map(({ proposal }) => proposal.proposalHash)).size,
    ).toBe(1);
    expect(
      new Set(records.map(({ contract }) => contract.contractHash)).size,
    ).toBe(1);
    expect(
      new Set(records.map(({ contract }) => contract.capabilityId)).size,
    ).toBe(1);
    expect(
      new Set(records.map(({ contract }) => contract.compiled.toolName)).size,
    ).toBe(1);
  });

  it('accepts only the bound origin, source, handler, lifetime, and first claim', async () => {
    const { scenario, contract } = await setup();
    const valid = await verifyCapabilityBinding({
      contract,
      sourceTool: scenario.tool,
      origin,
      now: '2026-08-31T12:01:00.000Z',
      callsClaimed: 0,
    });
    expect(valid.ok).toBe(true);

    const replay = await verifyCapabilityBinding({
      contract,
      sourceTool: scenario.tool,
      origin,
      now: '2026-08-31T12:01:00.000Z',
      callsClaimed: 1,
    });
    expect(replay).toMatchObject({ ok: false, reason: 'consumed' });

    const expired = await verifyCapabilityBinding({
      contract,
      sourceTool: scenario.tool,
      origin,
      now: contract.compiled.expiresAt,
      callsClaimed: 0,
    });
    expect(expired).toMatchObject({ ok: false, reason: 'expired' });

    const originDrift = await verifyCapabilityBinding({
      contract,
      sourceTool: scenario.tool,
      origin: 'https://other.example',
      now: '2026-08-31T12:01:00.000Z',
      callsClaimed: 0,
    });
    expect(originDrift).toMatchObject({ ok: false, reason: 'origin-drift' });

    const sourceDrift = await verifyCapabilityBinding({
      contract,
      sourceTool: { ...scenario.tool, description: 'Changed after approval.' },
      origin,
      now: '2026-08-31T12:01:00.000Z',
      callsClaimed: 0,
    });
    expect(sourceDrift).toMatchObject({ ok: false, reason: 'source-drift' });

    const handlerDrift = await verifyCapabilityBinding({
      contract,
      sourceTool: scenario.tool,
      origin,
      now: '2026-08-31T12:01:00.000Z',
      callsClaimed: 0,
      handlerVersion: `${CAPABILITY_HANDLER_VERSION}-changed`,
    });
    expect(handlerDrift).toMatchObject({ ok: false, reason: 'handler-drift' });
  });

  it('confirms the fixed result and unchanged controlled state in one linked receipt', async () => {
    const { scenario, proposal, contract } = await setup('page-lesson');
    const checkedAt = '2026-08-31T12:01:00.000Z';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { outcome, verification } = await executeScenarioOneCapability({
      contract,
      currentState: structuredClone(scenario.initialState),
      checkedAt,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    const capability = createCapabilityEvidence({
      proposal,
      contract,
      approvedAt: '2026-08-31T12:00:03.000Z',
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
    const receipt = createEvidenceReceipt({
      scenario,
      declaration: contract.compiled.declaration,
      argumentsValue: {},
      context,
      outcome,
      sessionId: '4ecf0c2b-cc5c-4854-a11e-22fa93cc4a1d',
      capability,
      id: '6f8f5771-9cde-4f2d-b9f1-66d29ef5a930',
    });

    expect(outcome.before).toEqual(outcome.after);
    expect(outcome.sideEffects).toEqual([]);
    expect(outcome.verdict).toBe('PASS');
    expect(receipt.capability?.proposal.channel).toBe('page-lesson');
    expect(receipt.invocation.channel).toBe('negotiated-capability');
    expect(receipt.capability?.invalidation.reason).toBe('consumed');
    await expect(
      validateCapabilityEvidenceIntegrity(capability),
    ).resolves.toEqual(capability);
    await expect(parseCapabilityEvidenceReceipt(receipt)).resolves.toEqual(
      receipt,
    );
    expect(evidenceReceiptSchema.parse(receipt)).toEqual(receipt);

    for (const channel of [
      'page-lesson',
      'webmcp',
      'fallback-harness',
    ] as const) {
      const channelReceipt = structuredClone(receipt);
      if (!channelReceipt.capability) throw new Error('Missing capability.');
      channelReceipt.capability.proposal.channel = channel;
      await expect(
        validateConnectorCapabilityReceipt(channelReceipt),
      ).resolves.toMatchObject({
        capability: { proposal: { channel } },
        invocation: { channel: 'negotiated-capability' },
      });
    }

    const unknownChannel = structuredClone(receipt) as unknown as {
      capability: { proposal: { channel: string } };
    };
    unknownChannel.capability.proposal.channel = 'native-ish';
    await expect(
      validateConnectorCapabilityReceipt(unknownChannel),
    ).rejects.toThrow();

    const stripped = structuredClone(receipt) as unknown as Record<
      string,
      unknown
    >;
    delete stripped.capability;
    expect(evidenceReceiptSchema.safeParse(stripped).success).toBe(false);

    const tamperedContract = structuredClone(capability);
    tamperedContract.contract.compiled.declaration.annotations.readOnlyHint = false;
    await expect(
      validateCapabilityEvidenceIntegrity(tamperedContract),
    ).rejects.toThrow('contract hash or declaration');

    const brokenProposalLink = structuredClone(receipt);
    if (!brokenProposalLink.capability) throw new Error('Missing capability.');
    brokenProposalLink.capability.contract.proposalHash = '0'.repeat(64);
    expect(evidenceReceiptSchema.safeParse(brokenProposalLink).success).toBe(
      false,
    );

    const brokenVerification = structuredClone(receipt);
    if (!brokenVerification.capability) throw new Error('Missing capability.');
    if (
      brokenVerification.capability.protocol !==
      'webmcp-capability-negotiation/1'
    ) {
      throw new Error('Expected Scenario 1 capability evidence.');
    }
    brokenVerification.capability.verification.baselineStateMatched = false;
    expect(evidenceReceiptSchema.safeParse(brokenVerification).success).toBe(
      false,
    );

    const brokenObservedHash = structuredClone(receipt);
    if (!brokenObservedHash.capability) throw new Error('Missing capability.');
    if (
      brokenObservedHash.capability.protocol !==
      'webmcp-capability-negotiation/1'
    ) {
      throw new Error('Expected Scenario 1 capability evidence.');
    }
    brokenObservedHash.capability.verification.observedStateHash = 'f'.repeat(
      64,
    );
    expect(evidenceReceiptSchema.safeParse(brokenObservedHash).success).toBe(
      false,
    );
    await expect(
      parseCapabilityEvidenceReceipt(brokenObservedHash),
    ).rejects.toThrow();

    const brokenDeclaration = structuredClone(receipt);
    brokenDeclaration.declaration.annotations.readOnlyHint = false;
    expect(evidenceReceiptSchema.safeParse(brokenDeclaration).success).toBe(
      false,
    );

    const brokenChronology = structuredClone(receipt);
    if (!brokenChronology.capability) throw new Error('Missing capability.');
    brokenChronology.capability.invocation.claimedAt = lockedAt;
    expect(evidenceReceiptSchema.safeParse(brokenChronology).success).toBe(
      false,
    );
  });

  it('fails closed when the approved baseline was already mutated', async () => {
    const { scenario, contract } = await setup();
    const mutated = {
      ...structuredClone(scenario.initialState),
      reviewed: true,
      reviewCount: 1,
      lastReviewedAt: '2026-08-31T12:00:01.000Z',
    };
    const { outcome, verification } = await executeScenarioOneCapability({
      contract,
      currentState: mutated,
      checkedAt: '2026-08-31T12:01:00.000Z',
    });

    expect(verification.baselineStateMatched).toBe(false);
    expect(outcome.verdict).toBe('FAIL');
  });
});
