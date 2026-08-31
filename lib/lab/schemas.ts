import { z } from 'zod';

import { scenarios } from './scenarios';
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
  'read-only-claim': z
    .object({ account_id: trainingAccount })
    .strict(),
  'over-broad-schema': z.looseObject({
      notice: z.string().min(1).max(280),
      target: z.string().max(120).optional(),
      instruction: z.string().max(500).optional(),
    }),
  'tool-result-injection': z
    .object({ tracking_id: trainingParcel })
    .strict(),
  'confirmation-mismatch': z
    .object({ desired_state: z.boolean() })
    .strict(),
  'client-discovery-variance': z
    .object({ client_label: z.string().min(1).max(200).optional() })
    .strict(),
} satisfies Record<ScenarioId, z.ZodType<Record<string, unknown>>>;

export const secureArgumentSchemas = {
  'read-only-claim': z
    .object({ account_id: trainingAccount })
    .strict(),
  'over-broad-schema': z
    .object({ notice: z.string().min(1).max(80) })
    .strict(),
  'tool-result-injection': z
    .object({ tracking_id: trainingParcel })
    .strict(),
  'confirmation-mismatch': z
    .object({ subscribed: z.boolean() })
    .strict(),
  'client-discovery-variance': z
    .object({ client_label: z.string().min(1).max(80), discovered: z.boolean() })
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

export const evidenceReceiptSchema = z.object({
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
      registration: z.enum([
        'checking',
        'unsupported',
        'registering',
        'registered',
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
    channel: z.enum(['webmcp', 'webmcp-self-test', 'lab-harness']),
    arguments: z.record(z.string().max(64), jsonValueSchema),
    confirmation: z.object({
      presentedCopy: z.string(),
      known: z.boolean(),
      approved: z.boolean().nullable(),
      source: z.enum([
        'lab-dialog',
        'browser-not-observable',
        'webmcp-self-test',
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
});

export function parseEvidenceReceipt(value: unknown): EvidenceReceipt {
  return evidenceReceiptSchema.parse(value) as EvidenceReceipt;
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
        throw new Error(`Tool ${declaration.name} must use an object input schema.`);
      }
    }

    validateArguments(scenario.id, scenario.defaultArguments);
  }

  if (ids.size !== 5) {
    throw new Error(`Expected five scenarios, found ${ids.size}.`);
  }

  return true;
}
