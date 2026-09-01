export type CanonicalHash = string;

export type HashValue = (value: unknown) => Promise<CanonicalHash>;

export interface CapabilityToolContract {
  name: string;
  inputSchema: unknown;
}

export interface CapabilitySourceBinding {
  toolName: string;
  sourceDeclarationHash: CanonicalHash;
  schemaHash?: CanonicalHash;
  handlerVersion: string;
  origin: string;
}

export type OneUseLeaseState = 'active' | 'consumed' | 'expired' | 'revoked';

export type OneUseClaim =
  | { ok: true; callNumber: 1 }
  | { ok: false; reason: Exclude<OneUseLeaseState, 'active'> };

export interface OneUseLease {
  claim: () => OneUseClaim;
  invalidate: (reason: 'expired' | 'revoked') => void;
  state: () => OneUseLeaseState;
  deadline: number;
}

export interface IssuedCapabilityGrant<Intent, Source, Declaration> {
  protocol: string;
  capabilityId: string;
  contractHash: CanonicalHash;
  intent: Intent;
  proposalHash: CanonicalHash;
  source: Source;
  approval: {
    preparedAt: string;
    nonce: string;
    copy: string;
  };
  compiled: {
    toolName: string;
    declaration: Declaration;
    handlerVersion: string;
    compiledAt: string;
    expiresAt: string;
  };
}

export type CapabilityBindingFailure =
  | 'consumed'
  | 'expired'
  | 'origin-drift'
  | 'handler-drift'
  | 'schema-drift'
  | 'source-drift'
  | 'baseline-drift';

export interface CapabilityBindingExpectations {
  maxCalls: number;
  expiresAt: string;
  origin: string;
  handlerVersion: string;
  sourceHash: CanonicalHash;
  schemaHash?: CanonicalHash;
  baselineHash?: CanonicalHash;
}

export interface CapabilityBindingObservation {
  callsClaimed: number;
  now: string | number;
  origin: string;
  handlerVersion: string;
  sourceHash: CanonicalHash;
  schemaHash?: CanonicalHash;
  baselineHash?: CanonicalHash;
}

export type CapabilityBindingResult =
  | { ok: true }
  | { ok: false; reason: CapabilityBindingFailure };

export interface CapabilityExecutionVerification {
  passed: boolean;
  baselineMatched: boolean;
  observedBaselineHash: CanonicalHash;
  stateUnchanged: boolean;
  requiredResultMatched: boolean;
  violations: string[];
  checkedAt: string;
}
