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
    | 'builder-retest';
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
}
