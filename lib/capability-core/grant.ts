import { hashCapabilityContract, sha256Hex } from './canonical';
import type { HashValue, IssuedCapabilityGrant } from './types';

export interface GrantIdentity {
  capabilityId: string;
  toolName: string;
}

export interface GrantIssueDependencies {
  wallNow?: () => number;
  nonce?: () => string;
  identity?: (identityHash: string) => GrantIdentity;
  hash?: HashValue;
}

export interface GrantApprovalContext<Intent, Source, Declaration> {
  protocol: string;
  capabilityId: string;
  toolName: string;
  intent: Intent;
  proposalHash: string;
  source: Source;
  preparedAt: string;
  expiresAt: string;
  nonce: string;
  declaration: Declaration;
}

export async function issueOneUseGrant<Intent, Source, Declaration>({
  protocol,
  intent,
  proposalHash,
  source,
  handlerVersion,
  ttlSeconds,
  preparedAt,
  approvalNonce,
  createDeclaration,
  createApprovalCopy,
  dependencies = {},
}: {
  protocol: string;
  intent: Intent;
  proposalHash: string;
  source: Source;
  handlerVersion: string;
  ttlSeconds: number;
  preparedAt?: string;
  approvalNonce?: string;
  createDeclaration: (toolName: string, expiresAt: string) => Declaration;
  createApprovalCopy: (
    context: GrantApprovalContext<Intent, Source, Declaration>,
  ) => string;
  dependencies?: GrantIssueDependencies;
}): Promise<IssuedCapabilityGrant<Intent, Source, Declaration>> {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('A positive capability lifetime is required.');
  }

  const compiledAt =
    preparedAt ?? new Date((dependencies.wallNow ?? Date.now)()).toISOString();
  const compiledAtMs = Date.parse(compiledAt);
  if (!Number.isFinite(compiledAtMs)) {
    throw new Error('A valid grant preparation timestamp is required.');
  }
  const expiresAt = new Date(compiledAtMs + ttlSeconds * 1_000).toISOString();
  const nonce =
    approvalNonce ??
    (dependencies.nonce ?? (() => globalThis.crypto.randomUUID()))();
  const hash = dependencies.hash ?? sha256Hex;

  const identityHash = await hash({
    protocol,
    intent,
    proposalHash,
    source,
    approvalNonce: nonce,
    handlerVersion,
    compiledAt,
    expiresAt,
  });
  const identity = (dependencies.identity ?? defaultIdentity)(identityHash);
  const declaration = createDeclaration(identity.toolName, expiresAt);
  const approvalContext: GrantApprovalContext<Intent, Source, Declaration> = {
    protocol,
    capabilityId: identity.capabilityId,
    toolName: identity.toolName,
    intent,
    proposalHash,
    source,
    preparedAt: compiledAt,
    expiresAt,
    nonce,
    declaration,
  };
  const approval = {
    preparedAt: compiledAt,
    nonce,
    copy: createApprovalCopy(approvalContext),
  };
  const compiled = {
    toolName: identity.toolName,
    declaration,
    handlerVersion,
    compiledAt,
    expiresAt,
  };
  const contractMaterial = {
    protocol,
    capabilityId: identity.capabilityId,
    intent,
    proposalHash,
    source,
    approval,
    compiled,
  };

  return {
    ...contractMaterial,
    contractHash: await hashCapabilityContract(contractMaterial, hash),
  };
}

export function defaultIdentity(identityHash: string): GrantIdentity {
  return {
    capabilityId: `cap_${identityHash.slice(0, 24)}`,
    toolName: `capability_once_${identityHash.slice(0, 16)}`,
  };
}
