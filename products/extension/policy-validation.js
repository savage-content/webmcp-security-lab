import {
  CLOSED_EMPTY_INPUT_SCHEMA,
  exactBoundArguments,
  exactEmptyArguments,
  lessonPolicyForToolName,
} from './lesson-policy.js';
import { isPlainRecord } from './validation.js';

export const CAPABILITY_PERMIT_STORAGE_KEY = 'leftoutCapabilityPermitV1:active';
export const CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY =
  'leftoutCapabilityPermitV1:consumedDigests';
export const CAPABILITY_PERMIT_ENVELOPE_SCHEMA =
  'leftout.webmcp-capability-permit-envelope/1';
export const CAPABILITY_PERMIT_SCHEMA_V1 = 'leftout.webmcp-capability-permit/1';
export const CAPABILITY_PERMIT_SCHEMA_V2 = 'leftout.webmcp-capability-permit/2';
export const CAPABILITY_PERMIT_SCHEMA = CAPABILITY_PERMIT_SCHEMA_V1;
export const MAX_CAPABILITY_PERMIT_BYTES = 65_536;
export const MAX_CAPABILITY_PERMIT_LIFETIME_MS = 5 * 60_000;
export const CAPABILITY_PERMIT_CLOCK_SKEW_MS = 60_000;

const PERMIT_ID_PATTERN = /^cap_[0-9a-f]{24}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).toSorted();
  return (
    actual.length === expected.length &&
    expected.toSorted().every((key, index) => actual[index] === key)
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

async function sha256Canonical(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function exactClosedEmptySchema(value) {
  return canonicalJson(value) === canonicalJson(CLOSED_EMPTY_INPUT_SCHEMA);
}

function assertLessonBinding(value, policy) {
  if (
    !hasExactKeys(value, [
      'allowedEffects',
      'baselineStateHash',
      'boundArguments',
      'operation',
      'profileId',
      'prohibitedEffects',
      'scenarioId',
      'scenarioVersion',
    ]) ||
    value.scenarioId !== policy.lessonId ||
    value.scenarioVersion !== policy.scenarioVersion ||
    value.profileId !== policy.profileId ||
    value.operation !== policy.operation ||
    !exactBoundArguments(policy, value.boundArguments) ||
    typeof value.baselineStateHash !== 'string' ||
    !SHA256_PATTERN.test(value.baselineStateHash) ||
    canonicalJson(value.allowedEffects) !==
      canonicalJson(policy.allowedEffects) ||
    canonicalJson(value.prohibitedEffects) !==
      canonicalJson(policy.prohibitedEffects)
  ) {
    throw new Error(
      'The capability permit lesson binding widens or changes the built-in policy.',
    );
  }
}

function normalizedScope(value) {
  if (
    !hasExactKeys(value, ['origin', 'pageUrl']) ||
    typeof value.origin !== 'string' ||
    typeof value.pageUrl !== 'string'
  ) {
    throw new Error('The capability permit scope is invalid.');
  }
  const origin = new URL(value.origin);
  const page = new URL(value.pageUrl);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.origin !== value.origin ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    page.origin !== origin.origin ||
    page.username ||
    page.password ||
    page.search ||
    page.hash ||
    page.toString() !== value.pageUrl
  ) {
    throw new Error(
      'The capability permit scope must bind one exact HTTP(S) page.',
    );
  }
  return { origin: origin.origin, pageUrl: page.toString() };
}

function assertPermitShape(envelope, nowMs) {
  if (
    !hasExactKeys(envelope, ['integrity', 'payload', 'schemaVersion']) ||
    envelope.schemaVersion !== CAPABILITY_PERMIT_ENVELOPE_SCHEMA ||
    !hasExactKeys(envelope.integrity, ['algorithm', 'contentSha256']) ||
    envelope.integrity.algorithm !== 'SHA-256' ||
    typeof envelope.integrity.contentSha256 !== 'string' ||
    !SHA256_PATTERN.test(envelope.integrity.contentSha256)
  ) {
    throw new Error('The capability permit envelope is invalid.');
  }

  const payload = envelope.payload;
  if (
    !isPlainRecord(payload) ||
    ![CAPABILITY_PERMIT_SCHEMA_V1, CAPABILITY_PERMIT_SCHEMA_V2].includes(
      payload.schemaVersion,
    ) ||
    typeof payload.permitId !== 'string' ||
    !PERMIT_ID_PATTERN.test(payload.permitId)
  ) {
    throw new Error('The capability permit payload is invalid.');
  }

  const payloadKeys = [
    'binding',
    'capability',
    'expiresAt',
    'issuedAt',
    'permitId',
    'safety',
    'schemaVersion',
    'scope',
  ];
  if (
    !hasExactKeys(
      payload,
      payload.schemaVersion === CAPABILITY_PERMIT_SCHEMA_V2
        ? [...payloadKeys, 'lesson']
        : payloadKeys,
    )
  ) {
    throw new Error('The capability permit payload is invalid.');
  }

  if (
    typeof payload.issuedAt !== 'string' ||
    typeof payload.expiresAt !== 'string'
  ) {
    throw new Error(
      'The capability permit is expired or has an invalid lifetime.',
    );
  }
  const issuedAtMs = Date.parse(payload.issuedAt);
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > MAX_CAPABILITY_PERMIT_LIFETIME_MS ||
    expiresAtMs <= nowMs ||
    issuedAtMs > nowMs + CAPABILITY_PERMIT_CLOCK_SKEW_MS ||
    expiresAtMs >
      nowMs +
        MAX_CAPABILITY_PERMIT_LIFETIME_MS +
        CAPABILITY_PERMIT_CLOCK_SKEW_MS
  ) {
    throw new Error(
      'The capability permit is expired or has an invalid lifetime.',
    );
  }

  const scope = normalizedScope(payload.scope);
  const capability = payload.capability;
  const policy = lessonPolicyForToolName(capability?.toolName);
  if (
    !hasExactKeys(capability, [
      'annotations',
      'arguments',
      'description',
      'inputSchema',
      'maxUses',
      'title',
      'toolName',
    ]) ||
    !policy ||
    payload.permitId.slice(4, 20) !== capability.toolName.slice(-16) ||
    capability.title !== policy.title ||
    capability.description !== policy.description(payload.expiresAt) ||
    !exactEmptyArguments(capability.arguments) ||
    !exactClosedEmptySchema(capability.inputSchema) ||
    !hasExactKeys(capability.annotations, [
      'readOnlyHint',
      'untrustedContentHint',
    ]) ||
    capability.annotations.readOnlyHint !== policy.annotations.readOnlyHint ||
    capability.annotations.untrustedContentHint !==
      policy.annotations.untrustedContentHint ||
    capability.maxUses !== 1
  ) {
    throw new Error(
      'The capability permit does not describe an exact built-in no-input lesson action.',
    );
  }

  if (policy.lessonNumber === 1) {
    if (payload.schemaVersion !== CAPABILITY_PERMIT_SCHEMA_V1) {
      throw new Error('Scenario 1 requires the legacy permit profile.');
    }
  } else {
    if (payload.schemaVersion !== CAPABILITY_PERMIT_SCHEMA_V2) {
      throw new Error(
        'This lesson requires an exact version 2 capability permit.',
      );
    }
    assertLessonBinding(payload.lesson, policy);
  }

  const binding = payload.binding;
  if (
    !hasExactKeys(binding, [
      'capabilityHandlerVersion',
      'contractHash',
      'proposalHash',
      'sourceDeclarationHash',
      'sourceHandlerVersion',
    ]) ||
    !SHA256_PATTERN.test(binding.contractHash) ||
    !SHA256_PATTERN.test(binding.proposalHash) ||
    !SHA256_PATTERN.test(binding.sourceDeclarationHash) ||
    binding.sourceHandlerVersion !== policy.sourceHandlerVersion ||
    binding.capabilityHandlerVersion !== policy.capabilityHandlerVersion
  ) {
    throw new Error('The capability permit contract binding is invalid.');
  }

  if (
    !hasExactKeys(payload.safety, [
      'grantsNewAuthority',
      'importsDoNotInvoke',
      'limitation',
    ]) ||
    payload.safety.grantsNewAuthority !== false ||
    payload.safety.importsDoNotInvoke !== true ||
    payload.safety.limitation !== policy.safetyLimitation
  ) {
    throw new Error('The capability permit safety boundary is invalid.');
  }
  return { payload, scope, policy };
}

export async function validateCapabilityPermitText(text, nowMs = Date.now()) {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > MAX_CAPABILITY_PERMIT_BYTES
  ) {
    throw new Error(
      'The capability permit file is missing or larger than 64 KiB.',
    );
  }
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error('The capability permit is not valid JSON.');
  }
  const { payload, scope, policy } = assertPermitShape(envelope, nowMs);
  const digest = await sha256Canonical({
    schemaVersion: envelope.schemaVersion,
    payload,
  });
  if (digest !== envelope.integrity.contentSha256) {
    throw new Error('The capability permit integrity hash does not match.');
  }
  return {
    envelope: structuredClone(envelope),
    digest,
    summary: {
      permitId: payload.permitId,
      lessonId: policy.lessonId,
      lessonNumber: policy.lessonNumber,
      actionLabel: policy.actionLabel,
      profileId: policy.profileId,
      operation: policy.operation,
      origin: scope.origin,
      pageUrl: scope.pageUrl,
      toolName: payload.capability.toolName,
      expiresAt: payload.expiresAt,
      contractHash: payload.binding.contractHash,
      integrity: 'self-hash-only',
    },
  };
}

export function assertCapabilityPermitMatch(
  stored,
  context,
  nowMs = Date.now(),
) {
  if (
    !isPlainRecord(stored) ||
    !isPlainRecord(stored.envelope) ||
    typeof stored.digest !== 'string' ||
    !SHA256_PATTERN.test(stored.digest) ||
    stored.consumedAt !== null
  ) {
    throw new Error('No unused capability permit is imported.');
  }
  const { payload, scope } = assertPermitShape(stored.envelope, nowMs);
  if (
    stored.envelope.integrity.contentSha256 !== stored.digest ||
    scope.origin !== context.origin ||
    scope.pageUrl !== context.pageUrl ||
    payload.capability.toolName !== context.toolName ||
    payload.capability.title !== context.title ||
    payload.capability.description !== context.description ||
    canonicalJson(payload.capability.arguments) !==
      canonicalJson(context.arguments ?? {}) ||
    canonicalJson(payload.capability.inputSchema) !==
      canonicalJson(context.inputSchema) ||
    canonicalJson(payload.capability.annotations) !==
      canonicalJson(context.annotations)
  ) {
    throw new Error(
      'The imported capability permit does not match this page and declaration.',
    );
  }
  return { payload, digest: stored.digest };
}

export async function verifyStoredCapabilityPermit(
  stored,
  context,
  nowMs = Date.now(),
) {
  const match = assertCapabilityPermitMatch(stored, context, nowMs);
  const digest = await sha256Canonical({
    schemaVersion: stored.envelope.schemaVersion,
    payload: stored.envelope.payload,
  });
  if (digest !== stored.digest) {
    throw new Error(
      'The stored capability permit integrity hash does not match.',
    );
  }
  return match;
}

export function publicCapabilityPermitStatus(stored) {
  if (!isPlainRecord(stored) || !isPlainRecord(stored.envelope)) {
    return { imported: false };
  }
  const payload = stored.envelope.payload;
  if (
    !isPlainRecord(payload) ||
    !isPlainRecord(payload.capability) ||
    !isPlainRecord(payload.scope) ||
    !isPlainRecord(payload.binding) ||
    typeof payload.scope.origin !== 'string' ||
    typeof payload.binding.contractHash !== 'string'
  ) {
    return { imported: false };
  }
  const policy = lessonPolicyForToolName(payload.capability.toolName);
  if (!policy) return { imported: false };
  return {
    imported: true,
    permitId: payload.permitId,
    lessonId: policy.lessonId,
    lessonNumber: policy.lessonNumber,
    actionLabel: policy.actionLabel,
    profileId: policy.profileId,
    operation: policy.operation,
    origin: payload.scope.origin,
    toolName: payload.capability.toolName,
    expiresAt: payload.expiresAt,
    contractHash: payload.binding.contractHash,
    digest: stored.digest,
    consumedAt: stored.consumedAt,
  };
}
