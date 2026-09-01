import type {
  CapabilitySourceBinding,
  CapabilityToolContract,
  HashValue,
} from './types';

const canonicalJsonError =
  'The value must contain only finite, data-only JSON values.';

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(canonicalJsonError);
    return value;
  }
  if (typeof value !== 'object') throw new Error(canonicalJsonError);
  if (ancestors.has(value)) throw new Error(canonicalJsonError);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1 || !ownKeys.includes('length')) {
        throw new Error(canonicalJsonError);
      }
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error(canonicalJsonError);
        }
        return stableValue(descriptor.value, ancestors);
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(canonicalJsonError);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new Error(canonicalJsonError);
    }
    return Object.fromEntries(
      (keys as string[]).sort(compareUtf16).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error(canonicalJsonError);
        }
        return [key, stableValue(descriptor.value, ancestors)];
      }),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Strict JSON serialization with recursively UTF-16-sorted object keys. */
export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(stableValue(value));
  if (encoded === undefined) {
    throw new Error('The value cannot be represented as canonical JSON.');
  }
  return encoded;
}

/** SHA-256 over canonical JSON, expressed as lowercase hexadecimal. */
export const sha256Hex: HashValue = async (value) => {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

export async function hashSourceBinding({
  tool,
  handlerVersion,
  origin,
  hash = sha256Hex,
}: {
  tool: CapabilityToolContract;
  handlerVersion: string;
  origin: string;
  hash?: HashValue;
}): Promise<string> {
  return hash({ tool, handlerVersion, origin });
}

export async function hashToolSchema(
  inputSchema: unknown,
  hash: HashValue = sha256Hex,
): Promise<string> {
  return hash(inputSchema);
}

export async function hashBaselineState(
  baseline: unknown,
  hash: HashValue = sha256Hex,
): Promise<string> {
  return hash(baseline);
}

export async function hashProposalBinding(
  input: unknown,
  source: CapabilitySourceBinding | Record<string, unknown>,
  hash: HashValue = sha256Hex,
): Promise<string> {
  return hash({ input, source });
}

export async function hashCapabilityContract(
  contractMaterial: unknown,
  hash: HashValue = sha256Hex,
): Promise<string> {
  return hash(contractMaterial);
}

export async function createCanonicalBindingHashes({
  tool,
  handlerVersion,
  origin,
  baseline,
  hash = sha256Hex,
}: {
  tool: CapabilityToolContract;
  handlerVersion: string;
  origin: string;
  baseline: unknown;
  hash?: HashValue;
}) {
  const [sourceHash, schemaHash, baselineHash] = await Promise.all([
    hashSourceBinding({ tool, handlerVersion, origin, hash }),
    hashToolSchema(tool.inputSchema, hash),
    hashBaselineState(baseline, hash),
  ]);
  return { sourceHash, schemaHash, baselineHash };
}
