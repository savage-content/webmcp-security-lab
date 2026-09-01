import { describe, expect, it, vi } from 'vitest';

import {
  CAPABILITY_CORE_CONFORMANCE_VECTOR_V1,
  canonicalJson,
  checkCapabilityBindings,
  consumeOneUseBeforeAwait,
  createCanonicalBindingHashes,
  createOneUseLease,
  issueOneUseGrant,
  linkCapabilityReceipt,
  verifyCapabilityExecution,
  verifyReceiptLink,
} from '../lib/capability-core';

const vector = CAPABILITY_CORE_CONFORMANCE_VECTOR_V1;

describe('platform-neutral capability core', () => {
  it('reproduces canonical binding hash vectors independent of key order', async () => {
    const hashes = await createCanonicalBindingHashes({
      tool: vector.tool,
      handlerVersion: vector.handlerVersion,
      origin: vector.origin,
      baseline: vector.baseline,
    });

    expect(hashes).toEqual({
      sourceHash: vector.expected.sourceHash,
      schemaHash: vector.expected.schemaHash,
      baselineHash: vector.expected.baselineHash,
    });
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
    expect(canonicalJson({ ä: 1, z: 2 })).toBe('{"z":2,"ä":1}');
  });

  it('rejects values that JSON would silently erase or coerce', () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const hidden = Object.defineProperty({}, 'authority', {
      value: 'hidden',
      enumerable: false,
    });

    for (const invalid of [
      { omitted: undefined },
      { coerced: Number.NaN },
      { coerced: Number.POSITIVE_INFINITY },
      { executable: () => true },
      sparse,
      hidden,
      new Date('2026-08-31T12:00:00.000Z'),
    ]) {
      expect(() => canonicalJson(invalid)).toThrow(
        'The value must contain only finite, data-only JSON values.',
      );
    }
  });

  it('injects clock, nonce, and identity deterministically during grant issuance', async () => {
    const nonce = vi.fn(() => vector.nonce);
    const identity = vi.fn(() => ({
      capabilityId: 'cap_test_vector',
      toolName: 'read_once_test_vector',
    }));
    const source = {
      toolName: vector.tool.name,
      sourceDeclarationHash: vector.expected.sourceHash,
      schemaHash: vector.expected.schemaHash,
      handlerVersion: vector.handlerVersion,
      origin: vector.origin,
    };
    const issue = () =>
      issueOneUseGrant({
        protocol: vector.protocol,
        intent: { operation: 'read', maxCalls: 1 },
        proposalHash: 'a'.repeat(64),
        source,
        handlerVersion: vector.handlerVersion,
        ttlSeconds: 120,
        createDeclaration: (name, expiresAt) => ({
          name,
          expiresAt,
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        }),
        createApprovalCopy: ({ capabilityId, toolName, expiresAt }) =>
          `Approve ${capabilityId} as ${toolName} until ${expiresAt}.`,
        dependencies: {
          wallNow: () => Date.parse(vector.preparedAt),
          nonce,
          identity,
        },
      });

    const first = await issue();
    const second = await issue();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      capabilityId: 'cap_test_vector',
      proposalHash: 'a'.repeat(64),
      approval: { nonce: vector.nonce, preparedAt: vector.preparedAt },
      compiled: {
        toolName: 'read_once_test_vector',
        compiledAt: vector.preparedAt,
        expiresAt: vector.expiresAt,
      },
    });
    expect(first.contractHash).toBe(vector.expected.grantContractHash);
    expect(nonce).toHaveBeenCalledTimes(2);
    expect(identity).toHaveBeenCalledTimes(2);
  });

  it('consumes synchronously before awaited work and rejects replay', async () => {
    let now = 1_000;
    const lease = createOneUseLease({ ttlSeconds: 30, now: () => now });
    const order: string[] = [];

    const claim = consumeOneUseBeforeAwait(lease, () => {
      order.push('consumed');
    });
    const work = (async () => {
      order.push('handler-start');
      await Promise.resolve();
      order.push('handler-after-await');
    })();

    expect(claim).toEqual({ ok: true, callNumber: 1 });
    expect(order).toEqual(['consumed', 'handler-start']);
    expect(lease.claim()).toEqual({ ok: false, reason: 'consumed' });
    await work;
    expect(order).toEqual(['consumed', 'handler-start', 'handler-after-await']);

    const expiring = createOneUseLease({ ttlSeconds: 30, now: () => now });
    now = expiring.deadline;
    expect(expiring.claim()).toEqual({ ok: false, reason: 'expired' });
  });

  it.each([
    ['consumed', { callsClaimed: 1 }],
    ['expired', { now: vector.expiresAt }],
    ['origin-drift', { origin: 'https://other.example' }],
    ['handler-drift', { handlerVersion: 'changed/1' }],
    ['schema-drift', { schemaHash: '1'.repeat(64) }],
    ['source-drift', { sourceHash: '2'.repeat(64) }],
    ['baseline-drift', { baselineHash: '3'.repeat(64) }],
  ] as const)('fails closed on %s', (reason, change) => {
    const expected = {
      maxCalls: 1,
      expiresAt: vector.expiresAt,
      origin: vector.origin,
      handlerVersion: vector.handlerVersion,
      sourceHash: vector.expected.sourceHash,
      schemaHash: vector.expected.schemaHash,
      baselineHash: vector.expected.baselineHash,
    };
    const observed = {
      callsClaimed: 0,
      now: '2026-08-31T12:01:00.000Z',
      origin: vector.origin,
      handlerVersion: vector.handlerVersion,
      sourceHash: vector.expected.sourceHash,
      schemaHash: vector.expected.schemaHash,
      baselineHash: vector.expected.baselineHash,
      ...change,
    };
    expect(checkCapabilityBindings(expected, observed)).toEqual({
      ok: false,
      reason,
    });
  });

  it('verifies baseline, result, immutable state, and controlled violations', async () => {
    const before = structuredClone(vector.baseline);
    const pass = await verifyCapabilityExecution({
      before,
      after: structuredClone(before),
      expectedBaselineHash: vector.expected.baselineHash,
      result: { accountId: 'TRAINING-1042', eligibility: 'eligible' },
      requiredResult: {
        accountId: 'TRAINING-1042',
        eligibility: 'eligible',
      },
      checkedAt: '2026-08-31T12:01:00.000Z',
    });
    expect(pass).toMatchObject({
      passed: true,
      baselineMatched: true,
      stateUnchanged: true,
      requiredResultMatched: true,
      violations: [],
    });

    const fail = await verifyCapabilityExecution({
      before,
      after: { ...before, reviewed: true },
      expectedBaselineHash: vector.expected.baselineHash,
      result: { eligibility: 'ineligible' },
      requiredResult: { eligibility: 'eligible' },
      checkedAt: '2026-08-31T12:01:00.000Z',
      mutationViolation: 'account-state-mutation',
    });
    expect(fail).toMatchObject({
      passed: false,
      stateUnchanged: false,
      requiredResultMatched: false,
      violations: ['account-state-mutation'],
    });
  });

  it('links the approval, invocation, verification, and invalidation receipt', () => {
    const contract = {
      protocol: vector.protocol,
      contractHash: 'b'.repeat(64),
    };
    const receipt = linkCapabilityReceipt({
      scope: 'single-session',
      receiptPersistence: 'durable',
      proposal: { id: 'proposal-1' },
      contract,
      approvedAt: '2026-08-31T12:00:03.000Z',
      claimedAt: '2026-08-31T12:01:00.000Z',
      verification: { passed: true },
      invalidatedAt: '2026-08-31T12:01:00.000Z',
      invalidationReason: 'consumed',
    });
    expect(receipt.approvalEvent.contractHash).toBe(contract.contractHash);
    expect(receipt.invocation.callNumber).toBe(1);
    expect(
      verifyReceiptLink({
        contractHash: contract.contractHash,
        approvalContractHash: receipt.approvalEvent.contractHash,
        preparedAt: vector.preparedAt,
        approvedAt: receipt.approvalEvent.approvedAt,
        claimedAt: receipt.invocation.claimedAt,
        invalidatedAt: receipt.invalidation.at,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyReceiptLink({
        contractHash: contract.contractHash,
        approvalContractHash: 'c'.repeat(64),
        preparedAt: vector.preparedAt,
        approvedAt: receipt.approvalEvent.approvedAt,
        claimedAt: receipt.invocation.claimedAt,
        invalidatedAt: receipt.invalidation.at,
      }),
    ).toEqual({ ok: false, reason: 'hash-mismatch' });
  });
});
