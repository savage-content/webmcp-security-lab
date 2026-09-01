export function linkCapabilityReceipt<
  Proposal,
  Contract extends { protocol: string; contractHash: string },
  Verification,
  InvalidationReason extends string,
>({
  scope,
  receiptPersistence,
  proposal,
  contract,
  approvedAt,
  claimedAt,
  verification,
  invalidatedAt,
  invalidationReason,
}: {
  scope: string;
  receiptPersistence: string;
  proposal: Proposal;
  contract: Contract;
  approvedAt: string;
  claimedAt: string;
  verification: Verification;
  invalidatedAt: string;
  invalidationReason: InvalidationReason;
}) {
  return {
    protocol: contract.protocol,
    scope,
    receiptPersistence,
    proposal,
    contract,
    approvalEvent: {
      approvedAt,
      contractHash: contract.contractHash,
    },
    invocation: { claimedAt, callNumber: 1 as const },
    verification,
    invalidation: { reason: invalidationReason, at: invalidatedAt },
  };
}

export function verifyReceiptLink({
  contractHash,
  approvalContractHash,
  preparedAt,
  approvedAt,
  claimedAt,
  invalidatedAt,
}: {
  contractHash: string;
  approvalContractHash: string;
  preparedAt: string;
  approvedAt: string;
  claimedAt: string;
  invalidatedAt: string;
}): { ok: true } | { ok: false; reason: 'hash-mismatch' | 'chronology' } {
  if (contractHash !== approvalContractHash) {
    return { ok: false, reason: 'hash-mismatch' };
  }
  const times = [preparedAt, approvedAt, claimedAt, invalidatedAt].map(
    Date.parse,
  );
  if (
    times.some((time) => !Number.isFinite(time)) ||
    times.some((time, index) => index > 0 && time < times[index - 1]!)
  ) {
    return { ok: false, reason: 'chronology' };
  }
  return { ok: true };
}
