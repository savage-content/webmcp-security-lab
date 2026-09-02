export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ScenarioId =
  | 'read-only-claim'
  | 'over-broad-schema'
  | 'tool-result-injection'
  | 'confirmation-mismatch'
  | 'client-discovery-variance';

export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
export type InvocationChannel =
  | 'webmcp'
  | 'webmcp-self-test'
  | 'negotiated-capability'
  | 'secure-retest'
  | 'lab-harness';

export type RiskLevel = 'informational' | 'caution' | 'meaningful';
export type PolicyAction = 'allow' | 'warn' | 'ask' | 'block';
export type RiskRuleId =
  | 'WMC-001'
  | 'WMC-002'
  | 'WMC-003'
  | 'WMC-004'
  | 'WMC-005';

export type RegistrationState =
  | 'checking'
  | 'unsupported'
  | 'registering'
  | 'registered'
  | 'unregistered'
  | 'denied'
  | 'error';

export type DiscoveryState =
  | 'not-checked'
  | 'unsupported'
  | 'discovered'
  | 'not-discovered'
  | 'error';

export interface WebMcpStatus {
  api: 'document.modelContext';
  browserSupport: 'checking' | 'supported' | 'unsupported';
  registration: RegistrationState;
  permissionsPolicy: 'allowed' | 'blocked' | 'unknown';
  discovery: DiscoveryState;
  invocation: 'not-observed' | 'observed';
  detail: string;
  discoveredToolNames: string[];
}

export interface ToolDeclaration {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
}

export interface PresentedSurface {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  confirmationTitle: string;
  confirmationCopy: string;
  apparentPromise: string;
  inputFields: string[];
}

export interface ScenarioRiskProfile {
  claimsReadOnly: boolean;
  claimsPreviewOnly: boolean;
  claimsUniversalAvailability: boolean;
  mutatesState: boolean;
  returnsInstructionShapedContent: boolean;
}

export interface BuilderGuidance {
  vulnerableCode: string;
  secureCode: string;
  testToAdd: string;
  changes: string[];
}

export interface RiskFinding {
  ruleId: RiskRuleId;
  level: RiskLevel;
  title: string;
  why: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  policyAction: PolicyAction;
  headline: string;
  summary: string;
  findings: RiskFinding[];
  schemaFields: string[];
  hiddenSchemaFields: string[];
}

export interface ScenarioDefinition {
  id: ScenarioId;
  ordinal: string;
  version: string;
  shortTitle: string;
  category: string;
  summary: string;
  riskLabel: string;
  presented: PresentedSurface;
  tool: ToolDeclaration;
  secureTool: ToolDeclaration;
  initialState: Record<string, JsonValue>;
  defaultArguments: Record<string, JsonValue>;
  secureDefaultArguments: Record<string, JsonValue>;
  secureConfirmationCopy: string;
  riskProfile: ScenarioRiskProfile;
  builder: BuilderGuidance;
  expectedFinding: string;
  debrief: string;
  remediation: string;
  secureComparison: string;
}

export interface ConfirmationEvidence {
  presentedCopy: string;
  known: boolean;
  approved: boolean | null;
  source:
    | 'lab-dialog'
    | 'browser-not-observable'
    | 'webmcp-self-test'
    | 'capability-contract'
    | 'builder-retest';
}

export interface LockedCapabilityIntent {
  accountId: 'TRAINING-1042';
  operation: 'read-eligibility';
  maxCalls: 1;
  ttlSeconds: number;
  allowedOrigin: string;
  requiredResult: {
    accountId: 'TRAINING-1042';
    eligibility: 'eligible';
  };
  baseline: {
    stateHash: string;
    reviewed: false;
    reviewCount: 0;
    lastReviewedAt: null;
  };
  prohibitedEffects: [
    'account-state-mutation',
    'capability-handler-network-fetch',
    'cross-account-access',
  ];
  expectedPostcondition: 'account-state-byte-identical';
  lockedAt: string;
}

export interface CapabilityProposalInput {
  account_id: 'TRAINING-1042';
  operation: 'read-eligibility';
  max_calls: 1;
  ttl_seconds: number;
  allowed_origin: string;
  prohibited_effects: [
    'account-state-mutation',
    'capability-handler-network-fetch',
    'cross-account-access',
  ];
  expected_postcondition: 'account-state-byte-identical';
  baseline_state_hash: string;
}

export interface CapabilityProposalRecord {
  input: CapabilityProposalInput;
  proposalHash: string;
  proposedAt: string;
  channel: 'webmcp' | 'fallback-harness';
  source: {
    toolName: string;
    sourceDeclarationHash: string;
    handlerVersion: string;
    origin: string;
  };
}

export type CapabilityInvalidationReason =
  | 'consumed'
  | 'expired'
  | 'source-drift'
  | 'state-drift'
  | 'origin-drift'
  | 'handler-drift'
  | 'registration-failed';

export interface CompiledCapabilityContract {
  protocol: 'webmcp-capability-negotiation/1';
  capabilityId: string;
  contractHash: string;
  intent: LockedCapabilityIntent;
  proposalHash: string;
  source: CapabilityProposalRecord['source'];
  approval: {
    preparedAt: string;
    nonce: string;
    copy: string;
  };
  compiled: {
    toolName: string;
    declaration: ToolDeclaration;
    handlerVersion: string;
    compiledAt: string;
    expiresAt: string;
  };
}

export interface CapabilityVerification {
  passed: boolean;
  baselineStateMatched: boolean;
  observedStateHash: string;
  requiredResultMatched: boolean;
  stateByteIdentical: boolean;
  controlledHandlerViolations: string[];
  checkedAt: string;
}

export interface CapabilityNegotiationEvidence {
  protocol: 'webmcp-capability-negotiation/1';
  scope: 'single-document-session';
  receiptPersistence: 'local-export-only';
  proposal: CapabilityProposalRecord;
  contract: CompiledCapabilityContract;
  approvalEvent: {
    approvedAt: string;
    contractHash: string;
  };
  invocation: {
    claimedAt: string;
    callNumber: 1;
  };
  verification: CapabilityVerification;
  invalidation: {
    reason: CapabilityInvalidationReason;
    at: string;
  };
}

export type LessonCapabilityScenarioId = Exclude<ScenarioId, 'read-only-claim'>;

export type LessonCapabilityProfileId =
  | 'lesson-2-profile-notice/1'
  | 'lesson-3-delivery-status/1'
  | 'lesson-4-digest-off/1'
  | 'lesson-5-client-observation/1';

export type LessonCapabilityOperation =
  | 'replace-profile-notice'
  | 'read-delivery-status'
  | 'disable-training-notification-subscription'
  | 'record-session-capability-observation';

export interface LessonCapabilityProposalInput {
  scenario_id: LessonCapabilityScenarioId;
  scenario_version: string;
  profile_id: LessonCapabilityProfileId;
  operation: LessonCapabilityOperation;
  bound_arguments: Record<string, JsonValue>;
  max_calls: 1;
  ttl_seconds: number;
  allowed_origin: string;
  baseline_state_hash: string;
  allowed_effects: string[];
  prohibited_effects: string[];
}

export interface LessonCapabilitySourceBinding {
  toolName: string;
  sourceDeclarationHash: string;
  handlerVersion: string;
  origin: string;
}

export interface LessonCapabilityIntent {
  scenarioId: LessonCapabilityScenarioId;
  scenarioVersion: string;
  profileId: LessonCapabilityProfileId;
  operation: LessonCapabilityOperation;
  boundArguments: Record<string, JsonValue>;
  maxCalls: 1;
  ttlSeconds: number;
  allowedOrigin: string;
  baseline: { stateHash: string };
  allowedEffects: string[];
  prohibitedEffects: string[];
  lockedAt: string;
}

export interface LessonCapabilityProposalRecord {
  input: LessonCapabilityProposalInput;
  proposalHash: string;
  proposedAt: string;
  channel: 'page-lesson' | 'webmcp';
  source: LessonCapabilitySourceBinding;
}

export interface CompiledLessonCapabilityContract {
  protocol: 'webmcp-capability-negotiation/2';
  capabilityId: string;
  contractHash: string;
  intent: LessonCapabilityIntent;
  proposalHash: string;
  source: LessonCapabilitySourceBinding;
  approval: {
    preparedAt: string;
    nonce: string;
    copy: string;
  };
  compiled: {
    toolName: string;
    declaration: ToolDeclaration;
    handlerVersion: string;
    compiledAt: string;
    expiresAt: string;
  };
}

export interface LessonCapabilityVerification {
  passed: boolean;
  baselineMatched: boolean;
  observedBeforeStateHash: string;
  observedAfterStateHash: string;
  resultMatched: boolean;
  postconditionMatched: boolean;
  expectedEffects: string[];
  observedEffects: string[];
  violations: string[];
  checkedAt: string;
}

export interface LessonCapabilityNegotiationEvidence {
  protocol: 'webmcp-capability-negotiation/2';
  scope: 'single-document-session';
  receiptPersistence: 'returned-to-caller';
  proposal: LessonCapabilityProposalRecord;
  contract: CompiledLessonCapabilityContract;
  approvalEvent: {
    approvedAt: string;
    contractHash: string;
  };
  invocation: {
    claimedAt: string;
    callNumber: 1;
  };
  verification: LessonCapabilityVerification;
  invalidation: {
    reason: CapabilityInvalidationReason;
    at: string;
  };
}

export interface RunContext {
  channel: InvocationChannel;
  now: string;
  origin: string;
  browser: {
    userAgent: string;
    language: string;
    platform: string;
  };
  clientLabel: string;
  webMcp: WebMcpStatus;
  confirmation: ConfirmationEvidence;
}

export interface RunOutcome {
  before: Record<string, JsonValue>;
  after: Record<string, JsonValue>;
  rawResult: JsonValue;
  sideEffects: string[];
  verdict: Verdict;
  debrief: string;
  remediation: string;
}

export interface EvidenceReceipt {
  id: string;
  schemaVersion: '1.0';
  sessionId: string;
  scenario: {
    id: ScenarioId;
    version: string;
    title: string;
  };
  timestamp: string;
  origin: string;
  browser: RunContext['browser'];
  client: {
    label: string;
    webMcp: WebMcpStatus;
  };
  declaration: ToolDeclaration;
  invocation: {
    channel: InvocationChannel;
    arguments: Record<string, JsonValue>;
    confirmation: ConfirmationEvidence;
  };
  effective: {
    before: Record<string, JsonValue>;
    after: Record<string, JsonValue>;
    rawResult: JsonValue;
    sideEffects: string[];
  };
  verdict: Verdict;
  debrief: string;
  remediation: string;
  limitation: string;
  capability?:
    | CapabilityNegotiationEvidence
    | LessonCapabilityNegotiationEvidence;
}
