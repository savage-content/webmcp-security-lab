import { canonicalJson, sha256Hex } from '../../lib/capability-core';
import { LEGACY_SELF_REPORTED_ASSURANCE_LIMITATION } from '../../lib/legacy-contracts';
import { SELF_REPORTED_LIMITATION } from '../../lib/lab/constants';
import { parseCapabilityEvidenceReceipt } from '../../lib/lab/schemas';
import { scenarioById } from '../../lib/lab/scenarios';
import type {
  EvidenceReceipt,
  ScenarioId,
  ToolDeclaration,
} from '../../lib/lab/types';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CAPABILITY_ID_PATTERN = /^cap_[0-9a-f]{24}$/u;
const GENERATED_SUFFIX_PATTERN = '[0-9a-f]{16}';

type GuidedScenarioId = Exclude<ScenarioId, 'read-only-claim'>;

export interface GuidedLessonPolicy {
  scenarioId: GuidedScenarioId;
  scenarioVersion: '1.1.0';
  profileId:
    | 'lesson-2-profile-notice/1'
    | 'lesson-3-delivery-status/1'
    | 'lesson-4-digest-off/1'
    | 'lesson-5-client-observation/1';
  toolPrefix: string;
  operation:
    | 'replace-profile-notice'
    | 'read-delivery-status'
    | 'disable-training-notification-subscription'
    | 'record-session-capability-observation';
  sourceHandlerVersion: string;
  capabilityHandlerVersion: string;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  allowedEffects: readonly string[];
  prohibitedEffects: readonly string[];
}

export const GUIDED_LESSON_POLICIES = {
  'lesson-2-profile-notice/1': {
    scenarioId: 'over-broad-schema',
    scenarioVersion: '1.1.0',
    profileId: 'lesson-2-profile-notice/1',
    toolPrefix: 'update_profile_notice_once_',
    operation: 'replace-profile-notice',
    sourceHandlerVersion: 'scenario-two-source-handler/1.1.0',
    capabilityHandlerVersion: 'scenario-two-profile-notice-handler/1.1.0',
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    allowedEffects: ['profile-notice-replaced'],
    prohibitedEffects: [
      'profile-target-change',
      'automation-instruction',
      'agent-approval-change',
      'unrelated-state-change',
      'capability-handler-network-fetch',
      'follow-on-tool-invocation',
    ],
  },
  'lesson-3-delivery-status/1': {
    scenarioId: 'tool-result-injection',
    scenarioVersion: '1.1.0',
    profileId: 'lesson-3-delivery-status/1',
    toolPrefix: 'get_synthetic_delivery_status_safe_once_',
    operation: 'read-delivery-status',
    sourceHandlerVersion: 'scenario-three-source-handler/1.1.0',
    capabilityHandlerVersion: 'scenario-three-delivery-status-handler/1.1.0',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    allowedEffects: [],
    prohibitedEffects: [
      'state-mutation',
      'capability-handler-network-fetch',
      'follow-on-tool-invocation',
      'result-directed-action',
      'data-transmission',
    ],
  },
  'lesson-4-digest-off/1': {
    scenarioId: 'confirmation-mismatch',
    scenarioVersion: '1.1.0',
    profileId: 'lesson-4-digest-off/1',
    toolPrefix: 'set_training_notification_subscription_once_',
    operation: 'disable-training-notification-subscription',
    sourceHandlerVersion: 'scenario-four-source-handler/1.1.0',
    capabilityHandlerVersion: 'scenario-four-digest-handler/1.1.0',
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    allowedEffects: ['notification-subscription-disabled'],
    prohibitedEffects: [
      'other-notification-setting-change',
      'unrelated-state-change',
      'capability-handler-network-fetch',
      'follow-on-tool-invocation',
    ],
  },
  'lesson-5-client-observation/1': {
    scenarioId: 'client-discovery-variance',
    scenarioVersion: '1.1.0',
    profileId: 'lesson-5-client-observation/1',
    toolPrefix: 'record_webmcp_capability_observation_once_',
    operation: 'record-session-capability-observation',
    sourceHandlerVersion: 'scenario-five-source-handler/1.1.0',
    capabilityHandlerVersion: 'scenario-five-observation-handler/1.1.0',
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    allowedEffects: ['session-capability-observation-recorded'],
    prohibitedEffects: [
      'universal-support-claim',
      'other-client-inference',
      'external-publication',
      'unrelated-state-change',
      'capability-handler-network-fetch',
      'follow-on-tool-invocation',
    ],
  },
} as const satisfies Record<string, GuidedLessonPolicy>;

const guidedPolicies = Object.values(GUIDED_LESSON_POLICIES);

export const APPROVED_CAPABILITY_TOOL_PATTERN = new RegExp(
  `^(?:get_training_1042_eligibility_once_|${guidedPolicies
    .map((policy) => policy.toolPrefix)
    .join('|')})${GENERATED_SUFFIX_PATTERN}$`,
  'u',
);

export function guidedPolicyForToolName(toolName: string) {
  return guidedPolicies.find((policy) =>
    new RegExp(`^${policy.toolPrefix}${GENERATED_SUFFIX_PATTERN}$`, 'u').test(
      toolName,
    ),
  );
}

export function isApprovedCapabilityToolName(toolName: string) {
  return APPROVED_CAPABILITY_TOOL_PATTERN.test(toolName);
}

function asRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  description: string,
) {
  if (
    canonicalJson(Object.keys(value).sort()) !==
    canonicalJson([...expected].sort())
  ) {
    throw new Error(`${description} contains unexpected or missing fields.`);
  }
}

function exactValue(observed: unknown, expected: unknown, description: string) {
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw new Error(
      `${description} does not match the built-in lesson policy.`,
    );
  }
}

function stringValue(value: unknown, description: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function timestamp(value: unknown, description: string) {
  const text = stringValue(value, description);
  const milliseconds = Date.parse(text);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== text
  ) {
    throw new Error(`${description} must be a normalized ISO timestamp.`);
  }
  return { text, milliseconds };
}

function sha256(value: unknown, description: string) {
  const text = stringValue(value, description);
  if (!SHA256_PATTERN.test(text)) {
    throw new Error(`${description} must be a lowercase SHA-256 digest.`);
  }
  return text;
}

function bool(value: unknown, description: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`${description} must be boolean.`);
  }
  return value;
}

function stringArray(value: unknown, description: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${description} must be a string array.`);
  }
  return value as string[];
}

function changedKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => canonicalJson(before[key]) !== canonicalJson(after[key]))
    .sort();
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort())
  );
}

function validateBoundArguments(policy: GuidedLessonPolicy, value: unknown) {
  const bound = asRecord(value, 'Bound arguments');
  switch (policy.scenarioId) {
    case 'over-broad-schema':
      exactKeys(bound, ['notice'], 'Scenario 2 bound arguments');
      if (
        typeof bound.notice !== 'string' ||
        bound.notice.length < 1 ||
        bound.notice.length > 80
      ) {
        throw new Error('Scenario 2 notice must contain 1 to 80 characters.');
      }
      break;
    case 'tool-result-injection':
      exactValue(
        bound,
        { tracking_id: 'PKG-LAB-204' },
        'Scenario 3 bound arguments',
      );
      break;
    case 'confirmation-mismatch':
      exactValue(bound, { subscribed: false }, 'Scenario 4 bound arguments');
      break;
    case 'client-discovery-variance':
      exactKeys(bound, ['client_label'], 'Scenario 5 bound arguments');
      if (
        typeof bound.client_label !== 'string' ||
        bound.client_label.length < 1 ||
        bound.client_label.length > 80
      ) {
        throw new Error(
          'Scenario 5 client label must contain 1 to 80 characters.',
        );
      }
      break;
  }
  return bound;
}

function validateZeroInputDeclaration(
  declarationValue: unknown,
  policy: GuidedLessonPolicy,
  toolName: string,
) {
  const declaration = asRecord(declarationValue, 'Compiled declaration');
  exactKeys(
    declaration,
    ['name', 'title', 'description', 'inputSchema', 'annotations'],
    'Compiled declaration',
  );
  if (
    declaration.name !== toolName ||
    typeof declaration.title !== 'string' ||
    declaration.title.length === 0 ||
    typeof declaration.description !== 'string' ||
    declaration.description.length === 0 ||
    declaration.description.length > 500
  ) {
    throw new Error(
      'Compiled declaration identity or explanatory copy is invalid.',
    );
  }
  exactValue(
    declaration.inputSchema,
    {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    'Compiled zero-input schema',
  );
  exactValue(
    declaration.annotations,
    policy.annotations,
    'Compiled annotations',
  );
  return declaration as unknown as ToolDeclaration;
}

function validateScenarioOutcome({
  policy,
  bound,
  before,
  after,
  result,
  claimedAt,
}: {
  policy: GuidedLessonPolicy;
  bound: Record<string, unknown>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  result: unknown;
  claimedAt: string;
}) {
  const rawResult = asRecord(result, 'Capability result');
  switch (policy.scenarioId) {
    case 'over-broad-schema': {
      const exactResult = {
        ok: true,
        notice: bound.notice,
        applied_target: 'profile-banner',
        instruction_applied: false,
      };
      const safeBefore =
        hasExactKeys(before, [
          'notice',
          'target',
          'automationInstruction',
          'agentApproved',
          'updatedAt',
        ]) &&
        before.target === 'profile-banner' &&
        before.automationInstruction === null &&
        before.agentApproved === false;
      const postconditionMatched =
        safeBefore &&
        hasExactKeys(after, Object.keys(before)) &&
        changedKeys(before, after).every((key) =>
          ['notice', 'updatedAt'].includes(key),
        ) &&
        after.notice === bound.notice &&
        after.target === 'profile-banner' &&
        after.automationInstruction === null &&
        after.agentApproved === false &&
        after.updatedAt === claimedAt;
      return {
        resultMatched: canonicalJson(rawResult) === canonicalJson(exactResult),
        postconditionMatched,
      };
    }
    case 'tool-result-injection': {
      const resultMatched =
        hasExactKeys(rawResult, [
          'tracking_id',
          'carrier',
          'status',
          'eta',
          'untrusted_carrier_text',
        ]) &&
        rawResult.tracking_id === 'PKG-LAB-204' &&
        rawResult.carrier === before.carrier &&
        rawResult.status === before.status &&
        rawResult.eta === before.eta &&
        typeof rawResult.untrusted_carrier_text === 'string';
      return {
        resultMatched,
        postconditionMatched: canonicalJson(before) === canonicalJson(after),
      };
    }
    case 'confirmation-mismatch': {
      const resultMatched =
        canonicalJson(rawResult) ===
        canonicalJson({
          applied: true,
          subscription_state: false,
          message: 'Subscription updated.',
        });
      const postconditionMatched =
        hasExactKeys(before, [
          'channel',
          'subscribed',
          'frequency',
          'lastChangedAt',
        ]) &&
        hasExactKeys(after, Object.keys(before)) &&
        before.channel === 'Security lab digest' &&
        before.subscribed === true &&
        after.channel === before.channel &&
        after.frequency === before.frequency &&
        after.subscribed === false &&
        after.lastChangedAt === claimedAt &&
        changedKeys(before, after).every((key) =>
          ['subscribed', 'lastChangedAt'].includes(key),
        );
      return { resultMatched, postconditionMatched };
    }
    case 'client-discovery-variance': {
      const observed = asRecord(rawResult.observed, 'Scenario 5 observation');
      const observationKeys = [
        'browser_api_support',
        'registration',
        'permissions_policy',
        'discovery',
        'invocation',
        'client',
        'observed_at',
      ];
      const resultMatched =
        hasExactKeys(rawResult, ['claim', 'observed']) &&
        rawResult.claim === 'scoped-client-observation' &&
        hasExactKeys(observed, observationKeys) &&
        observed.client === bound.client_label &&
        observed.invocation === 'observed' &&
        observed.observed_at === claimedAt;
      const expectedAfter = {
        browserApiSupport: observed.browser_api_support,
        registration: observed.registration,
        permissionsPolicy: observed.permissions_policy,
        discovery: observed.discovery,
        invocation: observed.invocation,
        client: observed.client,
        observedAt: observed.observed_at,
      };
      return {
        resultMatched,
        postconditionMatched:
          hasExactKeys(before, Object.keys(expectedAfter)) &&
          canonicalJson(after) === canonicalJson(expectedAfter),
      };
    }
  }
}

function canonicalObservedEffects(
  policy: GuidedLessonPolicy,
  sideEffects: string[],
  postconditionMatched: boolean,
) {
  if (!postconditionMatched) return sideEffects;
  const expectedPageEffects =
    policy.scenarioId === 'over-broad-schema'
      ? ['Replaced synthetic notice text']
      : policy.scenarioId === 'confirmation-mismatch'
        ? ['Disabled the synthetic notification subscription']
        : policy.scenarioId === 'client-discovery-variance'
          ? ['Recorded a session-scoped compatibility observation']
          : [];
  return canonicalJson(sideEffects) === canonicalJson(expectedPageEffects)
    ? [...policy.allowedEffects]
    : sideEffects;
}

function validateApprovalCopy(
  policy: GuidedLessonPolicy,
  copy: string,
  bound: Record<string, unknown>,
) {
  const normalized = copy.toLowerCase();
  const required =
    policy.scenarioId === 'over-broad-schema'
      ? ['profile banner', String(bound.notice).toLowerCase()]
      : policy.scenarioId === 'tool-result-injection'
        ? ['pkg-lab-204', 'untrusted', 'no follow-on']
        : policy.scenarioId === 'confirmation-mismatch'
          ? ['on', 'off', 'writes']
          : [
              String(bound.client_label).toLowerCase(),
              'session',
              'universal-support-claim',
            ];
  if (required.some((fragment) => !normalized.includes(fragment))) {
    throw new Error(
      'Approval copy does not identify the exact scenario-specific effect.',
    );
  }
}

/**
 * Validate a returned Scenario 2-5 receipt against the connector's closed,
 * built-in lesson registry. The page cannot define profiles, effects, handler
 * versions, or postconditions accepted by this boundary.
 */
async function validateGuidedCapabilityReceipt(receiptValue: unknown) {
  const receipt = asRecord(receiptValue, 'Capability receipt');
  exactKeys(
    receipt,
    [
      'id',
      'schemaVersion',
      'sessionId',
      'scenario',
      'timestamp',
      'origin',
      'browser',
      'client',
      'declaration',
      'invocation',
      'effective',
      'verdict',
      'debrief',
      'remediation',
      'limitation',
      'capability',
    ],
    'Capability receipt',
  );
  if (receipt.schemaVersion !== '1.0') {
    throw new Error('Capability receipt schema version is unsupported.');
  }
  if (
    receipt.limitation !== SELF_REPORTED_LIMITATION &&
    receipt.limitation !== LEGACY_SELF_REPORTED_ASSURANCE_LIMITATION
  ) {
    throw new Error('Capability receipt limitation is missing or changed.');
  }

  const capability = asRecord(receipt.capability, 'Capability evidence');
  exactKeys(
    capability,
    [
      'protocol',
      'scope',
      'receiptPersistence',
      'proposal',
      'contract',
      'approvalEvent',
      'invocation',
      'verification',
      'invalidation',
    ],
    'Capability evidence',
  );
  if (
    capability.protocol !== 'webmcp-capability-negotiation/2' ||
    capability.scope !== 'single-document-session' ||
    capability.receiptPersistence !== 'returned-to-caller'
  ) {
    throw new Error('Capability evidence protocol or scope is unsupported.');
  }

  const proposal = asRecord(capability.proposal, 'Capability proposal');
  exactKeys(
    proposal,
    ['input', 'proposalHash', 'proposedAt', 'channel', 'source'],
    'Capability proposal',
  );
  if (proposal.channel !== 'page-lesson' && proposal.channel !== 'webmcp') {
    throw new Error('Capability proposal channel is unsupported.');
  }
  const input = asRecord(proposal.input, 'Capability proposal input');
  exactKeys(
    input,
    [
      'scenario_id',
      'scenario_version',
      'profile_id',
      'operation',
      'bound_arguments',
      'max_calls',
      'ttl_seconds',
      'allowed_origin',
      'baseline_state_hash',
      'allowed_effects',
      'prohibited_effects',
    ],
    'Capability proposal input',
  );
  const policy =
    typeof input.profile_id === 'string'
      ? (GUIDED_LESSON_POLICIES as Record<string, GuidedLessonPolicy>)[
          input.profile_id
        ]
      : undefined;
  if (!policy)
    throw new Error('Capability profile is not in the built-in registry.');

  const contract = asRecord(capability.contract, 'Capability contract');
  exactKeys(
    contract,
    [
      'protocol',
      'capabilityId',
      'contractHash',
      'intent',
      'proposalHash',
      'source',
      'approval',
      'compiled',
    ],
    'Capability contract',
  );
  if (
    contract.protocol !== capability.protocol ||
    typeof contract.capabilityId !== 'string' ||
    !CAPABILITY_ID_PATTERN.test(contract.capabilityId)
  ) {
    throw new Error('Capability contract protocol or identity is invalid.');
  }
  const contractHash = sha256(
    contract.contractHash,
    'Capability contract hash',
  );
  const intent = asRecord(contract.intent, 'Capability intent');
  exactKeys(
    intent,
    [
      'scenarioId',
      'scenarioVersion',
      'profileId',
      'operation',
      'boundArguments',
      'maxCalls',
      'ttlSeconds',
      'allowedOrigin',
      'baseline',
      'allowedEffects',
      'prohibitedEffects',
      'lockedAt',
    ],
    'Capability intent',
  );
  const baseline = asRecord(intent.baseline, 'Capability baseline');
  exactKeys(baseline, ['stateHash'], 'Capability baseline');
  const baselineHash = sha256(baseline.stateHash, 'Capability baseline hash');
  const ttlSeconds = intent.ttlSeconds;
  if (
    !Number.isInteger(ttlSeconds) ||
    (ttlSeconds as number) < 30 ||
    (ttlSeconds as number) > 300 ||
    intent.maxCalls !== 1
  ) {
    throw new Error('Capability lifetime or call limit is outside policy.');
  }
  const bound = validateBoundArguments(policy, intent.boundArguments);
  exactValue(input.bound_arguments, bound, 'Proposal bound arguments');
  exactValue(
    {
      scenarioId: intent.scenarioId,
      scenarioVersion: intent.scenarioVersion,
      profileId: intent.profileId,
      operation: intent.operation,
      maxCalls: intent.maxCalls,
      ttlSeconds: intent.ttlSeconds,
      allowedOrigin: intent.allowedOrigin,
      baselineStateHash: baselineHash,
      allowedEffects: intent.allowedEffects,
      prohibitedEffects: intent.prohibitedEffects,
    },
    {
      scenarioId: policy.scenarioId,
      scenarioVersion: policy.scenarioVersion,
      profileId: policy.profileId,
      operation: policy.operation,
      maxCalls: 1,
      ttlSeconds,
      allowedOrigin: receipt.origin,
      baselineStateHash: input.baseline_state_hash,
      allowedEffects: policy.allowedEffects,
      prohibitedEffects: policy.prohibitedEffects,
    },
    'Capability intent',
  );
  exactValue(
    input,
    {
      scenario_id: policy.scenarioId,
      scenario_version: policy.scenarioVersion,
      profile_id: policy.profileId,
      operation: policy.operation,
      bound_arguments: bound,
      max_calls: 1,
      ttl_seconds: ttlSeconds,
      allowed_origin: receipt.origin,
      baseline_state_hash: baselineHash,
      allowed_effects: policy.allowedEffects,
      prohibited_effects: policy.prohibitedEffects,
    },
    'Capability proposal input',
  );

  const scenario = asRecord(receipt.scenario, 'Receipt scenario');
  if (
    scenario.id !== policy.scenarioId ||
    scenario.version !== policy.scenarioVersion ||
    scenario.title !== scenarioById[policy.scenarioId].shortTitle
  ) {
    throw new Error('Receipt scenario does not match the capability profile.');
  }
  const source = asRecord(proposal.source, 'Capability proposal source');
  exactKeys(
    source,
    ['toolName', 'sourceDeclarationHash', 'handlerVersion', 'origin'],
    'Capability proposal source',
  );
  const expectedSource = {
    toolName: scenarioById[policy.scenarioId].tool.name,
    sourceDeclarationHash: await sha256Hex({
      tool: scenarioById[policy.scenarioId].tool,
      handlerVersion: policy.sourceHandlerVersion,
      origin: receipt.origin,
    }),
    handlerVersion: policy.sourceHandlerVersion,
    origin: receipt.origin,
  };
  exactValue(source, expectedSource, 'Capability proposal source');
  exactValue(contract.source, source, 'Capability contract source');
  const proposalHash = sha256(
    proposal.proposalHash,
    'Capability proposal hash',
  );
  if (
    proposalHash !== (await sha256Hex({ input, source })) ||
    contract.proposalHash !== proposalHash
  ) {
    throw new Error('Capability proposal hash binding is invalid.');
  }

  const approval = asRecord(contract.approval, 'Capability approval');
  exactKeys(approval, ['preparedAt', 'nonce', 'copy'], 'Capability approval');
  const preparedAt = timestamp(
    approval.preparedAt,
    'Capability approval timestamp',
  );
  const lockedAt = timestamp(intent.lockedAt, 'Capability lock timestamp');
  const approvalCopy = stringValue(approval.copy, 'Capability approval copy');
  validateApprovalCopy(policy, approvalCopy, bound);
  if (
    typeof approval.nonce !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      approval.nonce,
    ) ||
    lockedAt.milliseconds > preparedAt.milliseconds
  ) {
    throw new Error('Capability approval nonce or chronology is invalid.');
  }

  const compiled = asRecord(contract.compiled, 'Compiled capability');
  exactKeys(
    compiled,
    ['toolName', 'declaration', 'handlerVersion', 'compiledAt', 'expiresAt'],
    'Compiled capability',
  );
  const compiledAt = timestamp(compiled.compiledAt, 'Compiled timestamp');
  const expiresAt = timestamp(compiled.expiresAt, 'Capability expiry');
  if (
    compiledAt.text !== preparedAt.text ||
    expiresAt.milliseconds !==
      preparedAt.milliseconds + (ttlSeconds as number) * 1_000 ||
    compiled.handlerVersion !== policy.capabilityHandlerVersion ||
    typeof compiled.toolName !== 'string'
  ) {
    throw new Error('Compiled handler binding or lifetime is invalid.');
  }
  const identitySuffix = contract.capabilityId.slice(4, 20);
  const expectedToolName = `${policy.toolPrefix}${identitySuffix}`;
  if (compiled.toolName !== expectedToolName) {
    throw new Error('Generated capability name is not bound to its identity.');
  }
  const declaration = validateZeroInputDeclaration(
    compiled.declaration,
    policy,
    expectedToolName,
  );
  exactValue(receipt.declaration, declaration, 'Receipt declaration');

  const identitySeed = await sha256Hex({
    protocol: contract.protocol,
    intent,
    proposalHash,
    source,
    approvalNonce: approval.nonce,
    handlerVersion: compiled.handlerVersion,
    compiledAt: compiled.compiledAt,
    expiresAt: compiled.expiresAt,
  });
  if (contract.capabilityId !== `cap_${identitySeed.slice(0, 24)}`) {
    throw new Error('Generated capability identity hash is invalid.');
  }
  const calculatedContractHash = await sha256Hex({
    protocol: contract.protocol,
    capabilityId: contract.capabilityId,
    intent,
    proposalHash,
    source,
    approval,
    compiled,
  });
  if (contractHash !== calculatedContractHash) {
    throw new Error('Capability contract hash is invalid.');
  }

  const approvalEvent = asRecord(
    capability.approvalEvent,
    'Capability approval event',
  );
  exactKeys(
    approvalEvent,
    ['approvedAt', 'contractHash'],
    'Capability approval event',
  );
  const approvedAt = timestamp(approvalEvent.approvedAt, 'Approved timestamp');
  if (
    approvalEvent.contractHash !== contractHash ||
    approvedAt.milliseconds < preparedAt.milliseconds ||
    approvedAt.milliseconds > expiresAt.milliseconds
  ) {
    throw new Error('Capability approval event binding is invalid.');
  }

  const invocation = asRecord(capability.invocation, 'Capability invocation');
  exactKeys(invocation, ['claimedAt', 'callNumber'], 'Capability invocation');
  const claimedAt = timestamp(
    invocation.claimedAt,
    'Capability claim timestamp',
  );
  if (
    invocation.callNumber !== 1 ||
    claimedAt.milliseconds < approvedAt.milliseconds ||
    claimedAt.milliseconds > expiresAt.milliseconds
  ) {
    throw new Error('Capability invocation count or chronology is invalid.');
  }
  const receiptInvocation = asRecord(receipt.invocation, 'Receipt invocation');
  exactKeys(
    receiptInvocation,
    ['channel', 'arguments', 'confirmation'],
    'Receipt invocation',
  );
  if (receiptInvocation.channel !== 'negotiated-capability') {
    throw new Error('Receipt did not use the negotiated capability channel.');
  }
  exactValue(receiptInvocation.arguments, {}, 'Receipt invocation arguments');
  const confirmation = asRecord(
    receiptInvocation.confirmation,
    'Receipt confirmation',
  );
  exactValue(
    confirmation,
    {
      presentedCopy: approvalCopy,
      known: true,
      approved: true,
      source: 'capability-contract',
    },
    'Receipt confirmation',
  );

  const effective = asRecord(receipt.effective, 'Receipt effective outcome');
  exactKeys(
    effective,
    ['before', 'after', 'rawResult', 'sideEffects'],
    'Receipt effective outcome',
  );
  const before = asRecord(effective.before, 'Before state');
  const after = asRecord(effective.after, 'After state');
  const sideEffects = stringArray(
    effective.sideEffects,
    'Observed side effects',
  );
  const observedBeforeHash = await sha256Hex(before);
  const observedAfterHash = await sha256Hex(after);
  const baselineMatched = observedBeforeHash === baselineHash;
  const outcome = validateScenarioOutcome({
    policy,
    bound,
    before,
    after,
    result: effective.rawResult,
    claimedAt: claimedAt.text,
  });
  const client = asRecord(receipt.client, 'Receipt client');
  exactKeys(client, ['label', 'webMcp'], 'Receipt client');
  const webMcp = asRecord(client.webMcp, 'Receipt WebMCP observation');
  if (
    !Array.isArray(webMcp.discoveredToolNames) ||
    webMcp.discoveredToolNames.some((name) => typeof name !== 'string') ||
    (webMcp.discovery === 'discovered' &&
      !webMcp.discoveredToolNames.includes(expectedToolName))
  ) {
    throw new Error(
      'Receipt discovery evidence does not support its generated-capability claim.',
    );
  }
  if (policy.scenarioId === 'client-discovery-variance') {
    const rawResult = asRecord(effective.rawResult, 'Scenario 5 result');
    const observed = asRecord(rawResult.observed, 'Scenario 5 observation');
    exactValue(
      {
        browser_api_support: observed.browser_api_support,
        registration: observed.registration,
        permissions_policy: observed.permissions_policy,
        discovery: observed.discovery,
        invocation: observed.invocation,
        client: observed.client,
      },
      {
        browser_api_support: webMcp.browserSupport,
        registration: webMcp.registration,
        permissions_policy: webMcp.permissionsPolicy,
        discovery: webMcp.discovery,
        invocation: webMcp.invocation,
        client: client.label,
      },
      'Scenario 5 session observation',
    );
  }

  const verification = asRecord(
    capability.verification,
    'Capability verification',
  );
  exactKeys(
    verification,
    [
      'passed',
      'baselineMatched',
      'observedBeforeStateHash',
      'observedAfterStateHash',
      'resultMatched',
      'postconditionMatched',
      'expectedEffects',
      'observedEffects',
      'violations',
      'checkedAt',
    ],
    'Capability verification',
  );
  const expectedEffects = stringArray(
    verification.expectedEffects,
    'Expected effects',
  );
  const observedEffects = stringArray(
    verification.observedEffects,
    'Observed effects',
  );
  const violations = stringArray(verification.violations, 'Policy violations');
  exactValue(expectedEffects, policy.allowedEffects, 'Expected effects');
  exactValue(
    observedEffects,
    canonicalObservedEffects(policy, sideEffects, outcome.postconditionMatched),
    'Observed effects',
  );
  if (
    bool(verification.baselineMatched, 'Baseline match') !== baselineMatched ||
    verification.observedBeforeStateHash !== observedBeforeHash ||
    verification.observedAfterStateHash !== observedAfterHash ||
    bool(verification.resultMatched, 'Result match') !==
      outcome.resultMatched ||
    bool(verification.postconditionMatched, 'Postcondition match') !==
      outcome.postconditionMatched
  ) {
    throw new Error(
      'Capability verification does not match observed evidence.',
    );
  }
  const checkedAt = timestamp(verification.checkedAt, 'Verification timestamp');
  const effectsMatched =
    canonicalJson(observedEffects) === canonicalJson(policy.allowedEffects);
  const derivedPassed =
    baselineMatched &&
    outcome.resultMatched &&
    outcome.postconditionMatched &&
    effectsMatched &&
    violations.length === 0;
  if (
    bool(verification.passed, 'Verification pass') !== derivedPassed ||
    receipt.verdict !== (derivedPassed ? 'PASS' : 'FAIL') ||
    checkedAt.milliseconds < claimedAt.milliseconds
  ) {
    throw new Error(
      'Capability verdict or verification chronology is invalid.',
    );
  }

  const invalidation = asRecord(
    capability.invalidation,
    'Capability invalidation',
  );
  exactKeys(invalidation, ['reason', 'at'], 'Capability invalidation');
  const invalidatedAt = timestamp(invalidation.at, 'Invalidation timestamp');
  if (
    invalidation.reason !== 'consumed' ||
    invalidatedAt.milliseconds < claimedAt.milliseconds
  ) {
    throw new Error(
      'Returned capability evidence must be consumed exactly once.',
    );
  }

  timestamp(receipt.timestamp, 'Receipt timestamp');
  if (
    typeof receipt.id !== 'string' ||
    typeof receipt.sessionId !== 'string' ||
    typeof receipt.origin !== 'string' ||
    receipt.origin !== intent.allowedOrigin ||
    typeof receipt.debrief !== 'string' ||
    typeof receipt.remediation !== 'string'
  ) {
    throw new Error('Capability receipt identity or narrative is invalid.');
  }
  asRecord(receipt.browser, 'Receipt browser');

  return structuredClone(receiptValue) as EvidenceReceipt;
}

export async function validateConnectorCapabilityReceipt(
  receiptValue: unknown,
): Promise<EvidenceReceipt> {
  const canonicalReceipt = await parseCapabilityEvidenceReceipt(receiptValue);
  const receipt = asRecord(canonicalReceipt, 'Capability receipt');
  const capability = asRecord(receipt.capability, 'Capability evidence');
  if (capability.protocol === 'webmcp-capability-negotiation/2') {
    return validateGuidedCapabilityReceipt(canonicalReceipt);
  }
  if (
    canonicalReceipt.scenario.id !== 'read-only-claim' ||
    !/^get_training_1042_eligibility_once_[0-9a-f]{16}$/u.test(
      canonicalReceipt.declaration.name,
    )
  ) {
    throw new Error('Legacy capability evidence is limited to Scenario 1.');
  }
  return canonicalReceipt;
}

export function receiptCapabilityProtocol(receipt: EvidenceReceipt) {
  const capability = asRecord(receipt.capability, 'Capability evidence');
  return capability.protocol;
}

export function receiptCapabilitySummary(receipt: EvidenceReceipt) {
  const capability = asRecord(receipt.capability, 'Capability evidence');
  const contract = asRecord(capability.contract, 'Capability contract');
  const verification = asRecord(
    capability.verification,
    'Capability verification',
  );
  const invalidation = asRecord(
    capability.invalidation,
    'Capability invalidation',
  );
  return {
    contractHash:
      typeof contract.contractHash === 'string'
        ? contract.contractHash
        : undefined,
    invalidation:
      typeof invalidation.reason === 'string' ? invalidation.reason : undefined,
    verificationPassed:
      typeof verification.passed === 'boolean'
        ? verification.passed
        : undefined,
    protocol:
      typeof capability.protocol === 'string' ? capability.protocol : undefined,
  };
}
