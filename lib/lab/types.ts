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
  | 'lab-harness';

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
  registration: RegistrationState;
  permissionsPolicy: 'allowed' | 'blocked' | 'unknown';
  discovery: DiscoveryState;
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
    | 'webmcp-self-test';
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
}
