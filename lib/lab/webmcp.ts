import type {
  CapabilityInvalidationReason,
  CapabilityVerification,
  ConfirmationEvidence,
  EvidenceReceipt,
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
    input: string,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

export const LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS = 50;

export type RegistrationSettlementDecision =
  | 'continue'
  | 'preserve-claimed-execution'
  | 'discard-stale-registration';

/**
 * A WebMCP implementation may expose a tool before registerTool()'s promise
 * resolves. If that tool is claimed in the meantime, its callback owns
 * completion and retirement. Treating the expected consumed generation as a
 * stale registration would abort Chrome 152's still-in-flight execution.
 */
export function decideRegistrationSettlement({
  mounted,
  epochMatches,
  generationMatches,
  leaseState,
}: {
  mounted: boolean;
  epochMatches: boolean;
  generationMatches: boolean;
  leaseState: 'active' | 'consumed' | 'expired' | 'revoked';
}): RegistrationSettlementDecision {
  if (!mounted || !epochMatches) return 'discard-stale-registration';
  if (leaseState === 'consumed') return 'preserve-claimed-execution';
  if (!generationMatches || leaseState !== 'active') {
    return 'discard-stale-registration';
  }
  return 'continue';
}

interface OneUseRegistrationLifecycle {
  markClaimed: () => void;
}

interface OneUseRegistrationRetirementOptions {
  onClaimedFailure?: (error: unknown) => void;
}

/**
 * Keeps Chrome 152 from cancelling the call that consumed a registration.
 * Logical one-use enforcement remains the handler's responsibility and must
 * happen synchronously before markClaimed() returns. Physical retirement is
 * delayed only long enough for the fulfilled callback result to cross the
 * legacy Chromium execution boundary.
 */
export function withOneUseRegistrationRetirement<TResult>(
  controller: AbortController,
  execute: (
    input: unknown,
    client: { signal?: AbortSignal } | undefined,
    lifecycle: OneUseRegistrationLifecycle,
  ) => Promise<TResult>,
  options: OneUseRegistrationRetirementOptions = {},
) {
  return async (
    input: unknown,
    client?: { signal?: AbortSignal },
  ): Promise<TResult> => {
    let claimed = false;
    try {
      const result = await execute(input, client, {
        markClaimed: () => {
          claimed = true;
        },
      });
      if (claimed) {
        globalThis.setTimeout(
          () => controller.abort(),
          LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS,
        );
      }
      return result;
    } catch (error) {
      if (claimed) {
        controller.abort();
        try {
          options.onClaimedFailure?.(error);
        } catch {
          // Preserve the execution failure if UI/error reporting also fails.
        }
      }
      throw error;
    }
  };
}

export interface ScenarioOneCapabilityToolResult {
  result: JsonValue;
  verification: CapabilityVerification;
  evidence: {
    receipt_id: string;
    persistence: 'local-export-only';
    contract_hash: string;
    invalidation_reason: CapabilityInvalidationReason;
  };
  structuredContent: {
    receipt: EvidenceReceipt;
  };
}

/**
 * Builds the generated Scenario 1 tool's result after the receipt has passed
 * the page's capability-evidence validation. The structured channel carries
 * the complete receipt needed by local connector consumers; the legacy
 * summary remains available without adding content or executable directions.
 */
export function createScenarioOneCapabilityToolResult(
  receipt: EvidenceReceipt,
): ScenarioOneCapabilityToolResult {
  const capability = receipt.capability;
  if (!capability) {
    throw new Error('A validated capability receipt is required.');
  }

  return {
    result: structuredClone(receipt.effective.rawResult),
    verification: structuredClone(capability.verification),
    evidence: {
      receipt_id: receipt.id,
      persistence: 'local-export-only',
      contract_hash: capability.contract.contractHash,
      invalidation_reason: capability.invalidation.reason,
    },
    structuredContent: {
      receipt: structuredClone(receipt),
    },
  };
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

  return modelContext.executeTool(tool, JSON.stringify(input));
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
