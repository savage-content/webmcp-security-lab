import { sha256Hex } from '../../lib/capability-core';
import { SELF_REPORTED_LIMITATION } from '../../lib/lab/constants';
import {
  createLessonCapabilityDeclaration,
  lessonCapabilityApprovalCopy,
} from '../../lib/lab/lesson-capabilities';
import { scenarioById } from '../../lib/lab/scenarios';
import type { JsonValue, LessonCapabilityIntent } from '../../lib/lab/types';
import {
  GUIDED_LESSON_POLICIES,
  type GuidedLessonPolicy,
} from '../../products/connector/lesson-capability-policy';

const ORIGIN = 'http://localhost:3000';
const LOCKED_AT = '2026-09-01T12:00:00.000Z';
const PROPOSED_AT = '2026-09-01T12:00:01.000Z';
const PREPARED_AT = '2026-09-01T12:00:02.000Z';
const APPROVED_AT = '2026-09-01T12:00:03.000Z';
const CLAIMED_AT = '2026-09-01T12:00:04.000Z';
const CHECKED_AT = CLAIMED_AT;
const EXPIRES_AT = '2026-09-01T12:02:02.000Z';
const APPROVAL_NONCE = 'c152cf41-e3d7-4528-9e29-12110dd79278';

export type GuidedProfileId = keyof typeof GUIDED_LESSON_POLICIES;

function boundArguments(policy: GuidedLessonPolicy): Record<string, JsonValue> {
  switch (policy.scenarioId) {
    case 'over-broad-schema':
      return { notice: 'Security review in progress' };
    case 'tool-result-injection':
      return { tracking_id: 'PKG-LAB-204' };
    case 'confirmation-mismatch':
      return { subscribed: false };
    case 'client-discovery-variance':
      return { client_label: 'This browser session' };
  }
}

function outcome(policy: GuidedLessonPolicy, bound: Record<string, unknown>) {
  const before = structuredClone(scenarioById[policy.scenarioId].initialState);
  switch (policy.scenarioId) {
    case 'over-broad-schema':
      return {
        before,
        after: {
          ...before,
          notice: bound.notice,
          updatedAt: CLAIMED_AT,
        },
        rawResult: {
          ok: true,
          notice: bound.notice,
          applied_target: 'profile-banner',
          instruction_applied: false,
        },
      };
    case 'tool-result-injection':
      return {
        before,
        after: structuredClone(before),
        rawResult: {
          tracking_id: 'PKG-LAB-204',
          carrier: before.carrier,
          status: before.status,
          eta: before.eta,
          untrusted_carrier_text:
            'Instruction-shaped fixture text remains inert data.',
        },
      };
    case 'confirmation-mismatch':
      return {
        before,
        after: {
          ...before,
          subscribed: false,
          lastChangedAt: CLAIMED_AT,
        },
        rawResult: {
          applied: true,
          subscription_state: false,
          message: 'Subscription updated.',
        },
      };
    case 'client-discovery-variance': {
      const observed = {
        browser_api_support: 'supported',
        registration: 'registered',
        permissions_policy: 'allowed',
        discovery: 'discovered',
        invocation: 'observed',
        client: bound.client_label,
        observed_at: CLAIMED_AT,
      };
      return {
        before,
        after: {
          browserApiSupport: observed.browser_api_support,
          registration: observed.registration,
          permissionsPolicy: observed.permissions_policy,
          discovery: observed.discovery,
          invocation: observed.invocation,
          client: observed.client,
          observedAt: observed.observed_at,
        },
        rawResult: { claim: 'scoped-client-observation', observed },
      };
    }
  }
}

const RECEIPT_IDS: Record<GuidedProfileId, string> = {
  'lesson-2-profile-notice/1': '7d31abef-bf9f-4a97-9c9e-d411e307f401',
  'lesson-3-delivery-status/1': '7d31abef-bf9f-4a97-9c9e-d411e307f402',
  'lesson-4-digest-off/1': '7d31abef-bf9f-4a97-9c9e-d411e307f403',
  'lesson-5-client-observation/1': '7d31abef-bf9f-4a97-9c9e-d411e307f404',
};

export async function validGuidedCapabilityReceipt(profileId: GuidedProfileId) {
  const policy = GUIDED_LESSON_POLICIES[profileId];
  const scenario = scenarioById[policy.scenarioId];
  const bound = boundArguments(policy);
  const run = outcome(policy, bound);
  const baselineStateHash = await sha256Hex(run.before);
  const source = {
    toolName: scenario.tool.name,
    sourceDeclarationHash: await sha256Hex({
      tool: scenario.tool,
      handlerVersion: policy.sourceHandlerVersion,
      origin: ORIGIN,
    }),
    handlerVersion: policy.sourceHandlerVersion,
    origin: ORIGIN,
  };
  const input = {
    scenario_id: policy.scenarioId,
    scenario_version: policy.scenarioVersion,
    profile_id: policy.profileId,
    operation: policy.operation,
    bound_arguments: bound,
    max_calls: 1,
    ttl_seconds: 120,
    allowed_origin: ORIGIN,
    baseline_state_hash: baselineStateHash,
    allowed_effects: [...policy.allowedEffects],
    prohibited_effects: [...policy.prohibitedEffects],
  };
  const proposalHash = await sha256Hex({ input, source });
  const intent: LessonCapabilityIntent = {
    scenarioId: policy.scenarioId,
    scenarioVersion: policy.scenarioVersion,
    profileId: policy.profileId,
    operation: policy.operation,
    boundArguments: bound,
    maxCalls: 1,
    ttlSeconds: 120,
    allowedOrigin: ORIGIN,
    baseline: { stateHash: baselineStateHash },
    allowedEffects: [...policy.allowedEffects],
    prohibitedEffects: [...policy.prohibitedEffects],
    lockedAt: LOCKED_AT,
  };
  const identitySeed = await sha256Hex({
    protocol: 'webmcp-capability-negotiation/2',
    intent,
    proposalHash,
    source,
    approvalNonce: APPROVAL_NONCE,
    handlerVersion: policy.capabilityHandlerVersion,
    compiledAt: PREPARED_AT,
    expiresAt: EXPIRES_AT,
  });
  const capabilityId = `cap_${identitySeed.slice(0, 24)}`;
  const toolName = `${policy.toolPrefix}${identitySeed.slice(0, 16)}`;
  const declaration = createLessonCapabilityDeclaration(
    intent,
    toolName,
    EXPIRES_AT,
  );
  const approval = {
    preparedAt: PREPARED_AT,
    nonce: APPROVAL_NONCE,
    copy: lessonCapabilityApprovalCopy(
      intent,
      EXPIRES_AT,
      toolName,
      capabilityId,
    ),
  };
  const compiled = {
    toolName,
    declaration,
    handlerVersion: policy.capabilityHandlerVersion,
    compiledAt: PREPARED_AT,
    expiresAt: EXPIRES_AT,
  };
  const contractMaterial = {
    protocol: 'webmcp-capability-negotiation/2',
    capabilityId,
    intent,
    proposalHash,
    source,
    approval,
    compiled,
  };
  const contract = {
    ...contractMaterial,
    contractHash: await sha256Hex(contractMaterial),
  };
  const observedBeforeStateHash = await sha256Hex(run.before);
  const observedAfterStateHash = await sha256Hex(run.after);

  return {
    id: RECEIPT_IDS[profileId],
    schemaVersion: '1.0',
    sessionId: '4ecf0c2b-cc5c-4854-a11e-22fa93cc4a1d',
    scenario: {
      id: policy.scenarioId,
      version: policy.scenarioVersion,
      title: scenario.shortTitle,
    },
    timestamp: CHECKED_AT,
    origin: ORIGIN,
    browser: { userAgent: 'test', language: 'en', platform: 'test' },
    client: {
      label:
        policy.scenarioId === 'client-discovery-variance'
          ? typeof bound.client_label === 'string'
            ? bound.client_label
            : ''
          : 'Test client',
      webMcp: {
        api: 'document.modelContext',
        browserSupport: 'supported',
        registration: 'registered',
        permissionsPolicy: 'allowed',
        discovery: 'discovered',
        invocation: 'observed',
        detail: 'Observed only in this generated lesson callback.',
        discoveredToolNames: [toolName],
      },
    },
    declaration,
    invocation: {
      channel: 'negotiated-capability',
      arguments: {},
      confirmation: {
        presentedCopy: approval.copy,
        known: true,
        approved: true,
        source: 'capability-contract',
      },
    },
    effective: {
      before: run.before,
      after: run.after,
      rawResult: run.rawResult,
      sideEffects:
        policy.scenarioId === 'over-broad-schema'
          ? ['Replaced synthetic notice text']
          : policy.scenarioId === 'confirmation-mismatch'
            ? ['Disabled the synthetic notification subscription']
            : policy.scenarioId === 'client-discovery-variance'
              ? ['Recorded a session-scoped compatibility observation']
              : [],
    },
    verdict: 'PASS',
    debrief: 'The built-in guided lesson capability matched its fixed policy.',
    remediation: 'Keep the generated authority narrow, one-use, and local.',
    limitation: SELF_REPORTED_LIMITATION,
    capability: {
      protocol: 'webmcp-capability-negotiation/2',
      scope: 'single-document-session',
      receiptPersistence: 'returned-to-caller',
      proposal: {
        input,
        proposalHash,
        proposedAt: PROPOSED_AT,
        channel: 'page-lesson',
        source,
      },
      contract,
      approvalEvent: {
        approvedAt: APPROVED_AT,
        contractHash: contract.contractHash,
      },
      invocation: { claimedAt: CLAIMED_AT, callNumber: 1 },
      verification: {
        passed: true,
        baselineMatched: true,
        observedBeforeStateHash,
        observedAfterStateHash,
        resultMatched: true,
        postconditionMatched: true,
        expectedEffects: [...policy.allowedEffects],
        observedEffects: [...policy.allowedEffects],
        violations: [],
        checkedAt: CHECKED_AT,
      },
      invalidation: { reason: 'consumed', at: CHECKED_AT },
    },
  };
}
