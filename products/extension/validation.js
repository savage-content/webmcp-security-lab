export const APPROVED_CAPABILITY_TOOL_PATTERN =
  /^get_training_1042_eligibility_once_[0-9a-f]{16}$/;

export const FIXED_BRIDGE_PORT = 8788;
export const ALTERNATE_BRIDGE_PORT = 48_788;
export const APPROVED_BRIDGE_PORTS = Object.freeze([
  FIXED_BRIDGE_PORT,
  ALTERNATE_BRIDGE_PORT,
]);
export const CONNECTOR_BASES = Object.freeze(
  APPROVED_BRIDGE_PORTS.flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]),
);
export const MAX_INPUT_SCHEMA_TEXT_LENGTH = 32_768;

export const INSPECTION_FAILURE_CODES = Object.freeze({
  envelopeInvalid: 'inspection-envelope-invalid',
  originMismatch: 'inspection-origin-mismatch',
  executionUrlMismatch: 'inspection-execution-url-mismatch',
  observedAtInvalid: 'inspection-observed-at-invalid',
  toolsInvalid: 'inspection-tools-invalid',
  toolsOversized: 'inspection-tools-oversized',
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BRIDGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeConnectorBase(value) {
  const candidate = String(value ?? '')
    .trim()
    .replace(/\/$/u, '');
  if (!CONNECTOR_BASES.includes(candidate)) {
    throw new Error(
      `The connector must use an approved loopback endpoint on port ${APPROVED_BRIDGE_PORTS.join(' or ')}.`,
    );
  }
  return candidate;
}

export function normalizePairCode(value) {
  const candidate = String(value ?? '').trim();
  if (!/^\d{8}$/u.test(candidate)) {
    throw new Error('Enter the current eight-digit one-time pairing code.');
  }
  return candidate;
}

export function pageIdentityFromUrl(value) {
  const url = new URL(String(value ?? ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only an active HTTP(S) page can be paired.');
  }
  if (url.username || url.password) {
    throw new Error('Pages containing URL credentials cannot be paired.');
  }

  // Pairing needs the origin and route, not query values or fragments that may
  // contain sensitive data. The connector separately verifies the exact origin.
  url.search = '';
  url.hash = '';
  return Object.freeze({ origin: url.origin, pageUrl: url.toString() });
}

export function connectionMatchesPage(connection, page) {
  return (
    isPlainRecord(connection) &&
    isPlainRecord(page) &&
    connection.origin === page.origin &&
    connection.pageUrl === page.pageUrl
  );
}

export function isDocumentId(value) {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

export function connectionMatchesDocument(connection, documentIdentity) {
  return (
    connectionMatchesPage(connection, documentIdentity) &&
    isDocumentId(connection.documentId) &&
    isDocumentId(documentIdentity.documentId) &&
    connection.documentId === documentIdentity.documentId &&
    connection.frameId === 0 &&
    documentIdentity.frameId === 0
  );
}

export function sanitizePairResponse(value, expectedOrigin) {
  if (!isPlainRecord(value)) {
    throw new Error('The connector returned an invalid pairing response.');
  }
  const sessionId = value.session_id;
  const bridgeToken = value.bridge_token;
  const origin = value.origin;
  const pairedAt = value.paired_at;
  if (
    typeof sessionId !== 'string' ||
    !UUID_PATTERN.test(sessionId) ||
    typeof bridgeToken !== 'string' ||
    !BRIDGE_TOKEN_PATTERN.test(bridgeToken) ||
    origin !== expectedOrigin ||
    typeof pairedAt !== 'string' ||
    !Number.isFinite(Date.parse(pairedAt))
  ) {
    throw new Error('The connector returned an invalid pairing identity.');
  }
  return Object.freeze({ sessionId, bridgeToken, origin, pairedAt });
}

export function hasExactlyEmptyArguments(value) {
  return isPlainRecord(value) && Object.keys(value).length === 0;
}

export function isBridgeCommandId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function hasOnlyKeys(value, keys) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function sanitizeBridgeCommand(value) {
  if (!isPlainRecord(value)) {
    throw new Error('The connector returned an invalid command.');
  }
  if (
    !isBridgeCommandId(value.command_id) ||
    typeof value.issued_at !== 'string' ||
    !Number.isFinite(Date.parse(value.issued_at))
  ) {
    throw new Error('The connector command has an invalid identity.');
  }

  if (value.kind === 'inspect-tools') {
    if (!hasOnlyKeys(value, ['command_id', 'kind', 'issued_at'])) {
      throw new Error('The inspection command contains unknown fields.');
    }
    return Object.freeze({
      commandId: value.command_id,
      kind: value.kind,
      issuedAt: value.issued_at,
    });
  }

  if (value.kind === 'invoke-approved-capability') {
    if (
      !hasOnlyKeys(value, [
        'command_id',
        'kind',
        'issued_at',
        'tool_name',
        'arguments',
      ]) ||
      typeof value.tool_name !== 'string' ||
      !APPROVED_CAPABILITY_TOOL_PATTERN.test(value.tool_name) ||
      !hasExactlyEmptyArguments(value.arguments)
    ) {
      throw new Error(
        'The invocation command is not an exact no-input Scenario 1 capability.',
      );
    }
    return Object.freeze({
      commandId: value.command_id,
      kind: value.kind,
      issuedAt: value.issued_at,
      toolName: value.tool_name,
      arguments: Object.freeze({}),
    });
  }

  throw new Error('The connector requested an unsupported command.');
}

export function sanitizePendingCompletion(value, expectedOrigin) {
  if (
    !isPlainRecord(value) ||
    !isBridgeCommandId(value.command_id) ||
    typeof value.observed_at !== 'string' ||
    !Number.isFinite(Date.parse(value.observed_at)) ||
    value.observed_origin !== expectedOrigin ||
    typeof value.ok !== 'boolean'
  ) {
    throw new Error('The pending result has an invalid command identity.');
  }

  if (value.ok) {
    if (
      !hasOnlyKeys(value, [
        'command_id',
        'observed_at',
        'observed_origin',
        'ok',
        'payload',
      ]) ||
      !Object.hasOwn(value, 'payload')
    ) {
      throw new Error('The pending successful result is malformed.');
    }
    return Object.freeze({
      command_id: value.command_id,
      observed_at: value.observed_at,
      observed_origin: expectedOrigin,
      ok: true,
      payload: cloneJsonValue(value.payload),
    });
  }

  if (
    !hasOnlyKeys(value, [
      'command_id',
      'observed_at',
      'observed_origin',
      'ok',
      'error',
    ]) ||
    typeof value.error !== 'string' ||
    value.error.length > 500
  ) {
    throw new Error('The pending failed result is malformed.');
  }
  return Object.freeze({
    command_id: value.command_id,
    observed_at: value.observed_at,
    observed_origin: expectedOrigin,
    ok: false,
    error: value.error,
  });
}

function cloneJsonValue(value, depth = 0) {
  if (depth > 16) throw new Error('The page result is nested too deeply.');
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 100_000) {
      throw new Error('The page result contains an oversized string.');
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) {
      throw new Error('The page result contains an oversized array.');
    }
    return value.map((item) => cloneJsonValue(item, depth + 1));
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length > 512) {
      throw new Error('The page result contains too many fields.');
    }
    const result = {};
    for (const key of keys) {
      if (key.length > 200) {
        throw new Error('The page result contains an oversized field name.');
      }
      result[key] = cloneJsonValue(value[key], depth + 1);
    }
    return result;
  }
  throw new Error('The page result is not JSON data.');
}

function sanitizeTool(value) {
  if (!isPlainRecord(value) || typeof value.name !== 'string') return undefined;
  if (value.name.length < 1 || value.name.length > 128) return undefined;
  if (!isPlainRecord(value.annotations)) {
    return undefined;
  }
  if (
    typeof value.annotations.readOnlyHint !== 'boolean' ||
    typeof value.annotations.untrustedContentHint !== 'boolean'
  ) {
    return undefined;
  }
  const inputSchema = normalizeToolInputSchema(value.inputSchema);
  if (!inputSchema) return undefined;

  return {
    name: value.name,
    title:
      typeof value.title === 'string' && value.title.length <= 200
        ? value.title
        : value.name,
    description:
      typeof value.description === 'string'
        ? value.description.slice(0, 500)
        : '',
    inputSchema,
    annotations: {
      readOnlyHint: value.annotations.readOnlyHint,
      untrustedContentHint: value.annotations.untrustedContentHint,
    },
  };
}

function normalizeToolInputSchema(value) {
  let candidate = value;
  if (typeof candidate === 'string') {
    if (candidate.length > MAX_INPUT_SCHEMA_TEXT_LENGTH) return undefined;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }
  if (!isPlainRecord(candidate)) return undefined;

  try {
    const serialized = JSON.stringify(candidate);
    if (serialized.length > MAX_INPUT_SCHEMA_TEXT_LENGTH) return undefined;
    const normalized = cloneJsonValue(candidate);
    return isPlainRecord(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function executionUrlMatchesPage(value, expectedExecutionUrl, expectedPageUrl) {
  if (typeof value !== 'string' || value !== expectedExecutionUrl) return false;
  try {
    return pageIdentityFromUrl(value).pageUrl === expectedPageUrl;
  } catch {
    return false;
  }
}

function isCrossRealmPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    const constructor = Object.getOwnPropertyDescriptor(
      prototype,
      'constructor',
    )?.value;
    return (
      Object.getPrototypeOf(prototype) === null &&
      typeof constructor === 'function' &&
      constructor.name === 'Object'
    );
  } catch {
    return false;
  }
}

function inspectionFailure(code) {
  return new Error(`Inspection response rejected (${code}).`);
}

function normalizeInspectionEnvelope(value) {
  // MAIN-world executeScript results may retain that realm's Object prototype.
  // Accept only a plain-record prototype shape, then clone the complete wrapper
  // into this service-worker realm before applying the existing strict nested
  // JSON sanitizers. The wrapper itself is created by our injected function;
  // page-supplied declaration strings remain untrusted data.
  if (!isCrossRealmPlainRecord(value)) {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.envelopeInvalid);
  }
  try {
    const normalized = structuredClone(value);
    if (!isPlainRecord(normalized)) {
      throw inspectionFailure(INSPECTION_FAILURE_CODES.envelopeInvalid);
    }
    return normalized;
  } catch {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.envelopeInvalid);
  }
}

export function sanitizeInspectionPayload(
  value,
  expectedOrigin,
  expectedPageUrl,
  expectedExecutionUrl,
) {
  const normalized = normalizeInspectionEnvelope(value);
  if (normalized.origin !== expectedOrigin) {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.originMismatch);
  }
  if (
    !executionUrlMatchesPage(
      normalized.executionUrl,
      expectedExecutionUrl,
      expectedPageUrl,
    )
  ) {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.executionUrlMismatch);
  }
  if (
    typeof normalized.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(normalized.observedAt))
  ) {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.observedAtInvalid);
  }
  if (!Array.isArray(normalized.tools)) {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.toolsInvalid);
  }
  if (normalized.tools.length > 100) {
    throw inspectionFailure(INSPECTION_FAILURE_CODES.toolsOversized);
  }
  return {
    origin: expectedOrigin,
    pageUrl: expectedPageUrl,
    observedAt: normalized.observedAt,
    tools: normalized.tools.map(sanitizeTool).filter(Boolean),
  };
}

export function sanitizeInvocationPayload(
  value,
  expectedOrigin,
  expectedPageUrl,
  expectedExecutionUrl,
  expectedToolName,
) {
  if (
    !isPlainRecord(value) ||
    value.origin !== expectedOrigin ||
    !executionUrlMatchesPage(
      value.executionUrl,
      expectedExecutionUrl,
      expectedPageUrl,
    ) ||
    value.toolName !== expectedToolName
  ) {
    throw new Error('The page returned a mismatched invocation identity.');
  }
  const fixedResultErrors = {
    'webmcp-execution-failed': 'The approved WebMCP execution failed.',
    'webmcp-result-oversized': 'The approved WebMCP result was oversized.',
    'webmcp-result-malformed': 'The approved WebMCP result was malformed.',
    'webmcp-result-invalid': 'The approved WebMCP result was invalid.',
  };
  if (typeof value.errorCode === 'string') {
    const message = fixedResultErrors[value.errorCode];
    if (!message || Object.hasOwn(value, 'result')) {
      throw new Error('The page returned an invalid invocation result.');
    }
    throw new Error(message);
  }
  return {
    origin: expectedOrigin,
    pageUrl: expectedPageUrl,
    toolName: expectedToolName,
    result: cloneJsonValue(value.result),
  };
}

export function safeErrorMessage(value) {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/[\r\n\t]+/gu, ' ').slice(0, 500);
}
