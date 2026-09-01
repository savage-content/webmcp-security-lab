import { z } from 'zod';

import {
  canonicalJson,
  sha256Hex,
  validateCapabilityEvidenceIntegrity,
} from './capability-negotiation';
import { scenarios } from './scenarios';
import { SELF_REPORTED_LIMITATION } from './constants';
import type { EvidenceReceipt, ScenarioId } from './types';

const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const trainingAccount = z.string().regex(/^TRAINING-[0-9]{4}$/);
const trainingParcel = z.string().regex(/^PKG-LAB-[0-9]{3}$/);

export const vulnerableArgumentSchemas = {
  'read-only-claim': z.object({ account_id: trainingAccount }).strict(),
  'over-broad-schema': z.looseObject({
    notice: z.string().min(1).max(280),
    target: z.string().max(120).optional(),
    instruction: z.string().max(500).optional(),
  }),
  'tool-result-injection': z.object({ tracking_id: trainingParcel }).strict(),
  'confirmation-mismatch': z.object({ desired_state: z.boolean() }).strict(),
  'client-discovery-variance': z
    .object({ client_label: z.string().min(1).max(200).optional() })
    .strict(),
} satisfies Record<ScenarioId, z.ZodType<Record<string, unknown>>>;

export const secureArgumentSchemas = {
  'read-only-claim': z.object({ account_id: trainingAccount }).strict(),
  'over-broad-schema': z.object({ notice: z.string().min(1).max(80) }).strict(),
  'tool-result-injection': z.object({ tracking_id: trainingParcel }).strict(),
  'confirmation-mismatch': z.object({ subscribed: z.boolean() }).strict(),
  'client-discovery-variance': z
    .object({ client_label: z.string().min(1).max(80) })
    .strict(),
} satisfies Record<ScenarioId, z.ZodType<Record<string, unknown>>>;

export function validateArguments(
  scenarioId: ScenarioId,
  argumentsValue: unknown,
  secure = false,
) {
  const schema = secure
    ? secureArgumentSchemas[scenarioId]
    : vulnerableArgumentSchemas[scenarioId];
  return schema.parse(argumentsValue) as Record<string, unknown>;
}

const scenarioIdSchema = z.enum([
  'read-only-claim',
  'over-broad-schema',
  'tool-result-injection',
  'confirmation-mismatch',
  'client-discovery-variance',
]);

export const evidenceReceiptSchema = z
  .object({
    id: z.uuid(),
    schemaVersion: z.literal('1.0'),
    sessionId: z.uuid(),
    scenario: z.object({
      id: scenarioIdSchema,
      version: z.string().min(1),
      title: z.string().min(1),
    }),
    timestamp: z.iso.datetime(),
    origin: z.string().min(1),
    browser: z.object({
      userAgent: z.string(),
      language: z.string(),
      platform: z.string(),
    }),
    client: z.object({
      label: z.string(),
      webMcp: z.object({
        api: z.literal('document.modelContext'),
        browserSupport: z
          .enum(['checking', 'supported', 'unsupported'])
          .default('supported'),
        registration: z.enum([
          'checking',
          'unsupported',
          'registering',
          'registered',
          'unregistered',
          'denied',
          'error',
        ]),
        permissionsPolicy: z.enum(['allowed', 'blocked', 'unknown']),
        discovery: z.enum([
          'not-checked',
          'unsupported',
          'discovered',
          'not-discovered',
          'error',
        ]),
        invocation: z
          .enum(['not-observed', 'observed'])
          .default('not-observed'),
        detail: z.string(),
        discoveredToolNames: z.array(z.string()),
      }),
    }),
    declaration: z.object({
      name: z.string().min(1).max(128),
      title: z.string(),
      description: z.string().min(1).max(500),
      inputSchema: z.record(z.string(), jsonValueSchema),
      annotations: z.object({
        readOnlyHint: z.boolean(),
        untrustedContentHint: z.boolean(),
      }),
    }),
    invocation: z.object({
      channel: z.enum([
        'webmcp',
        'webmcp-self-test',
        'negotiated-capability',
        'secure-retest',
        'lab-harness',
      ]),
      arguments: z.record(z.string().max(64), jsonValueSchema),
      confirmation: z.object({
        presentedCopy: z.string(),
        known: z.boolean(),
        approved: z.boolean().nullable(),
        source: z.enum([
          'lab-dialog',
          'browser-not-observable',
          'webmcp-self-test',
          'capability-contract',
          'builder-retest',
        ]),
      }),
    }),
    effective: z.object({
      before: z.record(z.string(), jsonValueSchema),
      after: z.record(z.string(), jsonValueSchema),
      rawResult: jsonValueSchema,
      sideEffects: z.array(z.string()),
    }),
    verdict: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
    debrief: z.string().min(1).max(1200),
    remediation: z.string().min(1).max(1200),
    limitation: z.string().default(SELF_REPORTED_LIMITATION),
    capability: z
      .object({
        protocol: z.literal('webmcp-capability-negotiation/1'),
        scope: z.literal('single-document-session'),
        receiptPersistence: z.literal('local-export-only'),
        proposal: z.object({
          input: z.object({
            account_id: z.literal('TRAINING-1042'),
            operation: z.literal('read-eligibility'),
            max_calls: z.literal(1),
            ttl_seconds: z.number().int().min(30).max(300),
            allowed_origin: z.string().min(1),
            baseline_state_hash: z.string().regex(/^[0-9a-f]{64}$/),
            prohibited_effects: z.tuple([
              z.literal('account-state-mutation'),
              z.literal('capability-handler-network-fetch'),
              z.literal('cross-account-access'),
            ]),
            expected_postcondition: z.literal('account-state-byte-identical'),
          }),
          proposalHash: z.string().regex(/^[0-9a-f]{64}$/),
          proposedAt: z.iso.datetime(),
          channel: z.enum(['webmcp', 'fallback-harness']),
          source: z.object({
            toolName: z.string().min(1).max(128),
            sourceDeclarationHash: z.string().regex(/^[0-9a-f]{64}$/),
            handlerVersion: z.string().min(1),
            origin: z.string().min(1),
          }),
        }),
        contract: z.object({
          protocol: z.literal('webmcp-capability-negotiation/1'),
          capabilityId: z.string().regex(/^cap_[0-9a-f]{24}$/),
          contractHash: z.string().regex(/^[0-9a-f]{64}$/),
          intent: z.object({
            accountId: z.literal('TRAINING-1042'),
            operation: z.literal('read-eligibility'),
            maxCalls: z.literal(1),
            ttlSeconds: z.number().int().min(30).max(300),
            allowedOrigin: z.string().min(1),
            requiredResult: z.object({
              accountId: z.literal('TRAINING-1042'),
              eligibility: z.literal('eligible'),
            }),
            baseline: z.object({
              stateHash: z.string().regex(/^[0-9a-f]{64}$/),
              reviewed: z.literal(false),
              reviewCount: z.literal(0),
              lastReviewedAt: z.null(),
            }),
            prohibitedEffects: z.tuple([
              z.literal('account-state-mutation'),
              z.literal('capability-handler-network-fetch'),
              z.literal('cross-account-access'),
            ]),
            expectedPostcondition: z.literal('account-state-byte-identical'),
            lockedAt: z.iso.datetime(),
          }),
          proposalHash: z.string().regex(/^[0-9a-f]{64}$/),
          source: z.object({
            toolName: z.string().min(1).max(128),
            sourceDeclarationHash: z.string().regex(/^[0-9a-f]{64}$/),
            handlerVersion: z.string().min(1),
            origin: z.string().min(1),
          }),
          approval: z.object({
            preparedAt: z.iso.datetime(),
            nonce: z.uuid(),
            copy: z.string().min(1),
          }),
          compiled: z.object({
            toolName: z.string().min(1).max(128),
            declaration: z.object({
              name: z.string().min(1).max(128),
              title: z.string(),
              description: z.string().min(1).max(500),
              inputSchema: z.record(z.string(), jsonValueSchema),
              annotations: z.object({
                readOnlyHint: z.boolean(),
                untrustedContentHint: z.boolean(),
              }),
            }),
            handlerVersion: z.string().min(1),
            compiledAt: z.iso.datetime(),
            expiresAt: z.iso.datetime(),
          }),
        }),
        approvalEvent: z.object({
          approvedAt: z.iso.datetime(),
          contractHash: z.string().regex(/^[0-9a-f]{64}$/),
        }),
        invocation: z.object({
          claimedAt: z.iso.datetime(),
          callNumber: z.literal(1),
        }),
        verification: z.object({
          passed: z.boolean(),
          baselineStateMatched: z.boolean(),
          observedStateHash: z.string().regex(/^[0-9a-f]{64}$/),
          requiredResultMatched: z.boolean(),
          stateByteIdentical: z.boolean(),
          controlledHandlerViolations: z.array(z.string()),
          checkedAt: z.iso.datetime(),
        }),
        invalidation: z.object({
          reason: z.enum([
            'consumed',
            'expired',
            'source-drift',
            'state-drift',
            'origin-drift',
            'handler-drift',
            'registration-failed',
          ]),
          at: z.iso.datetime(),
        }),
      })
      .optional(),
  })
  .superRefine((receipt, context) => {
    const negotiatedChannel =
      receipt.invocation.channel === 'negotiated-capability';
    const capabilityConfirmation =
      receipt.invocation.confirmation.source === 'capability-contract';
    const hasCapability = Boolean(receipt.capability);

    if (negotiatedChannel !== hasCapability) {
      context.addIssue({
        code: 'custom',
        path: ['capability'],
        message:
          'Negotiated-capability invocation and capability evidence must appear together.',
      });
    }
    if (capabilityConfirmation !== hasCapability) {
      context.addIssue({
        code: 'custom',
        path: ['invocation', 'confirmation', 'source'],
        message:
          'Capability-contract confirmation and capability evidence must appear together.',
      });
    }
    if (receipt.capability) {
      const capability = receipt.capability;
      const { contract, proposal, verification } = capability;
      const addCapabilityIssue = (path: (string | number)[], message: string) =>
        context.addIssue({
          code: 'custom',
          path: ['capability', ...path],
          message,
        });

      if (contract.contractHash !== capability.approvalEvent.contractHash) {
        addCapabilityIssue(
          ['approvalEvent', 'contractHash'],
          'The approval event must identify the exact compiled contract.',
        );
      }
      if (
        canonicalJson(receipt.declaration) !==
          canonicalJson(contract.compiled.declaration) ||
        Object.keys(receipt.invocation.arguments).length !== 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['invocation'],
          message:
            'A negotiated receipt must use the generated no-input declaration.',
        });
      }
      if (
        receipt.origin !== contract.intent.allowedOrigin ||
        receipt.verdict !== (verification.passed ? 'PASS' : 'FAIL')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['capability'],
          message: 'Capability origin or verification verdict does not match.',
        });
      }

      const expectedProposalInput = {
        account_id: contract.intent.accountId,
        operation: contract.intent.operation,
        max_calls: contract.intent.maxCalls,
        ttl_seconds: contract.intent.ttlSeconds,
        allowed_origin: contract.intent.allowedOrigin,
        prohibited_effects: contract.intent.prohibitedEffects,
        expected_postcondition: contract.intent.expectedPostcondition,
        baseline_state_hash: contract.intent.baseline.stateHash,
      };
      if (
        contract.proposalHash !== proposal.proposalHash ||
        canonicalJson(contract.source) !== canonicalJson(proposal.source) ||
        canonicalJson(proposal.input) !== canonicalJson(expectedProposalInput)
      ) {
        addCapabilityIssue(
          ['proposal'],
          'Proposal, source, intent, and contract references must agree.',
        );
      }

      const derivedPassed =
        verification.baselineStateMatched &&
        verification.requiredResultMatched &&
        verification.stateByteIdentical &&
        verification.controlledHandlerViolations.length === 0;
      if (verification.passed !== derivedPassed) {
        addCapabilityIssue(
          ['verification', 'passed'],
          'Verification verdict must equal its component checks.',
        );
      }

      const before = receipt.effective.before;
      const rawResult = receipt.effective.rawResult;
      const requiredResultMatches =
        Boolean(rawResult) &&
        typeof rawResult === 'object' &&
        !Array.isArray(rawResult) &&
        (rawResult as Record<string, unknown>).account_id ===
          contract.intent.requiredResult.accountId &&
        (rawResult as Record<string, unknown>).eligibility ===
          contract.intent.requiredResult.eligibility;
      const baselineFieldsMatch =
        before.accountId === contract.intent.accountId &&
        before.reviewed === contract.intent.baseline.reviewed &&
        before.reviewCount === contract.intent.baseline.reviewCount &&
        before.lastReviewedAt === contract.intent.baseline.lastReviewedAt;
      const baselineEvidenceMatches =
        verification.observedStateHash === contract.intent.baseline.stateHash &&
        baselineFieldsMatch;
      if (
        verification.requiredResultMatched !== requiredResultMatches ||
        verification.baselineStateMatched !== baselineEvidenceMatches ||
        verification.stateByteIdentical !==
          (canonicalJson(receipt.effective.before) ===
            canonicalJson(receipt.effective.after)) ||
        receipt.effective.sideEffects.length !== 0
      ) {
        addCapabilityIssue(
          ['verification'],
          'Verification claims must match the linked result and snapshots.',
        );
      }

      if (
        receipt.invocation.confirmation.presentedCopy !==
          contract.approval.copy ||
        receipt.invocation.confirmation.known !== true ||
        receipt.invocation.confirmation.approved !== true
      ) {
        context.addIssue({
          code: 'custom',
          path: ['invocation', 'confirmation'],
          message: 'Receipt must contain the exact approved contract copy.',
        });
      }

      const lockedAt = Date.parse(contract.intent.lockedAt);
      const proposedAt = Date.parse(proposal.proposedAt);
      const preparedAt = Date.parse(contract.approval.preparedAt);
      const approvedAt = Date.parse(capability.approvalEvent.approvedAt);
      const claimedAt = Date.parse(capability.invocation.claimedAt);
      const checkedAt = Date.parse(verification.checkedAt);
      const invalidatedAt = Date.parse(capability.invalidation.at);
      const expiresAt = Date.parse(contract.compiled.expiresAt);
      const expectedExpiresAt = preparedAt + contract.intent.ttlSeconds * 1_000;
      if (
        contract.compiled.compiledAt !== contract.approval.preparedAt ||
        !(
          lockedAt <= proposedAt &&
          proposedAt <= preparedAt &&
          preparedAt <= approvedAt &&
          approvedAt <= claimedAt &&
          claimedAt === checkedAt &&
          claimedAt < expiresAt &&
          claimedAt <= invalidatedAt &&
          expiresAt === expectedExpiresAt
        ) ||
        receipt.timestamp !== capability.invocation.claimedAt
      ) {
        addCapabilityIssue(
          ['invocation'],
          'Capability lifecycle timestamps are contradictory.',
        );
      }

      if (
        (verification.passed &&
          capability.invalidation.reason !== 'consumed') ||
        (!verification.passed &&
          capability.invalidation.reason !== 'state-drift')
      ) {
        addCapabilityIssue(
          ['invalidation', 'reason'],
          'Result invalidation reason must match verification outcome.',
        );
      }

      if (
        receipt.scenario.id !== 'read-only-claim' ||
        receipt.client.webMcp.registration !== 'unregistered' ||
        receipt.client.webMcp.invocation !== 'observed'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['client', 'webMcp'],
          message:
            'Negotiated evidence must record the Scenario 1 tool as invoked and unregistered.',
        });
      }
    }
  });

export function parseEvidenceReceipt(value: unknown): EvidenceReceipt {
  return evidenceReceiptSchema.parse(value) as EvidenceReceipt;
}

export async function parseCapabilityEvidenceReceipt(
  value: unknown,
): Promise<EvidenceReceipt> {
  const receipt = parseEvidenceReceipt(value);
  if (!receipt.capability) {
    throw new Error('Capability evidence is required.');
  }

  await validateCapabilityEvidenceIntegrity(receipt.capability);
  const beforeHash = await sha256Hex(receipt.effective.before);
  const afterHash = await sha256Hex(receipt.effective.after);
  if (receipt.capability.verification.observedStateHash !== beforeHash) {
    throw new Error(
      'Observed state hash does not match the linked before state.',
    );
  }
  if (
    receipt.capability.verification.stateByteIdentical !==
    (beforeHash === afterHash &&
      canonicalJson(receipt.effective.before) ===
        canonicalJson(receipt.effective.after))
  ) {
    throw new Error(
      'State identity claim does not match the linked snapshots.',
    );
  }

  return receipt;
}

export function assertDurableEvidenceReceipt(receipt: EvidenceReceipt) {
  if (
    receipt.capability ||
    receipt.invocation.channel === 'negotiated-capability' ||
    receipt.invocation.confirmation.source === 'capability-contract'
  ) {
    throw new Error(
      'Negotiated-capability receipts are local-export-only and cannot be persisted as ordinary evidence.',
    );
  }
  return receipt;
}

export function validateScenarioCatalog() {
  const ids = new Set<string>();

  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) {
      throw new Error(`Duplicate scenario id: ${scenario.id}`);
    }
    ids.add(scenario.id);

    for (const declaration of [scenario.tool, scenario.secureTool]) {
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(declaration.name)) {
        throw new Error(`Invalid WebMCP tool name: ${declaration.name}`);
      }
      if (declaration.inputSchema.type !== 'object') {
        throw new Error(
          `Tool ${declaration.name} must use an object input schema.`,
        );
      }
    }

    validateArguments(scenario.id, scenario.defaultArguments);
    validateArguments(scenario.id, scenario.secureDefaultArguments, true);
  }

  if (ids.size !== 5) {
    throw new Error(`Expected five scenarios, found ${ids.size}.`);
  }

  return true;
}
