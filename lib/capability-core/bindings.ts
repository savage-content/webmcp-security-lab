import {
  hashBaselineState,
  hashSourceBinding,
  hashToolSchema,
  sha256Hex,
} from './canonical';
import type {
  CapabilityBindingExpectations,
  CapabilityBindingObservation,
  CapabilityBindingResult,
  CapabilityToolContract,
  HashValue,
} from './types';

function timestamp(value: string | number) {
  return typeof value === 'number' ? value : Date.parse(value);
}

export function checkCapabilityBindings(
  expected: CapabilityBindingExpectations,
  observed: CapabilityBindingObservation,
): CapabilityBindingResult {
  if (observed.callsClaimed >= expected.maxCalls) {
    return { ok: false, reason: 'consumed' };
  }
  const observedAt = timestamp(observed.now);
  const expiresAt = Date.parse(expected.expiresAt);
  if (
    !Number.isFinite(observedAt) ||
    !Number.isFinite(expiresAt) ||
    observedAt >= expiresAt
  ) {
    return { ok: false, reason: 'expired' };
  }
  if (observed.origin !== expected.origin) {
    return { ok: false, reason: 'origin-drift' };
  }
  if (observed.handlerVersion !== expected.handlerVersion) {
    return { ok: false, reason: 'handler-drift' };
  }
  if (
    expected.schemaHash !== undefined &&
    observed.schemaHash !== expected.schemaHash
  ) {
    return { ok: false, reason: 'schema-drift' };
  }
  if (observed.sourceHash !== expected.sourceHash) {
    return { ok: false, reason: 'source-drift' };
  }
  if (
    expected.baselineHash !== undefined &&
    observed.baselineHash !== expected.baselineHash
  ) {
    return { ok: false, reason: 'baseline-drift' };
  }
  return { ok: true };
}

export async function observeCapabilityBindings({
  tool,
  handlerVersion,
  origin,
  baseline,
  callsClaimed,
  now,
  hash = sha256Hex,
}: {
  tool: CapabilityToolContract;
  handlerVersion: string;
  origin: string;
  baseline?: unknown;
  callsClaimed: number;
  now: string | number;
  hash?: HashValue;
}): Promise<CapabilityBindingObservation> {
  const [sourceHash, schemaHash, baselineHash] = await Promise.all([
    hashSourceBinding({ tool, handlerVersion, origin, hash }),
    hashToolSchema(tool.inputSchema, hash),
    baseline === undefined
      ? Promise.resolve(undefined)
      : hashBaselineState(baseline, hash),
  ]);
  return {
    callsClaimed,
    now,
    origin,
    handlerVersion,
    sourceHash,
    schemaHash,
    ...(baselineHash === undefined ? {} : { baselineHash }),
  };
}
