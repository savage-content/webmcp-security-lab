import type {
  ConfirmationEvidence,
  JsonValue,
  ToolDeclaration,
  WebMcpStatus,
} from './types';

export interface RegisteredWebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

export interface ModelContextApi {
  registerTool: (
    tool: ToolDeclaration & {
      execute: (input: unknown, client?: { signal?: AbortSignal }) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => Promise<void> | void;
  getTools?: () => Promise<RegisteredWebMcpTool[]>;
  executeTool?: (
    tool: RegisteredWebMcpTool,
    input: Record<string, JsonValue>,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

export function createUnattributedWebMcpConfirmation(
  presentedCopy: string,
): ConfirmationEvidence {
  return {
    presentedCopy,
    known: false,
    approved: null,
    source: 'browser-not-observable',
  };
}

export function executeRegisteredTool(
  modelContext: ModelContextApi,
  tool: RegisteredWebMcpTool,
  input: Record<string, JsonValue>,
) {
  if (!modelContext.executeTool) {
    throw new Error('document.modelContext.executeTool is unavailable.');
  }

  return modelContext.executeTool(tool, input);
}

export function getModelContext(): ModelContextApi | undefined {
  if (typeof document === 'undefined') return undefined;
  return (document as Document & { modelContext?: ModelContextApi })
    .modelContext;
}

export function observeToolsPermission(): WebMcpStatus['permissionsPolicy'] {
  if (typeof document === 'undefined') return 'unknown';
  const policy =
    (
      document as Document & {
        permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
        featurePolicy?: { allowsFeature: (feature: string) => boolean };
      }
    ).permissionsPolicy ??
    (
      document as Document & {
        featurePolicy?: { allowsFeature: (feature: string) => boolean };
      }
    ).featurePolicy;

  if (!policy?.allowsFeature) return 'unknown';

  try {
    return policy.allowsFeature('tools') ? 'allowed' : 'blocked';
  } catch {
    return 'unknown';
  }
}

export async function registerPageTool({
  modelContext,
  tool,
  signal,
  permissionObservation,
}: {
  modelContext: ModelContextApi | undefined;
  tool: ToolDeclaration & { execute: (input: unknown) => Promise<unknown> };
  signal: AbortSignal;
  permissionObservation: WebMcpStatus['permissionsPolicy'];
}): Promise<WebMcpStatus> {
  if (!modelContext?.registerTool) {
    return {
      api: 'document.modelContext',
      browserSupport: 'unsupported',
      registration: 'unsupported',
      permissionsPolicy: permissionObservation,
      discovery: 'unsupported',
      invocation: 'not-observed',
      detail:
        'This browser does not expose document.modelContext. The educational harness is available, but it is not WebMCP.',
      discoveredToolNames: [],
    };
  }

  try {
    await modelContext.registerTool(tool, { signal });
    return {
      api: 'document.modelContext',
      browserSupport: 'supported',
      registration: 'registered',
      // A successful registration is stronger evidence than feature-policy
      // enumeration, which has varied across experimental clients.
      permissionsPolicy: 'allowed',
      discovery: 'not-checked',
      invocation: 'not-observed',
      detail:
        permissionObservation === 'blocked'
          ? `${tool.name} registered successfully. The earlier policy probe was advisory and contradicted by the authoritative registration result.`
          : `${tool.name} is registered on this top-level document. Client discovery and invocation remain separate observations.`,
      discoveredToolNames: [],
    };
  } catch (error) {
    const name =
      error && typeof error === 'object' && 'name' in error
        ? String(error.name)
        : '';
    const denied = name === 'NotAllowedError';
    return {
      api: 'document.modelContext',
      browserSupport: 'supported',
      registration: denied ? 'denied' : 'error',
      permissionsPolicy: denied ? 'blocked' : permissionObservation,
      discovery: 'not-checked',
      invocation: 'not-observed',
      detail: denied
        ? 'The browser rejected registerTool() with NotAllowedError, so registration is blocked by policy.'
        : `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      discoveredToolNames: [],
    };
  }
}
