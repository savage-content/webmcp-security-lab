import type {
  CapabilityInvalidationReason,
  CapabilityNegotiationEvidence,
  CapabilityProposalInput,
  CapabilityProposalRecord,
  CapabilityVerification,
  CompiledCapabilityContract,
  JsonValue,
  LockedCapabilityIntent,
  RunOutcome,
  ToolDeclaration,
} from './types';

export const SOURCE_HANDLER_VERSION = 'scenario-one-source-handler/1.1.0';
export const CAPABILITY_HANDLER_VERSION = 'scenario-one-read-handler/1.0.0';
export const PROPOSAL_TOOL_NAME = 'propose_training_1042_read_capability';

const REQUIRED_PROPOSAL_KEYS = [
  'account_id',
  'allowed_origin',
  'baseline_state_hash',
  'expected_postcondition',
  'max_calls',
  'operation',
  'prohibited_effects',
  'ttl_seconds',
] as const;

const PROHIBITED_EFFECTS: LockedCapabilityIntent['prohibitedEffects'] = [
  'account-state-mutation',
  'capability-handler-network-fetch',
  'cross-account-access',
];

export type DocumentCapabilityLeaseState =
  | 'active'
  | 'consumed'
  | 'expired'
  | 'revoked';

export interface DocumentCapabilityLease {
  claim: () =>
    | { ok: true; callNumber: 1 }
    | { ok: false; reason: Exclude<DocumentCapabilityLeaseState, 'active'> };
  invalidate: (reason: 'expired' | 'revoked') => void;
  state: () => DocumentCapabilityLeaseState;
  deadline: number;
}

export function prepareDocumentCapabilityActivation({
  expiresAt,
  suppressSource,
  wallNow = () => Date.now(),
  monotonicNow,
}: {
  expiresAt: string;
  suppressSource: () => true;
  wallNow?: () => number;
  monotonicNow?: () => number;
}):
  | { ok: false; reason: 'expired' }
  | { ok: true; lease: DocumentCapabilityLease; sourceWithdrawn: true } {
  const remainingLifetimeMs = new Date(expiresAt).getTime() - wallNow();
  if (remainingLifetimeMs <= 0) return { ok: false, reason: 'expired' };

  // Construct a valid lease before changing source registration state. This
  // keeps an expiry race from withdrawing the source without a replacement.
  const lease = createDocumentCapabilityLease({
    ttlSeconds: remainingLifetimeMs / 1_000,
    ...(monotonicNow ? { now: monotonicNow } : {}),
  });
  return { ok: true, lease, sourceWithdrawn: suppressSource() };
}

export function createDocumentCapabilityLease({
  ttlSeconds,
  now = () => performance.now(),
}: {
  ttlSeconds: number;
  now?: () => number;
}): DocumentCapabilityLease {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('A positive capability lifetime is required.');
  }
  const deadline = now() + ttlSeconds * 1_000;
  let current: DocumentCapabilityLeaseState = 'active';

  return {
    deadline,
    claim() {
      if (current !== 'active') return { ok: false, reason: current };
      if (now() >= deadline) {
        current = 'expired';
        return { ok: false, reason: 'expired' };
      }
      // JavaScript run-to-completion makes this transition atomic within one
      // document realm because it occurs before the caller can await.
      current = 'consumed';
      return { ok: true, callNumber: 1 };
    },
    invalidate(reason) {
      if (current === 'active') current = reason;
    },
    state() {
      return current;
    },
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function asRecord(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The capability proposal must be a JSON object.');
  }
  return input as Record<string, unknown>;
}

function hasExactOrderedValues(value: unknown, expected: string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

export function createLockedIntent({
  origin,
  lockedAt,
  baselineStateHash,
  ttlSeconds = 120,
}: {
  origin: string;
  lockedAt: string;
  baselineStateHash: string;
  ttlSeconds?: number;
}): LockedCapabilityIntent {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300) {
    throw new Error(
      'Capability lifetime must be an integer from 30 to 300 seconds.',
    );
  }
  if (!/^[0-9a-f]{64}$/.test(baselineStateHash)) {
    throw new Error('A SHA-256 baseline state hash is required.');
  }

  return {
    accountId: 'TRAINING-1042',
    operation: 'read-eligibility',
    maxCalls: 1,
    ttlSeconds,
    allowedOrigin: origin,
    requiredResult: {
      accountId: 'TRAINING-1042',
      eligibility: 'eligible',
    },
    baseline: {
      stateHash: baselineStateHash,
      reviewed: false,
      reviewCount: 0,
      lastReviewedAt: null,
    },
    prohibitedEffects: [...PROHIBITED_EFFECTS],
    expectedPostcondition: 'account-state-byte-identical',
    lockedAt,
  };
}

export function createProposalInput(
  intent: LockedCapabilityIntent,
): CapabilityProposalInput {
  return {
    account_id: intent.accountId,
    operation: intent.operation,
    max_calls: intent.maxCalls,
    ttl_seconds: intent.ttlSeconds,
    allowed_origin: intent.allowedOrigin,
    prohibited_effects: [...intent.prohibitedEffects],
    expected_postcondition: intent.expectedPostcondition,
    baseline_state_hash: intent.baseline.stateHash,
  };
}

export function validateProposalInput(
  input: unknown,
  intent: LockedCapabilityIntent,
): CapabilityProposalInput {
  const value = asRecord(input);
  const keys = Object.keys(value).sort();
  if (
    canonicalJson(keys) !== canonicalJson([...REQUIRED_PROPOSAL_KEYS].sort())
  ) {
    throw new Error(
      'The proposal must contain exactly the locked intent fields.',
    );
  }

  const expected = createProposalInput(intent);
  if (
    value.account_id !== expected.account_id ||
    value.operation !== expected.operation ||
    value.max_calls !== expected.max_calls ||
    value.ttl_seconds !== expected.ttl_seconds ||
    value.allowed_origin !== expected.allowed_origin ||
    value.baseline_state_hash !== expected.baseline_state_hash ||
    value.expected_postcondition !== expected.expected_postcondition ||
    !hasExactOrderedValues(
      value.prohibited_effects,
      expected.prohibited_effects,
    )
  ) {
    throw new Error('The proposal widens or changes the human-locked intent.');
  }

  return structuredClone(expected);
}

export function createProposalToolDeclaration(
  intent: LockedCapabilityIntent,
): ToolDeclaration {
  return {
    name: PROPOSAL_TOOL_NAME,
    title: 'Propose one-use training eligibility read',
    description:
      'Stage an exact least-privilege proposal for human review. This cannot invoke the source tool or alter the synthetic account.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', const: intent.accountId },
        operation: { type: 'string', const: intent.operation },
        max_calls: { type: 'integer', const: intent.maxCalls },
        ttl_seconds: { type: 'integer', const: intent.ttlSeconds },
        allowed_origin: { type: 'string', const: intent.allowedOrigin },
        baseline_state_hash: {
          type: 'string',
          const: intent.baseline.stateHash,
        },
        prohibited_effects: {
          type: 'array',
          prefixItems: intent.prohibitedEffects.map((effect) => ({
            type: 'string',
            const: effect,
          })),
          minItems: intent.prohibitedEffects.length,
          maxItems: intent.prohibitedEffects.length,
        },
        expected_postcondition: {
          type: 'string',
          const: intent.expectedPostcondition,
        },
      },
      required: [...REQUIRED_PROPOSAL_KEYS],
      additionalProperties: false,
    },
    annotations: {
      // Staging a proposal updates the page's ephemeral review state, so it is
      // deliberately not labeled read-only even though it cannot touch account data.
      readOnlyHint: false,
      untrustedContentHint: false,
    },
  };
}

export async function fingerprintSource({
  tool,
  handlerVersion,
  origin,
}: {
  tool: ToolDeclaration;
  handlerVersion: string;
  origin: string;
}) {
  return sha256Hex({ tool, handlerVersion, origin });
}

export async function createProposalRecord({
  input,
  intent,
  sourceTool,
  proposedAt,
  channel,
}: {
  input: unknown;
  intent: LockedCapabilityIntent;
  sourceTool: ToolDeclaration;
  proposedAt: string;
  channel: CapabilityProposalRecord['channel'];
}): Promise<CapabilityProposalRecord> {
  const validated = validateProposalInput(input, intent);
  const source = {
    toolName: sourceTool.name,
    sourceDeclarationHash: await fingerprintSource({
      tool: sourceTool,
      handlerVersion: SOURCE_HANDLER_VERSION,
      origin: intent.allowedOrigin,
    }),
    handlerVersion: SOURCE_HANDLER_VERSION,
    origin: intent.allowedOrigin,
  };

  return {
    input: validated,
    proposalHash: await sha256Hex({ input: validated, source }),
    proposedAt,
    channel,
    source,
  };
}

export function capabilityApprovalCopy(
  proposal: CapabilityProposalRecord,
  expiresAt?: string,
  toolName?: string,
  capabilityId?: string,
) {
  const expiry = expiresAt
    ? `expires exactly at ${expiresAt}`
    : `expires after ${proposal.input.ttl_seconds} seconds`;
  const generatedIdentity =
    toolName && capabilityId
      ? ` The generated tool is ${toolName} with capability ID ${capabilityId}.`
      : '';
  return `Approve one read of eligibility for TRAINING-1042 at ${proposal.source.origin}; required result eligibility=eligible; required postcondition ${proposal.input.expected_postcondition}; no account mutation, capability-handler fetch, or cross-account access; ${expiry}. This withdraws ${proposal.source.toolName} and registers a new no-input one-use tool bound to source declaration ${proposal.source.sourceDeclarationHash} and baseline ${proposal.input.baseline_state_hash}.${generatedIdentity}`;
}

export async function compileCapabilityContract({
  intent,
  proposal,
  preparedAt,
  approvalNonce = crypto.randomUUID(),
}: {
  intent: LockedCapabilityIntent;
  proposal: CapabilityProposalRecord;
  preparedAt: string;
  approvalNonce?: string;
}): Promise<CompiledCapabilityContract> {
  validateProposalInput(proposal.input, intent);
  const compiledAt = preparedAt;
  const expiresAt = new Date(
    new Date(preparedAt).getTime() + intent.ttlSeconds * 1_000,
  ).toISOString();
  const identitySeed = await sha256Hex({
    protocol: 'webmcp-capability-negotiation/1',
    intent,
    proposalHash: proposal.proposalHash,
    source: proposal.source,
    approvalNonce,
    handlerVersion: CAPABILITY_HANDLER_VERSION,
    compiledAt,
    expiresAt,
  });
  const capabilityId = `cap_${identitySeed.slice(0, 24)}`;
  const toolName = `get_training_1042_eligibility_once_${identitySeed.slice(0, 16)}`;
  const declaration = createCompiledCapabilityDeclaration(toolName, expiresAt);
  const approval = {
    preparedAt,
    nonce: approvalNonce,
    copy: capabilityApprovalCopy(proposal, expiresAt, toolName, capabilityId),
  };
  const contractMaterial = {
    protocol: 'webmcp-capability-negotiation/1',
    capabilityId,
    intent,
    proposalHash: proposal.proposalHash,
    source: proposal.source,
    approval,
    compiled: {
      toolName,
      declaration,
      handlerVersion: CAPABILITY_HANDLER_VERSION,
      compiledAt,
      expiresAt,
    },
  };
  const contractHash = await sha256Hex(contractMaterial);

  return {
    protocol: 'webmcp-capability-negotiation/1',
    capabilityId,
    contractHash,
    intent,
    proposalHash: proposal.proposalHash,
    source: proposal.source,
    approval,
    compiled: {
      toolName,
      declaration,
      handlerVersion: CAPABILITY_HANDLER_VERSION,
      compiledAt,
      expiresAt,
    },
  };
}

function createCompiledCapabilityDeclaration(
  toolName: string,
  expiresAt: string,
): ToolDeclaration {
  return {
    name: toolName,
    title: 'Read TRAINING-1042 eligibility once',
    description:
      `One-use, human-approved read for synthetic account TRAINING-1042. ` +
      `Expires ${expiresAt}; no account mutation, capability-handler fetch, or cross-account access.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  };
}

export async function validateCapabilityEvidenceIntegrity(
  evidence: CapabilityNegotiationEvidence,
) {
  const { proposal, contract } = evidence;
  validateProposalInput(proposal.input, contract.intent);

  if (
    proposal.source.handlerVersion !== SOURCE_HANDLER_VERSION ||
    contract.compiled.handlerVersion !== CAPABILITY_HANDLER_VERSION ||
    canonicalJson(proposal.source) !== canonicalJson(contract.source)
  ) {
    throw new Error('Capability source or handler-version binding is invalid.');
  }

  const proposalHash = await sha256Hex({
    input: proposal.input,
    source: proposal.source,
  });
  if (
    proposalHash !== proposal.proposalHash ||
    proposal.proposalHash !== contract.proposalHash
  ) {
    throw new Error('Capability proposal hash is invalid.');
  }

  const expectedApprovalCopy = capabilityApprovalCopy(
    proposal,
    contract.compiled.expiresAt,
    contract.compiled.toolName,
    contract.capabilityId,
  );
  if (
    contract.approval.copy !== expectedApprovalCopy ||
    contract.approval.preparedAt !== contract.compiled.compiledAt
  ) {
    throw new Error('Capability approval material is invalid.');
  }

  const expectedExpiry = new Date(
    new Date(contract.approval.preparedAt).getTime() +
      contract.intent.ttlSeconds * 1_000,
  ).toISOString();
  if (expectedExpiry !== contract.compiled.expiresAt) {
    throw new Error('Capability expiry does not match its approved lifetime.');
  }

  const identitySeed = await sha256Hex({
    protocol: contract.protocol,
    intent: contract.intent,
    proposalHash: contract.proposalHash,
    source: contract.source,
    approvalNonce: contract.approval.nonce,
    handlerVersion: contract.compiled.handlerVersion,
    compiledAt: contract.compiled.compiledAt,
    expiresAt: contract.compiled.expiresAt,
  });
  const expectedCapabilityId = `cap_${identitySeed.slice(0, 24)}`;
  const expectedToolName = `get_training_1042_eligibility_once_${identitySeed.slice(0, 16)}`;
  const expectedDeclaration = createCompiledCapabilityDeclaration(
    expectedToolName,
    contract.compiled.expiresAt,
  );
  if (
    contract.capabilityId !== expectedCapabilityId ||
    contract.compiled.toolName !== expectedToolName ||
    canonicalJson(contract.compiled.declaration) !==
      canonicalJson(expectedDeclaration)
  ) {
    throw new Error(
      'Compiled capability contract hash or declaration is invalid.',
    );
  }

  const contractHash = await sha256Hex({
    protocol: contract.protocol,
    capabilityId: contract.capabilityId,
    intent: contract.intent,
    proposalHash: contract.proposalHash,
    source: contract.source,
    approval: contract.approval,
    compiled: contract.compiled,
  });
  if (contractHash !== contract.contractHash) {
    throw new Error('Compiled capability contract hash is invalid.');
  }

  if (evidence.approvalEvent.contractHash !== contract.contractHash) {
    throw new Error('Approval event does not identify the compiled contract.');
  }

  return evidence;
}

export async function verifyCapabilityBinding({
  contract,
  sourceTool,
  origin,
  now,
  callsClaimed,
  handlerVersion = CAPABILITY_HANDLER_VERSION,
}: {
  contract: CompiledCapabilityContract;
  sourceTool: ToolDeclaration;
  origin: string;
  now: string;
  callsClaimed: number;
  handlerVersion?: string;
}): Promise<
  | { ok: true; observedSourceHash: string }
  | {
      ok: false;
      reason: Exclude<CapabilityInvalidationReason, 'registration-failed'>;
      observedSourceHash: string;
    }
> {
  const observedSourceHash = await fingerprintSource({
    tool: sourceTool,
    handlerVersion: SOURCE_HANDLER_VERSION,
    origin,
  });

  if (callsClaimed >= contract.intent.maxCalls) {
    return { ok: false, reason: 'consumed', observedSourceHash };
  }
  if (
    new Date(now).getTime() >= new Date(contract.compiled.expiresAt).getTime()
  ) {
    return { ok: false, reason: 'expired', observedSourceHash };
  }
  if (origin !== contract.source.origin) {
    return { ok: false, reason: 'origin-drift', observedSourceHash };
  }
  if (handlerVersion !== contract.compiled.handlerVersion) {
    return { ok: false, reason: 'handler-drift', observedSourceHash };
  }
  if (observedSourceHash !== contract.source.sourceDeclarationHash) {
    return { ok: false, reason: 'source-drift', observedSourceHash };
  }

  return { ok: true, observedSourceHash };
}

export async function executeScenarioOneCapability({
  contract,
  currentState,
  checkedAt,
}: {
  contract: CompiledCapabilityContract;
  currentState: Record<string, JsonValue>;
  checkedAt: string;
}): Promise<{
  outcome: RunOutcome;
  verification: CapabilityVerification;
}> {
  const before = structuredClone(currentState);
  const after = structuredClone(currentState);
  const observedStateHash = await sha256Hex(before);
  const baselineStateMatched =
    observedStateHash === contract.intent.baseline.stateHash &&
    before.accountId === contract.intent.accountId &&
    before.reviewed === contract.intent.baseline.reviewed &&
    before.reviewCount === contract.intent.baseline.reviewCount &&
    before.lastReviewedAt === contract.intent.baseline.lastReviewedAt;
  const eligibility =
    typeof before.eligibility === 'string' ? before.eligibility : '';
  const rawResult = {
    account_id: contract.intent.accountId,
    eligibility,
    message: 'Eligibility lookup complete.',
  };
  const stateByteIdentical =
    canonicalJson(before) === canonicalJson(after) &&
    observedStateHash === (await sha256Hex(after));
  const requiredResultMatched =
    rawResult.account_id === contract.intent.requiredResult.accountId &&
    rawResult.eligibility === contract.intent.requiredResult.eligibility;
  const controlledHandlerViolations: string[] = [];
  if (!stateByteIdentical) {
    controlledHandlerViolations.push('account-state-mutation');
  }
  if (before.accountId !== contract.intent.accountId) {
    controlledHandlerViolations.push('cross-account-access');
  }
  const passed =
    baselineStateMatched &&
    stateByteIdentical &&
    requiredResultMatched &&
    controlledHandlerViolations.length === 0;
  const verification: CapabilityVerification = {
    passed,
    baselineStateMatched,
    observedStateHash,
    requiredResultMatched,
    stateByteIdentical,
    controlledHandlerViolations,
    checkedAt,
  };

  return {
    verification,
    outcome: {
      before,
      after,
      rawResult,
      sideEffects: [],
      verdict: passed ? 'PASS' : 'FAIL',
      debrief:
        'Scenario-specific verification compared the required eligibility result and confirmed that this controlled handler returned byte-identical synthetic account snapshots.',
      remediation:
        'The broad source tool was replaced for this approval window; the generated capability was consumed before its pure, versioned handler executed.',
    },
  };
}

export function createCapabilityEvidence({
  proposal,
  contract,
  approvedAt,
  claimedAt,
  verification,
  invalidatedAt,
  invalidationReason,
}: {
  proposal: CapabilityProposalRecord;
  contract: CompiledCapabilityContract;
  approvedAt: string;
  claimedAt: string;
  verification: CapabilityVerification;
  invalidatedAt: string;
  invalidationReason: CapabilityInvalidationReason;
}): CapabilityNegotiationEvidence {
  return {
    protocol: 'webmcp-capability-negotiation/1',
    scope: 'single-document-session',
    receiptPersistence: 'local-export-only',
    proposal,
    contract,
    approvalEvent: {
      approvedAt,
      contractHash: contract.contractHash,
    },
    invocation: { claimedAt, callNumber: 1 },
    verification,
    invalidation: { reason: invalidationReason, at: invalidatedAt },
  };
}
