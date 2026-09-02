import { createPolicyArtifact } from './risk';
import { sha256Hex } from './capability-negotiation';
import type {
  CompiledLessonCapabilityContract,
  CompiledCapabilityContract,
  EvidenceReceipt,
  RiskAssessment,
  ScenarioDefinition,
} from './types';

export interface JsonArtifact {
  filename: string;
  text: string;
}

export const CAPABILITY_PERMIT_ENVELOPE_SCHEMA =
  'leftout.webmcp-capability-permit-envelope/1' as const;
export const CAPABILITY_PERMIT_SCHEMA =
  'leftout.webmcp-capability-permit/1' as const;
export const LESSON_CAPABILITY_PERMIT_SCHEMA =
  'leftout.webmcp-capability-permit/2' as const;
export const CAPABILITY_PERMIT_HANDOFF_SCHEMA =
  'leftout.page-capability-handoff/1' as const;
export const CAPABILITY_PERMIT_HANDOFF_TYPE =
  'leftout:webmcp-capability-permit' as const;

export interface DownloadEnvironment {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
  appendAnchor: (anchor: HTMLAnchorElement) => void;
  schedule: (callback: () => void, delay: number) => void;
}

export interface ClipboardWriter {
  writeText: (text: string) => Promise<void>;
}

export function createCapabilityPermitHandoff(artifact: JsonArtifact) {
  if (
    !artifact.text ||
    new TextEncoder().encode(artifact.text).length > 65_536
  ) {
    throw new Error(
      'The capability-permit handoff is empty or larger than 64 KiB.',
    );
  }
  return Object.freeze({
    type: CAPABILITY_PERMIT_HANDOFF_TYPE,
    schemaVersion: CAPABILITY_PERMIT_HANDOFF_SCHEMA,
    permitText: artifact.text,
  });
}

function serialize(filename: string, value: unknown): JsonArtifact {
  return {
    filename,
    text: JSON.stringify(value, null, 2),
  };
}

export function createEvidenceReceiptArtifact(
  receipt: EvidenceReceipt,
): JsonArtifact {
  return serialize(
    `webmcp-evidence-${receipt.scenario.id}-${receipt.id}.json`,
    receipt,
  );
}

export function createPolicyJsonArtifact(
  scenario: ScenarioDefinition,
  assessment: RiskAssessment,
  generatedAt = new Date().toISOString(),
): JsonArtifact {
  return serialize(
    `webmcp-awareness-${scenario.id}.json`,
    createPolicyArtifact(scenario, assessment, generatedAt),
  );
}

export async function createCapabilityPermitArtifact(
  contract: CompiledCapabilityContract | CompiledLessonCapabilityContract,
  approvedAt: string,
  pageUrl: string,
): Promise<JsonArtifact> {
  const normalizedPageUrl = new URL(pageUrl);
  normalizedPageUrl.search = '';
  normalizedPageUrl.hash = '';
  if (
    normalizedPageUrl.origin !== contract.intent.allowedOrigin ||
    contract.source.origin !== contract.intent.allowedOrigin
  ) {
    throw new Error(
      'The capability permit origin does not match its contract.',
    );
  }

  const lesson =
    contract.protocol === 'webmcp-capability-negotiation/2'
      ? {
          scenarioId: contract.intent.scenarioId,
          scenarioVersion: contract.intent.scenarioVersion,
          profileId: contract.intent.profileId,
          operation: contract.intent.operation,
          boundArguments: structuredClone(contract.intent.boundArguments),
          baselineStateHash: contract.intent.baseline.stateHash,
          allowedEffects: [...contract.intent.allowedEffects],
          prohibitedEffects: [...contract.intent.prohibitedEffects],
        }
      : undefined;
  const payload = {
    schemaVersion: lesson
      ? LESSON_CAPABILITY_PERMIT_SCHEMA
      : CAPABILITY_PERMIT_SCHEMA,
    permitId: contract.capabilityId,
    issuedAt: approvedAt,
    expiresAt: contract.compiled.expiresAt,
    scope: {
      origin: contract.intent.allowedOrigin,
      pageUrl: normalizedPageUrl.toString(),
    },
    capability: {
      toolName: contract.compiled.toolName,
      title: contract.compiled.declaration.title,
      description: contract.compiled.declaration.description,
      arguments: {},
      inputSchema: contract.compiled.declaration.inputSchema,
      annotations: contract.compiled.declaration.annotations,
      maxUses: 1,
    },
    binding: {
      contractHash: contract.contractHash,
      proposalHash: contract.proposalHash,
      sourceDeclarationHash: contract.source.sourceDeclarationHash,
      sourceHandlerVersion: contract.source.handlerVersion,
      capabilityHandlerVersion: contract.compiled.handlerVersion,
    },
    ...(lesson ? { lesson } : {}),
    safety: {
      grantsNewAuthority: false,
      importsDoNotInvoke: true,
      limitation:
        contract.protocol === 'webmcp-capability-negotiation/1'
          ? 'This self-hash detects accidental changes. It is not a signature or independent proof of human approval. The extension may use this permit only to narrow its built-in Scenario 1 boundary.'
          : 'This self-hash detects accidental changes. It is not a signature or independent proof of human approval. The extension may use this permit only to narrow one built-in synthetic lesson action.',
    },
  };
  const hashPreimage = {
    schemaVersion: CAPABILITY_PERMIT_ENVELOPE_SCHEMA,
    payload,
  };
  const envelope = {
    ...hashPreimage,
    integrity: {
      algorithm: 'SHA-256',
      contentSha256: await sha256Hex(hashPreimage),
    },
  };
  return serialize(
    `webmcp-capability-permit-${contract.capabilityId}.json`,
    envelope,
  );
}

export function createLessonCapabilityPermitArtifact(
  contract: CompiledLessonCapabilityContract,
  approvedAt: string,
  pageUrl: string,
) {
  return createCapabilityPermitArtifact(contract, approvedAt, pageUrl);
}

function browserDownloadEnvironment(): DownloadEnvironment {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('JSON downloads require a browser document.');
  }

  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
    appendAnchor: (anchor) => document.body.appendChild(anchor),
    schedule: (callback, delay) => {
      window.setTimeout(callback, delay);
    },
  };
}

export function requestJsonDownload(
  artifact: JsonArtifact,
  environment: DownloadEnvironment = browserDownloadEnvironment(),
) {
  const blob = new Blob([artifact.text], { type: 'application/json' });
  const url = environment.createObjectUrl(blob);
  const link = environment.createAnchor();

  try {
    link.href = url;
    link.download = artifact.filename;
    link.hidden = true;
    environment.appendAnchor(link);
    link.click();
  } finally {
    link.remove();
    environment.schedule(() => environment.revokeObjectUrl(url), 1_000);
  }

  return 'requested' as const;
}

export async function copyJsonArtifact(
  artifact: JsonArtifact,
  clipboard: ClipboardWriter | null | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.clipboard,
) {
  if (!clipboard?.writeText) return 'copy-failed' as const;

  try {
    await clipboard.writeText(artifact.text);
    return 'copied' as const;
  } catch {
    return 'copy-failed' as const;
  }
}
