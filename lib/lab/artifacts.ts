import { createPolicyArtifact } from './risk';
import type {
  EvidenceReceipt,
  RiskAssessment,
  ScenarioDefinition,
} from './types';

export interface JsonArtifact {
  filename: string;
  text: string;
}

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
    `webmcp-policy-${scenario.id}.json`,
    createPolicyArtifact(scenario, assessment, generatedAt),
  );
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
