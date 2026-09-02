import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../lib/capability-core';
import { createCapabilityPermitArtifact } from '../lib/lab/artifacts';
import {
  compileLessonCapabilityContract,
  createLessonBoundArguments,
  createLessonIntent,
  createLessonProposalRecord,
} from '../lib/lab/lesson-capabilities';
import { scenarioById } from '../lib/lab/scenarios';
import { LESSON_CAPABILITY_POLICIES } from '../products/extension/lesson-policy.js';
import {
  canonicalJson,
  CAPABILITY_PERMIT_SCHEMA_V2,
  MAX_CAPABILITY_PERMIT_LIFETIME_MS,
  publicCapabilityPermitStatus,
  validateCapabilityPermitText,
  verifyStoredCapabilityPermit,
} from '../products/extension/policy-validation.js';
import { validCapabilityReceipt } from './fixtures/capability-receipt';

const APPROVED_AT = '2026-09-01T12:00:03.000Z';
const VALIDATION_TIME = Date.parse('2026-09-01T12:00:04.000Z');

async function permitFixture() {
  const receipt = await validCapabilityReceipt();
  const contract = receipt.capability?.contract;
  if (!contract || contract.protocol !== 'webmcp-capability-negotiation/1') {
    throw new Error('Expected a Scenario 1 negotiated capability contract.');
  }
  const artifact = await createCapabilityPermitArtifact(
    contract,
    APPROVED_AT,
    'http://localhost:3000/',
  );
  const validated = await validateCapabilityPermitText(
    artifact.text,
    VALIDATION_TIME,
  );
  const stored = {
    schemaVersion: 'leftout.extension-capability-permit/1',
    envelope: validated.envelope,
    digest: validated.digest,
    importedAt: APPROVED_AT,
    consumedAt: null,
    consumedDocumentId: null,
  };
  return { artifact, contract, stored, validated };
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
      canonicalJson({
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

async function lessonPermitFixture(
  policy: (typeof LESSON_CAPABILITY_POLICIES)[number],
) {
  const suffix = `${policy.lessonNumber}`.padStart(16, '0');
  const issuedAt = APPROVED_AT;
  const expiresAt = new Date(Date.parse(issuedAt) + 120_000).toISOString();
  const boundArguments =
    policy.lessonId === 'over-broad-schema'
      ? { notice: 'Security review in progress' }
      : policy.lessonId === 'tool-result-injection'
        ? { tracking_id: 'PKG-LAB-204' }
        : policy.lessonId === 'confirmation-mismatch'
          ? { subscribed: false }
          : policy.lessonId === 'client-discovery-variance'
            ? { client_label: 'Codex in-app browser' }
            : undefined;
  const payload = {
    schemaVersion:
      policy.lessonNumber === 1
        ? 'leftout.webmcp-capability-permit/1'
        : CAPABILITY_PERMIT_SCHEMA_V2,
    permitId: `cap_${suffix}deadbeef`,
    issuedAt,
    expiresAt,
    scope: {
      origin: 'http://localhost:3000',
      pageUrl: 'http://localhost:3000/',
    },
    capability: {
      toolName: `${policy.toolPrefix}${suffix}`,
      title: policy.title,
      description: policy.description(expiresAt),
      arguments: {},
      inputSchema: policy.inputSchema,
      annotations: policy.annotations,
      maxUses: 1,
    },
    binding: {
      contractHash: '1'.repeat(64),
      proposalHash: '2'.repeat(64),
      sourceDeclarationHash: '3'.repeat(64),
      sourceHandlerVersion: policy.sourceHandlerVersion,
      capabilityHandlerVersion: policy.capabilityHandlerVersion,
    },
    safety: {
      grantsNewAuthority: false,
      importsDoNotInvoke: true,
      limitation: policy.safetyLimitation,
    },
    ...(policy.lessonNumber === 1
      ? {}
      : {
          lesson: {
            scenarioId: policy.lessonId,
            scenarioVersion: policy.scenarioVersion,
            profileId: policy.profileId,
            operation: policy.operation,
            boundArguments,
            baselineStateHash: '4'.repeat(64),
            allowedEffects: policy.allowedEffects,
            prohibitedEffects: policy.prohibitedEffects,
          },
        }),
  };
  const envelope = await rehashPermit({
    schemaVersion: 'leftout.webmcp-capability-permit-envelope/1',
    payload,
    integrity: { algorithm: 'SHA-256', contentSha256: '0'.repeat(64) },
  });
  return { envelope, payload };
}

describe('extension capability permit boundary', () => {
  it('accepts the exact permit emitted by the approved learning-page contract', async () => {
    expect(MAX_CAPABILITY_PERMIT_LIFETIME_MS).toBe(5 * 60_000);
    const { contract, stored, validated } = await permitFixture();
    expect(validated.summary).toMatchObject({
      origin: 'http://localhost:3000',
      pageUrl: 'http://localhost:3000/',
      toolName: contract.compiled.toolName,
      contractHash: contract.contractHash,
      integrity: 'self-hash-only',
    });
    await expect(
      verifyStoredCapabilityPermit(
        stored,
        {
          origin: 'http://localhost:3000',
          pageUrl: 'http://localhost:3000/',
          toolName: contract.compiled.toolName,
          title: contract.compiled.declaration.title,
          description: contract.compiled.declaration.description,
          inputSchema: contract.compiled.declaration.inputSchema,
          annotations: contract.compiled.declaration.annotations,
        },
        VALIDATION_TIME,
      ),
    ).resolves.toMatchObject({ digest: validated.digest });
  });

  it('fails closed for tampering, unknown fields, expiry, and consumed permits', async () => {
    const { artifact, contract, stored } = await permitFixture();
    const tampered = JSON.parse(artifact.text) as {
      payload: { scope: { pageUrl: string } };
    };
    tampered.payload.scope.pageUrl = 'http://localhost:3000/other';
    await expect(
      validateCapabilityPermitText(JSON.stringify(tampered), VALIDATION_TIME),
    ).rejects.toThrow('integrity hash');

    const extended = JSON.parse(artifact.text) as { hiddenAuthority?: boolean };
    extended.hiddenAuthority = true;
    await expect(
      validateCapabilityPermitText(JSON.stringify(extended), VALIDATION_TIME),
    ).rejects.toThrow('envelope is invalid');

    await expect(
      validateCapabilityPermitText(
        artifact.text,
        Date.parse(contract.compiled.expiresAt) + 1,
      ),
    ).rejects.toThrow('expired');

    const futureDated = JSON.parse(artifact.text) as {
      payload: { issuedAt: string; expiresAt: string };
    };
    futureDated.payload.issuedAt = '2099-01-01T00:00:00.000Z';
    futureDated.payload.expiresAt = '2099-01-01T00:05:00.000Z';
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(futureDated),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('invalid lifetime');

    await expect(
      verifyStoredCapabilityPermit(
        { ...stored, consumedAt: APPROVED_AT },
        {
          origin: 'http://localhost:3000',
          pageUrl: 'http://localhost:3000/',
          toolName: contract.compiled.toolName,
          title: contract.compiled.declaration.title,
          description: contract.compiled.declaration.description,
          inputSchema: contract.compiled.declaration.inputSchema,
          annotations: contract.compiled.declaration.annotations,
        },
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('No unused capability permit');
  });

  it('rejects self-hashed attempts to change the fixed lesson identity or handler versions', async () => {
    const { artifact } = await permitFixture();
    const changedTitle = JSON.parse(artifact.text) as {
      payload: { capability: { title: string } };
    };
    changedTitle.payload.capability.title = 'Harmless sounding read';
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedTitle)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('exact built-in no-input lesson action');

    const changedIdentity = JSON.parse(artifact.text) as {
      payload: { permitId: string };
    };
    changedIdentity.payload.permitId = 'cap_ffffffffffffffffffffffff';
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedIdentity)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('exact built-in no-input lesson action');

    const changedHandler = JSON.parse(artifact.text) as {
      payload: { binding: { capabilityHandlerVersion: string } };
    };
    changedHandler.payload.binding.capabilityHandlerVersion =
      'scenario-one-read-handler/9.9.9';
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedHandler)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('contract binding is invalid');
  });

  it('accepts exactly one generated zero-input policy for every synthetic lesson', async () => {
    expect(
      LESSON_CAPABILITY_POLICIES.map((policy) => ({
        lessonId: policy.lessonId,
        source: policy.sourceHandlerVersion,
        capability: policy.capabilityHandlerVersion,
      })),
    ).toEqual([
      {
        lessonId: 'read-only-claim',
        source: 'scenario-one-source-handler/1.1.0',
        capability: 'scenario-one-read-handler/1.1.0',
      },
      {
        lessonId: 'over-broad-schema',
        source: 'scenario-two-source-handler/1.1.0',
        capability: 'scenario-two-profile-notice-handler/1.1.0',
      },
      {
        lessonId: 'tool-result-injection',
        source: 'scenario-three-source-handler/1.1.0',
        capability: 'scenario-three-delivery-status-handler/1.1.0',
      },
      {
        lessonId: 'confirmation-mismatch',
        source: 'scenario-four-source-handler/1.1.0',
        capability: 'scenario-four-digest-handler/1.1.0',
      },
      {
        lessonId: 'client-discovery-variance',
        source: 'scenario-five-source-handler/1.1.0',
        capability: 'scenario-five-observation-handler/1.1.0',
      },
    ]);

    for (const policy of LESSON_CAPABILITY_POLICIES) {
      const fixture = await lessonPermitFixture(policy);
      const validated = await validateCapabilityPermitText(
        JSON.stringify(fixture.envelope),
        VALIDATION_TIME,
      );
      expect(validated.summary).toMatchObject({
        lessonId: policy.lessonId,
        lessonNumber: policy.lessonNumber,
        actionLabel: policy.actionLabel,
        toolName: fixture.payload.capability.toolName,
      });
    }
  });

  it('accepts the exact version 2 artifacts emitted by each guided lesson', async () => {
    const scenarioIds = [
      'over-broad-schema',
      'tool-result-injection',
      'confirmation-mismatch',
      'client-discovery-variance',
    ] as const;

    for (const scenarioId of scenarioIds) {
      const scenario = scenarioById[scenarioId];
      const intent = createLessonIntent({
        scenarioId,
        boundArguments: createLessonBoundArguments(
          scenarioId,
          'Codex in-app browser',
        ),
        origin: 'http://localhost:3000',
        baselineStateHash: await sha256Hex(scenario.initialState),
        lockedAt: '2026-09-01T12:00:00.000Z',
        ttlSeconds: 120,
      });
      const proposal = await createLessonProposalRecord({
        intent,
        sourceTool: scenario.tool,
        proposedAt: '2026-09-01T12:00:01.000Z',
      });
      const contract = await compileLessonCapabilityContract({
        intent,
        proposal,
        preparedAt: '2026-09-01T12:00:02.000Z',
        approvalNonce: 'c152cf41-e3d7-4528-9e29-12110dd79278',
      });
      const artifact = await createCapabilityPermitArtifact(
        contract,
        APPROVED_AT,
        'http://localhost:3000/',
      );

      await expect(
        validateCapabilityPermitText(artifact.text, VALIDATION_TIME),
      ).resolves.toMatchObject({
        summary: {
          lessonId: scenarioId,
          profileId: contract.intent.profileId,
          operation: contract.intent.operation,
          toolName: contract.compiled.toolName,
        },
      });
    }
  });

  it('rejects a self-hashed cross-lesson declaration or version substitution', async () => {
    const policy = LESSON_CAPABILITY_POLICIES[2];
    const fixture = await lessonPermitFixture(policy);
    const changedAnnotations = structuredClone(fixture.envelope) as {
      payload: {
        capability: {
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        };
      };
    };
    changedAnnotations.payload.capability.annotations.untrustedContentHint = false;
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedAnnotations)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('exact built-in no-input lesson action');

    const changedVersion = structuredClone(fixture.envelope) as {
      payload: { binding: { capabilityHandlerVersion: string } };
    };
    changedVersion.payload.binding.capabilityHandlerVersion =
      'scenario-four-digest-handler/1.1.0';
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedVersion)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('contract binding is invalid');
  });

  it('requires exact version 2 lesson bindings for lessons 2 through 5', async () => {
    const fixture = await lessonPermitFixture(LESSON_CAPABILITY_POLICIES[1]);

    const downgraded = structuredClone(fixture.envelope) as {
      payload: { lesson?: unknown; schemaVersion: string };
    };
    downgraded.payload.schemaVersion = 'leftout.webmcp-capability-permit/1';
    delete downgraded.payload.lesson;
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(downgraded)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('requires an exact version 2');

    const missingLesson = structuredClone(fixture.envelope) as {
      payload: { lesson?: unknown; schemaVersion: string };
    };
    delete missingLesson.payload.lesson;
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(missingLesson)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('payload is invalid');

    const changedBoundArguments = structuredClone(fixture.envelope) as {
      payload: { lesson: { boundArguments: Record<string, unknown> } };
    };
    changedBoundArguments.payload.lesson.boundArguments = {
      notice: 'Security review in progress',
      target: 'account-metadata',
    };
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedBoundArguments)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('lesson binding');

    const changedEffects = structuredClone(fixture.envelope) as {
      payload: { lesson: { allowedEffects: string[] } };
    };
    changedEffects.payload.lesson.allowedEffects = [
      'profile-notice-replaced',
      'agent-approval-change',
    ];
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(changedEffects)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('lesson binding');

    const unknownLessonField = structuredClone(fixture.envelope) as {
      payload: { lesson: Record<string, unknown> };
    };
    unknownLessonField.payload.lesson.hiddenAuthority = true;
    await expect(
      validateCapabilityPermitText(
        JSON.stringify(await rehashPermit(unknownLessonField)),
        VALIDATION_TIME,
      ),
    ).rejects.toThrow('lesson binding');
  });

  it('publishes only bounded status fields and never the permit envelope', async () => {
    const { contract, stored, validated } = await permitFixture();
    const status = publicCapabilityPermitStatus(stored);
    expect(status).toMatchObject({
      imported: true,
      origin: 'http://localhost:3000',
      contractHash: contract.contractHash,
      digest: validated.digest,
      consumedAt: null,
    });
    expect(status).not.toHaveProperty('envelope');
    expect(status).not.toHaveProperty('binding');
  });
});
