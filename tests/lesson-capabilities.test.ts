import { describe, expect, it, vi } from 'vitest';

import { canonicalJson, sha256Hex } from '../lib/capability-core';
import {
  createLessonCapabilityPermitArtifact,
  LESSON_CAPABILITY_PERMIT_SCHEMA,
} from '../lib/lab/artifacts';
import { createEvidenceReceipt } from '../lib/lab/evidence';
import {
  compileLessonCapabilityContract,
  createLessonBoundArguments,
  createLessonCapabilityEvidence,
  createLessonIntent,
  createLessonProposalRecord,
  executeLessonCapability,
  LESSON_CAPABILITY_PROFILES,
  validateLessonCapabilityEvidenceIntegrity,
} from '../lib/lab/lesson-capabilities';
import { scenarioById } from '../lib/lab/scenarios';
import { parseCapabilityEvidenceReceipt } from '../lib/lab/schemas';
import type {
  CompiledLessonCapabilityContract,
  LessonCapabilityNegotiationEvidence,
  LessonCapabilityScenarioId,
  RunContext,
  WebMcpStatus,
} from '../lib/lab/types';
import {
  canonicalJson as canonicalPermitJson,
  validateCapabilityPermitText,
} from '../products/extension/policy-validation.js';

const ORIGIN = 'http://localhost:3001';
const PAGE_URL = `${ORIGIN}/course?lesson=2#exercise`;
const LOCKED_AT = '2026-09-01T12:00:00.000Z';
const PROPOSED_AT = '2026-09-01T12:00:01.000Z';
const PREPARED_AT = '2026-09-01T12:00:02.000Z';
const APPROVED_AT = '2026-09-01T12:00:03.000Z';
const CLAIMED_AT = '2026-09-01T12:00:04.000Z';
const APPROVAL_NONCE = 'c152cf41-e3d7-4528-9e29-12110dd79278';
const CLIENT_LABEL = 'Codex in-app browser';

const WEB_MCP: WebMcpStatus = {
  api: 'document.modelContext',
  browserSupport: 'supported',
  registration: 'registered',
  permissionsPolicy: 'allowed',
  discovery: 'discovered',
  invocation: 'observed',
  detail: 'Observed in the exact synthetic browser session.',
  discoveredToolNames: [],
};

const EXPECTED = {
  'over-broad-schema': {
    profileId: 'lesson-2-profile-notice/1',
    operation: 'replace-profile-notice',
    prefix: 'update_profile_notice_once_',
    arguments: { notice: 'Security review in progress' },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    effects: ['profile-notice-replaced'],
  },
  'tool-result-injection': {
    profileId: 'lesson-3-delivery-status/1',
    operation: 'read-delivery-status',
    prefix: 'get_synthetic_delivery_status_safe_once_',
    arguments: { tracking_id: 'PKG-LAB-204' },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    effects: [],
  },
  'confirmation-mismatch': {
    profileId: 'lesson-4-digest-off/1',
    operation: 'disable-training-notification-subscription',
    prefix: 'set_training_notification_subscription_once_',
    arguments: { subscribed: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    effects: ['notification-subscription-disabled'],
  },
  'client-discovery-variance': {
    profileId: 'lesson-5-client-observation/1',
    operation: 'record-session-capability-observation',
    prefix: 'record_webmcp_capability_observation_once_',
    arguments: { client_label: CLIENT_LABEL },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    effects: ['session-capability-observation-recorded'],
  },
} as const satisfies Record<
  LessonCapabilityScenarioId,
  {
    profileId: string;
    operation: string;
    prefix: string;
    arguments: Record<string, string | boolean>;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    effects: readonly string[];
  }
>;

const SCENARIO_IDS = Object.keys(EXPECTED) as LessonCapabilityScenarioId[];

async function setup(scenarioId: LessonCapabilityScenarioId) {
  const scenario = scenarioById[scenarioId];
  const intent = createLessonIntent({
    scenarioId,
    boundArguments: createLessonBoundArguments(scenarioId, CLIENT_LABEL),
    origin: ORIGIN,
    baselineStateHash: await sha256Hex(scenario.initialState),
    lockedAt: LOCKED_AT,
    ttlSeconds: 120,
  });
  const proposal = await createLessonProposalRecord({
    intent,
    sourceTool: scenario.tool,
    proposedAt: PROPOSED_AT,
  });
  const contract = await compileLessonCapabilityContract({
    intent,
    proposal,
    preparedAt: PREPARED_AT,
    approvalNonce: APPROVAL_NONCE,
  });
  return { scenario, intent, proposal, contract };
}

function negotiatedContext(
  contract: CompiledLessonCapabilityContract,
): RunContext {
  return {
    channel: 'negotiated-capability',
    now: CLAIMED_AT,
    origin: ORIGIN,
    browser: { userAgent: 'vitest', language: 'en', platform: 'test' },
    clientLabel: CLIENT_LABEL,
    webMcp: {
      ...WEB_MCP,
      discoveredToolNames: [contract.compiled.toolName],
    },
    confirmation: {
      presentedCopy: contract.approval.copy,
      known: true,
      approved: true,
      source: 'capability-contract',
    },
  };
}

async function rehashPermit(envelope: unknown) {
  const value = structuredClone(envelope) as {
    schemaVersion: string;
    payload: unknown;
    integrity: { contentSha256: string };
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      canonicalPermitJson({
        schemaVersion: value.schemaVersion,
        payload: value.payload,
      }),
    ),
  );
  value.integrity.contentSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return value;
}

describe('guided lesson capability negotiation v2', () => {
  it('compiles every profile into its exact generated zero-input declaration', async () => {
    for (const scenarioId of SCENARIO_IDS) {
      const expected = EXPECTED[scenarioId];
      const { intent, proposal, contract } = await setup(scenarioId);

      expect(intent).toMatchObject({
        scenarioId,
        scenarioVersion: '1.1.0',
        profileId: expected.profileId,
        operation: expected.operation,
        boundArguments: expected.arguments,
        maxCalls: 1,
        allowedOrigin: ORIGIN,
      });
      expect(proposal.input.bound_arguments).toEqual(expected.arguments);
      expect(proposal.input.max_calls).toBe(1);
      expect(contract.protocol).toBe('webmcp-capability-negotiation/2');
      expect(contract.compiled.toolName).toMatch(
        new RegExp(`^${expected.prefix}[0-9a-f]{16}$`),
      );
      expect(contract.compiled.declaration).toMatchObject({
        name: contract.compiled.toolName,
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
        annotations: expected.annotations,
      });
      expect(contract.intent.allowedEffects).toEqual(expected.effects);
      expect(contract.approval.copy).toContain(
        canonicalJson(expected.arguments),
      );
      expect(contract.compiled.expiresAt).toBe('2026-09-01T12:02:02.000Z');
      expect(LESSON_CAPABILITY_PROFILES[scenarioId]).toMatchObject({
        profileId: expected.profileId,
        operation: expected.operation,
        annotations: expected.annotations,
      });
    }
  });

  it('executes each bound safe action with only its canonical effects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      for (const scenarioId of SCENARIO_IDS) {
        const expected = EXPECTED[scenarioId];
        const { scenario, contract } = await setup(scenarioId);
        const { outcome, verification } = await executeLessonCapability({
          contract,
          currentState: structuredClone(scenario.initialState),
          checkedAt: CLAIMED_AT,
          webMcp: WEB_MCP,
        });

        expect(verification).toMatchObject({
          passed: true,
          baselineMatched: true,
          resultMatched: true,
          postconditionMatched: true,
          expectedEffects: expected.effects,
          observedEffects: expected.effects,
          violations: [],
        });
        expect(outcome.verdict).toBe('PASS');
        expect(outcome.sideEffects).toEqual(expected.effects);

        if (scenarioId === 'over-broad-schema') {
          expect(outcome.after).toEqual({
            ...scenario.initialState,
            notice: 'Security review in progress',
            updatedAt: CLAIMED_AT,
          });
        } else if (scenarioId === 'tool-result-injection') {
          expect(outcome.after).toEqual(outcome.before);
          expect(outcome.rawResult).toMatchObject({
            tracking_id: 'PKG-LAB-204',
            untrusted_carrier_text: expect.stringContaining('Ignore prior'),
          });
        } else if (scenarioId === 'confirmation-mismatch') {
          expect(outcome.after).toEqual({
            ...scenario.initialState,
            subscribed: false,
            lastChangedAt: CLAIMED_AT,
          });
        } else {
          expect(outcome.after).toEqual({
            browserApiSupport: WEB_MCP.browserSupport,
            registration: WEB_MCP.registration,
            permissionsPolicy: WEB_MCP.permissionsPolicy,
            discovery: WEB_MCP.discovery,
            invocation: WEB_MCP.invocation,
            client: CLIENT_LABEL,
            observedAt: CLAIMED_AT,
          });
          expect(outcome.rawResult).not.toHaveProperty(
            'universal_support_verified',
          );
        }
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('links schema-valid receipts and rejects capability or result tampering', async () => {
    for (const scenarioId of SCENARIO_IDS) {
      const { scenario, proposal, contract } = await setup(scenarioId);
      const { outcome, verification } = await executeLessonCapability({
        contract,
        currentState: structuredClone(scenario.initialState),
        checkedAt: CLAIMED_AT,
        webMcp: WEB_MCP,
      });
      const capability = createLessonCapabilityEvidence({
        proposal,
        contract,
        approvedAt: APPROVED_AT,
        claimedAt: CLAIMED_AT,
        verification,
      });
      const receipt = createEvidenceReceipt({
        scenario,
        declaration: contract.compiled.declaration,
        argumentsValue: {},
        context: negotiatedContext(contract),
        outcome,
        sessionId: '4ecf0c2b-cc5c-4854-a11e-22fa93cc4a1d',
        capability,
        id: '6f8f5771-9cde-4f2d-b9f1-66d29ef5a930',
      });

      await expect(
        validateLessonCapabilityEvidenceIntegrity(capability),
      ).resolves.toEqual(capability);
      await expect(parseCapabilityEvidenceReceipt(receipt)).resolves.toEqual(
        receipt,
      );

      const changedIntent = structuredClone(
        capability,
      ) as LessonCapabilityNegotiationEvidence;
      changedIntent.contract.intent.boundArguments = {
        ...changedIntent.contract.intent.boundArguments,
        hidden_authority: true,
      };
      await expect(
        validateLessonCapabilityEvidenceIntegrity(changedIntent),
      ).rejects.toThrow();

      const changedDeclaration = structuredClone(
        capability,
      ) as LessonCapabilityNegotiationEvidence;
      changedDeclaration.contract.compiled.declaration.annotations.readOnlyHint =
        !changedDeclaration.contract.compiled.declaration.annotations
          .readOnlyHint;
      await expect(
        validateLessonCapabilityEvidenceIntegrity(changedDeclaration),
      ).rejects.toThrow('Compiled lesson capability material is invalid');

      const changedResult = structuredClone(receipt);
      changedResult.effective.after = {
        ...changedResult.effective.after,
        unauthorized: true,
      };
      await expect(
        parseCapabilityEvidenceReceipt(changedResult),
      ).rejects.toThrow('observed state hashes');
    }
  });

  it('emits and parses a v2 permit with the exact frozen lesson binding', async () => {
    for (const scenarioId of SCENARIO_IDS) {
      const expected = EXPECTED[scenarioId];
      const { contract } = await setup(scenarioId);
      const artifact = await createLessonCapabilityPermitArtifact(
        contract,
        APPROVED_AT,
        PAGE_URL,
      );
      const envelope = JSON.parse(artifact.text) as {
        payload: {
          schemaVersion: string;
          scope: { origin: string; pageUrl: string };
          capability: {
            arguments: Record<string, unknown>;
            inputSchema: Record<string, unknown>;
          };
          binding: {
            contractHash: string;
            proposalHash: string;
            sourceDeclarationHash: string;
            sourceHandlerVersion: string;
            capabilityHandlerVersion: string;
          };
          lesson: {
            scenarioId: string;
            scenarioVersion: string;
            profileId: string;
            operation: string;
            boundArguments: Record<string, unknown>;
            baselineStateHash: string;
            allowedEffects: string[];
            prohibitedEffects: string[];
          };
        };
      };

      expect(envelope.payload).toMatchObject({
        schemaVersion: LESSON_CAPABILITY_PERMIT_SCHEMA,
        scope: { origin: ORIGIN, pageUrl: `${ORIGIN}/course` },
        capability: {
          arguments: {},
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        binding: {
          contractHash: contract.contractHash,
          proposalHash: contract.proposalHash,
          sourceDeclarationHash: contract.source.sourceDeclarationHash,
          sourceHandlerVersion: contract.source.handlerVersion,
          capabilityHandlerVersion: contract.compiled.handlerVersion,
        },
        lesson: {
          scenarioId,
          scenarioVersion: '1.1.0',
          profileId: expected.profileId,
          operation: expected.operation,
          boundArguments: expected.arguments,
          baselineStateHash: contract.intent.baseline.stateHash,
          allowedEffects: expected.effects,
          prohibitedEffects: contract.intent.prohibitedEffects,
        },
      });

      await expect(
        validateCapabilityPermitText(
          artifact.text,
          Date.parse('2026-09-01T12:00:04.000Z'),
        ),
      ).resolves.toMatchObject({
        summary: {
          lessonId: scenarioId,
          profileId: expected.profileId,
          operation: expected.operation,
          toolName: contract.compiled.toolName,
        },
      });

      const widened = structuredClone(envelope) as {
        payload: {
          lesson: { boundArguments: Record<string, unknown> };
        };
      };
      widened.payload.lesson.boundArguments.hidden_authority = true;
      await expect(
        validateCapabilityPermitText(
          JSON.stringify(await rehashPermit(widened)),
          Date.parse('2026-09-01T12:00:04.000Z'),
        ),
      ).rejects.toThrow();
    }
  });
});
