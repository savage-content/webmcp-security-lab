/* global chrome */

import {
  APPROVED_CAPABILITY_TOOL_PATTERN,
  connectionMatchesDocument,
  connectionMatchesPage,
  isBridgeCommandId,
  isDocumentId,
  isPlainRecord,
  normalizeConnectorBase,
  normalizePairCode,
  pageIdentityFromUrl,
  safeErrorMessage,
  sanitizeBridgeCommand,
  sanitizeInspectionPayload,
  sanitizeInvocationPayload,
  sanitizePairChallengeResponse,
  sanitizePairResponse,
  sanitizePendingCompletion,
  sanitizeReportLaunchResponse,
} from './validation.js';
import {
  CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY,
  CAPABILITY_PERMIT_STORAGE_KEY,
  canonicalJson,
  publicCapabilityPermitStatus,
  validateCapabilityPermitText,
  verifyStoredCapabilityPermit,
} from './policy-validation.js';
import { buildHudModel } from './hud-model.js';

const CONNECTION_STORAGE_PREFIX = 'leftoutBridgeConnectionV2:';
const MAX_CONSUMED_PERMIT_TOMBSTONES = 256;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const PERMIT_DOCUMENT_BINDING_SCHEMA =
  'leftout.extension-capability-permit-document-binding/1';
const CLIENT_LABEL = 'LeftOut Chrome capability bridge';
const FETCH_TIMEOUT_MS = 10_000;
const OBSERVATION_INTERVAL_MS = 3_000;
const pollLocks = new Set();
const connectionMutationQueues = new Map();
const closedTabs = new Set();
let capabilityPermitMutation = Promise.resolve();

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value).toSorted();
  return (
    keys.length === expected.length &&
    expected.toSorted().every((key, index) => keys[index] === key)
  );
}

function inspectModelContextInMainWorld(
  expectedNavigationUrl,
  expectedPageUrl,
) {
  return (async () => {
    const assertPairedLocation = () => {
      const navigationUrl = location.href;
      if (
        navigationUrl !== expectedNavigationUrl ||
        `${location.origin}${location.pathname}` !== expectedPageUrl
      ) {
        throw new Error('The paired page navigated before inspection.');
      }
      return navigationUrl;
    };
    assertPairedLocation();
    const normalizeSchema = (value) => {
      let candidate = value ?? {};
      if (typeof candidate === 'string') {
        if (candidate.length > 32_768) return undefined;
        try {
          candidate = JSON.parse(candidate);
        } catch {
          return undefined;
        }
      }
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      ) {
        return undefined;
      }
      try {
        const serialized = JSON.stringify(candidate);
        if (serialized.length > 32_768) return undefined;
        const normalized = JSON.parse(serialized);
        return normalized &&
          typeof normalized === 'object' &&
          !Array.isArray(normalized)
          ? normalized
          : undefined;
      } catch {
        return undefined;
      }
    };
    const modelContext = document.modelContext;
    const getTools = modelContext?.getTools;
    if (!modelContext || typeof getTools !== 'function') {
      throw new Error('document.modelContext.getTools() is unavailable.');
    }
    const tools = await getTools.call(modelContext);
    if (!Array.isArray(tools)) {
      throw new Error(
        'document.modelContext.getTools() returned invalid data.',
      );
    }
    const executionUrl = assertPairedLocation();
    const sanitized = [];
    for (const tool of tools.slice(0, 100)) {
      if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string') {
        continue;
      }
      const annotations = tool.annotations;
      if (
        !annotations ||
        typeof annotations !== 'object' ||
        typeof annotations.readOnlyHint !== 'boolean' ||
        typeof annotations.untrustedContentHint !== 'boolean'
      ) {
        continue;
      }
      const inputSchema = normalizeSchema(tool.inputSchema);
      if (!inputSchema) continue;
      sanitized.push({
        name: tool.name.slice(0, 128),
        title:
          typeof tool.title === 'string'
            ? tool.title.slice(0, 200)
            : tool.name.slice(0, 128),
        description:
          typeof tool.description === 'string'
            ? tool.description.slice(0, 500)
            : '',
        inputSchema,
        annotations: {
          readOnlyHint: annotations.readOnlyHint,
          untrustedContentHint: annotations.untrustedContentHint,
        },
      });
    }
    return {
      origin: location.origin,
      executionUrl,
      observedAt: new Date().toISOString(),
      tools: sanitized,
    };
  })();
}

function invokeApprovedCapabilityInMainWorld(
  toolName,
  expectedNavigationUrl,
  expectedPageUrl,
  expectedDeclaration,
) {
  return (async () => {
    const assertPairedLocation = () => {
      const navigationUrl = location.href;
      if (
        navigationUrl !== expectedNavigationUrl ||
        `${location.origin}${location.pathname}` !== expectedPageUrl
      ) {
        throw new Error('The paired page navigated before invocation.');
      }
      return navigationUrl;
    };
    assertPairedLocation();
    const approvedPattern =
      /^(?:get_training_1042_eligibility_once_|update_profile_notice_once_|get_synthetic_delivery_status_safe_once_|set_training_notification_subscription_once_|record_webmcp_capability_observation_once_)[0-9a-f]{16}$/;
    if (typeof toolName !== 'string' || !approvedPattern.test(toolName)) {
      throw new Error(
        'The tool name is outside the synthetic lesson allowlist.',
      );
    }
    const modelContext = document.modelContext;
    const getTools = modelContext?.getTools;
    const executeTool = modelContext?.executeTool;
    if (
      !modelContext ||
      typeof getTools !== 'function' ||
      typeof executeTool !== 'function'
    ) {
      throw new Error(
        'document.modelContext discovery or invocation is unavailable.',
      );
    }
    const tools = await getTools.call(modelContext);
    if (!Array.isArray(tools)) {
      throw new Error(
        'document.modelContext.getTools() returned invalid data.',
      );
    }
    const matchingTools = tools.filter(
      (candidate) => candidate?.name === toolName,
    );
    if (matchingTools.length !== 1)
      throw new Error('The approved generated lesson tool is not registered.');

    const tool = matchingTools[0];
    if (
      !expectedDeclaration ||
      tool.title !== expectedDeclaration.title ||
      tool.description !== expectedDeclaration.description
    ) {
      throw new Error(
        'The lesson tool declaration changed after permit consumption.',
      );
    }

    let schema = tool.inputSchema;
    if (typeof schema === 'string') {
      if (schema.length > 32_768) {
        throw new Error('The generated tool schema is oversized.');
      }
      try {
        schema = JSON.parse(schema);
      } catch {
        throw new Error('The generated tool schema is malformed.');
      }
    }
    const stableJson = (value) => {
      const stable = (candidate) => {
        if (Array.isArray(candidate)) return candidate.map(stable);
        if (candidate && typeof candidate === 'object') {
          return Object.fromEntries(
            Object.keys(candidate)
              .sort()
              .map((key) => [key, stable(candidate[key])]),
          );
        }
        return candidate;
      };
      return JSON.stringify(stable(value));
    };
    const annotationKeys =
      tool.annotations &&
      typeof tool.annotations === 'object' &&
      !Array.isArray(tool.annotations)
        ? Object.keys(tool.annotations).sort()
        : [];
    if (
      stableJson(schema) !== stableJson(expectedDeclaration.inputSchema) ||
      annotationKeys.join('|') !== 'readOnlyHint|untrustedContentHint' ||
      stableJson(tool.annotations) !==
        stableJson(expectedDeclaration.annotations)
    ) {
      throw new Error(
        'The generated lesson tool changed its schema or safety annotations.',
      );
    }
    const executionUrl = assertPairedLocation();

    // Chrome's current WebMCP implementation accepts tool arguments as a JSON
    // string and returns a JSON string for structured callback results. The
    // bridge neither registers tools nor synthesizes approval: it can only call
    // one already registered, uniquely named lesson grant with exactly {}.
    let rawResult;
    try {
      rawResult = await executeTool.call(modelContext, tool, '{}');
    } catch {
      return {
        origin: location.origin,
        executionUrl,
        toolName,
        errorCode: 'webmcp-execution-failed',
      };
    }
    let result;
    if (typeof rawResult === 'string') {
      if (rawResult.length > 262_144) {
        return {
          origin: location.origin,
          executionUrl,
          toolName,
          errorCode: 'webmcp-result-oversized',
        };
      }
      try {
        result = JSON.parse(rawResult);
      } catch {
        return {
          origin: location.origin,
          executionUrl,
          toolName,
          errorCode: 'webmcp-result-malformed',
        };
      }
    } else {
      // Some transition-era implementations expose the callback's structured
      // value directly even while discovery schemas and inputs remain strings.
      // Accept that shape without retrying the one-use invocation.
      result = rawResult;
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return {
        origin: location.origin,
        executionUrl,
        toolName,
        errorCode: 'webmcp-result-invalid',
      };
    }
    try {
      const resultText = JSON.stringify(result);
      if (!resultText || resultText.length > 262_144) {
        return {
          origin: location.origin,
          executionUrl,
          toolName,
          errorCode: 'webmcp-result-oversized',
        };
      }
    } catch {
      return {
        origin: location.origin,
        executionUrl,
        toolName,
        errorCode: 'webmcp-result-invalid',
      };
    }
    return { origin: location.origin, executionUrl, toolName, result };
  })();
}

function readCurrentLocationInPage() {
  return location.href;
}

async function declarationDigest(tools) {
  const ordered = [...tools].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const bytes = new TextEncoder().encode(canonicalJson(ordered));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function observationFromInspection(inspection, previous) {
  const digest = await declarationDigest(inspection.tools);
  return {
    toolCount: inspection.tools.length,
    toolNames: inspection.tools
      .map((tool) => tool.name)
      .sort((left, right) => left.localeCompare(right)),
    observedAt: inspection.observedAt,
    digest,
    changed:
      previous?.changed === true ||
      (typeof previous?.digest === 'string' && previous.digest !== digest),
  };
}

async function inspectPairedWebMcp(tabId, connection, navigationUrl) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, documentIds: [connection.documentId] },
    world: 'MAIN',
    func: inspectModelContextInMainWorld,
    args: [navigationUrl, connection.pageUrl],
  });
  const entry = exactTopFrameResult(injected, connection.documentId);
  return sanitizeInspectionPayload(
    entry.result,
    connection.origin,
    connection.pageUrl,
    navigationUrl,
  );
}

async function isExpectedCapabilityRetirement(tabId, connection, inspection) {
  if (
    inspection.tools.length !== 0 ||
    connection.lastCommand !== 'invoke-approved-capability' ||
    connection.lastError ||
    typeof connection.lastPollAt !== 'string' ||
    connection.observation?.changed !== false ||
    connection.observation?.toolCount !== 1 ||
    !Array.isArray(connection.observation?.toolNames) ||
    connection.observation.toolNames.length !== 1
  ) {
    return false;
  }
  const stored = await getCapabilityPermit();
  const status = publicCapabilityPermitStatus(stored);
  return (
    status.imported === true &&
    typeof status.consumedAt === 'string' &&
    stored?.consumedDocumentId === connection.documentId &&
    permitBindingMatchesConnection(stored, tabId, connection) &&
    connection.observation.toolNames[0] === status.toolName
  );
}

async function observePairedWebMcp(tabId, connection, navigationUrl) {
  const inspection = await inspectPairedWebMcp(
    tabId,
    connection,
    navigationUrl,
  );
  const previous = (await isExpectedCapabilityRetirement(
    tabId,
    connection,
    inspection,
  ))
    ? undefined
    : connection.observation;
  const observation = await observationFromInspection(inspection, previous);
  return (
    (await updateConnectionStatus(
      tabId,
      {
        observation,
      },
      connection,
    )) ?? connection
  );
}

function connectionStorageKey(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error('The tab identity is invalid.');
  }
  return `${CONNECTION_STORAGE_PREFIX}${tabId}`;
}

function sameConnectionIdentity(connection, expectedConnection) {
  return (
    isPlainRecord(connection) &&
    isPlainRecord(expectedConnection) &&
    connection.sessionId === expectedConnection.sessionId &&
    connection.bridgeToken === expectedConnection.bridgeToken &&
    connection.connectorBase === expectedConnection.connectorBase &&
    connection.origin === expectedConnection.origin &&
    connection.pageUrl === expectedConnection.pageUrl &&
    connection.documentId === expectedConnection.documentId &&
    connection.frameId === expectedConnection.frameId
  );
}

function withConnectionMutation(tabId, operation) {
  const key = connectionStorageKey(tabId);
  const previous = connectionMutationQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  connectionMutationQueues.set(key, current);
  return current.finally(() => {
    if (connectionMutationQueues.get(key) === current) {
      connectionMutationQueues.delete(key);
    }
  });
}

async function getConnection(tabId) {
  const key = connectionStorageKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return isPlainRecord(stored[key]) ? stored[key] : undefined;
}

async function putConnection(tabId, connection) {
  return withConnectionMutation(tabId, async () => {
    if (closedTabs.has(tabId)) {
      throw new Error('The selected tab closed before pairing completed.');
    }
    await chrome.storage.local.set({
      [connectionStorageKey(tabId)]: connection,
    });
    return connection;
  });
}

async function removeConnection(tabId, expectedConnection) {
  return withConnectionMutation(tabId, async () => {
    if (expectedConnection) {
      const connection = await getConnection(tabId);
      if (!sameConnectionIdentity(connection, expectedConnection)) return false;
    }
    await chrome.storage.local.remove(connectionStorageKey(tabId));
    return true;
  });
}

function withCapabilityPermitMutation(operation) {
  const current = capabilityPermitMutation
    .catch(() => undefined)
    .then(operation);
  capabilityPermitMutation = current;
  return current;
}

async function getCapabilityPermit() {
  const stored = await chrome.storage.local.get(CAPABILITY_PERMIT_STORAGE_KEY);
  return isPlainRecord(stored[CAPABILITY_PERMIT_STORAGE_KEY])
    ? stored[CAPABILITY_PERMIT_STORAGE_KEY]
    : undefined;
}

async function getConsumedPermitTombstones(nowMs = Date.now()) {
  const stored = await chrome.storage.local.get(
    CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY,
  );
  const value = stored[CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CONSUMED_PERMIT_TOMBSTONES) {
    throw new Error('The consumed capability-permit history is invalid.');
  }
  const seen = new Set();
  const active = [];
  for (const entry of value) {
    if (
      !isPlainRecord(entry) ||
      Object.keys(entry).length !== 2 ||
      typeof entry.digest !== 'string' ||
      !SHA256_PATTERN.test(entry.digest) ||
      typeof entry.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.expiresAt)) ||
      seen.has(entry.digest)
    ) {
      throw new Error('The consumed capability-permit history is invalid.');
    }
    seen.add(entry.digest);
    if (Date.parse(entry.expiresAt) > nowMs) {
      active.push({ digest: entry.digest, expiresAt: entry.expiresAt });
    }
  }
  return active;
}

function appendConsumedPermitTombstone(tombstones, digest, expiresAt) {
  if (tombstones.some((entry) => entry.digest === digest)) {
    throw new Error('That capability permit was already consumed.');
  }
  if (tombstones.length >= MAX_CONSUMED_PERMIT_TOMBSTONES) {
    throw new Error('The consumed capability-permit history is full.');
  }
  return [...tombstones, { digest, expiresAt }];
}

function preserveConsumedPermitTombstone(current, tombstones) {
  if (!isPlainRecord(current) || typeof current.consumedAt !== 'string') {
    return tombstones;
  }
  if (
    typeof current.digest !== 'string' ||
    !SHA256_PATTERN.test(current.digest) ||
    !isPlainRecord(current.envelope) ||
    !isPlainRecord(current.envelope.payload) ||
    typeof current.envelope.payload.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(current.envelope.payload.expiresAt))
  ) {
    throw new Error('The consumed capability-permit history is invalid.');
  }
  return tombstones.some((entry) => entry.digest === current.digest)
    ? tombstones
    : appendConsumedPermitTombstone(
        tombstones,
        current.digest,
        current.envelope.payload.expiresAt,
      );
}

function importablePermitTombstones(current, tombstones, digest) {
  if (isPlainRecord(current) && current.consumedAt === null) {
    const currentStatus = publicCapabilityPermitStatus(current);
    const currentExpiry = Date.parse(currentStatus.expiresAt ?? '');
    if (!currentStatus.imported || !Number.isFinite(currentExpiry)) {
      throw new Error('The stored capability permit is invalid.');
    }
    if (currentExpiry > Date.now()) {
      throw new Error(
        'Remove the current unused capability permit before importing another.',
      );
    }
  }
  const preserved = preserveConsumedPermitTombstone(current, tombstones);
  if (preserved.some((entry) => entry.digest === digest)) {
    throw new Error('That capability permit was already consumed.');
  }
  return preserved;
}

function permitDocumentBinding(tabId, connection) {
  if (
    !Number.isInteger(tabId) ||
    tabId < 0 ||
    !isPlainRecord(connection) ||
    !isDocumentId(connection.documentId) ||
    connection.frameId !== 0 ||
    !isBridgeCommandId(connection.sessionId)
  ) {
    throw new Error('The capability permit document binding is invalid.');
  }
  return {
    schemaVersion: PERMIT_DOCUMENT_BINDING_SCHEMA,
    tabId,
    documentId: connection.documentId,
    frameId: 0,
    bridgeSessionId: connection.sessionId,
  };
}

function validPermitDocumentBinding(binding) {
  return (
    hasExactKeys(binding, [
      'bridgeSessionId',
      'documentId',
      'frameId',
      'schemaVersion',
      'tabId',
    ]) &&
    binding.schemaVersion === PERMIT_DOCUMENT_BINDING_SCHEMA &&
    Number.isInteger(binding.tabId) &&
    binding.tabId >= 0 &&
    isDocumentId(binding.documentId) &&
    binding.frameId === 0 &&
    isBridgeCommandId(binding.bridgeSessionId)
  );
}

function permitBindingTargetsTab(stored, tabId) {
  const binding = stored?.documentBinding;
  return validPermitDocumentBinding(binding) && binding.tabId === tabId;
}

function permitBindingMatchesConnection(stored, tabId, connection) {
  const binding = stored?.documentBinding;
  return (
    validPermitDocumentBinding(binding) &&
    binding.tabId === tabId &&
    binding.documentId === connection?.documentId &&
    binding.frameId === connection?.frameId &&
    binding.bridgeSessionId === connection?.sessionId
  );
}

async function importCapabilityPermit(
  text,
  tabId,
  expectedConnection,
  expectedNavigationUrl,
) {
  const validated = await validateCapabilityPermitText(text);
  if (
    validated.summary.origin !== expectedConnection.origin ||
    validated.summary.pageUrl !== expectedConnection.pageUrl
  ) {
    throw new Error(
      'The capability permit does not match the paired browser document.',
    );
  }
  const [preflightCurrent, preflightTombstones] = await Promise.all([
    getCapabilityPermit(),
    getConsumedPermitTombstones(),
  ]);
  importablePermitTombstones(
    preflightCurrent,
    preflightTombstones,
    validated.digest,
  );
  const inspection = await inspectPairedWebMcp(
    tabId,
    expectedConnection,
    expectedNavigationUrl,
  );
  const expectedToolName = validated.envelope.payload.capability.toolName;
  if (
    inspection.tools.length !== 1 ||
    inspection.tools[0].name !== expectedToolName
  ) {
    throw new Error(
      'The capability permit requires one exact current page declaration.',
    );
  }
  const declaration = inspection.tools[0];
  await verifyStoredCapabilityPermit(
    {
      envelope: validated.envelope,
      digest: validated.digest,
      consumedAt: null,
    },
    {
      origin: expectedConnection.origin,
      pageUrl: expectedConnection.pageUrl,
      toolName: declaration.name,
      title: declaration.title,
      description: declaration.description,
      arguments: {},
      inputSchema: declaration.inputSchema,
      annotations: declaration.annotations,
    },
  );
  const observation = await observationFromInspection(inspection, undefined);
  const documentBinding = permitDocumentBinding(tabId, expectedConnection);
  return withCapabilityPermitMutation(async () => {
    return withConnectionMutation(tabId, async () => {
      const [connection, current, tombstones] = await Promise.all([
        getConnection(tabId),
        getCapabilityPermit(),
        getConsumedPermitTombstones(),
      ]);
      if (
        closedTabs.has(tabId) ||
        !sameConnectionIdentity(connection, expectedConnection)
      ) {
        throw new Error(
          'The paired browser document changed before permit handoff.',
        );
      }
      const preservedTombstones = importablePermitTombstones(
        current,
        tombstones,
        validated.digest,
      );
      const stored = {
        schemaVersion: 'leftout.extension-capability-permit/1',
        envelope: validated.envelope,
        digest: validated.digest,
        importedAt: new Date().toISOString(),
        consumedAt: null,
        consumedDocumentId: null,
        documentBinding,
      };
      await chrome.storage.local.set({
        [CAPABILITY_PERMIT_STORAGE_KEY]: stored,
        [CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY]: preservedTombstones,
        [connectionStorageKey(tabId)]: { ...connection, observation },
      });
      return publicCapabilityPermitStatus(stored);
    });
  });
}

async function clearBoundCapabilityPermit(tabId, expectedConnection) {
  return withCapabilityPermitMutation(async () => {
    const [current, tombstones] = await Promise.all([
      getCapabilityPermit(),
      getConsumedPermitTombstones(),
    ]);
    if (
      !isPlainRecord(current) ||
      (expectedConnection
        ? !permitBindingMatchesConnection(current, tabId, expectedConnection)
        : !permitBindingTargetsTab(current, tabId))
    ) {
      return false;
    }
    const updated = preserveConsumedPermitTombstone(current, tombstones);
    if (updated !== tombstones) {
      await chrome.storage.local.set({
        [CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY]: updated,
      });
    }
    await chrome.storage.local.remove(CAPABILITY_PERMIT_STORAGE_KEY);
    return true;
  });
}

async function removeCapabilityPermit() {
  await withCapabilityPermitMutation(async () => {
    const [current, tombstones] = await Promise.all([
      getCapabilityPermit(),
      getConsumedPermitTombstones(),
    ]);
    const updated = preserveConsumedPermitTombstone(current, tombstones);
    if (updated !== tombstones) {
      await chrome.storage.local.set({
        [CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY]: updated,
      });
    }
    await chrome.storage.local.remove(CAPABILITY_PERMIT_STORAGE_KEY);
  });
  return { imported: false };
}

async function consumeCapabilityPermit(
  context,
  tabId,
  connection,
  commandIssuedAt,
) {
  return withCapabilityPermitMutation(async () => {
    const [stored, tombstones] = await Promise.all([
      getCapabilityPermit(),
      getConsumedPermitTombstones(),
    ]);
    const verified = await verifyStoredCapabilityPermit(stored, context);
    if (!permitBindingMatchesConnection(stored, tabId, connection)) {
      throw new Error(
        'The capability permit is not bound to this browser document and bridge session.',
      );
    }
    const importedAtMs = Date.parse(stored.importedAt ?? '');
    const commandIssuedAtMs = Date.parse(commandIssuedAt ?? '');
    if (
      !Number.isFinite(importedAtMs) ||
      !Number.isFinite(commandIssuedAtMs) ||
      commandIssuedAtMs < importedAtMs
    ) {
      throw new Error(
        'The invocation command predates this document-bound capability permit.',
      );
    }
    const updatedTombstones = appendConsumedPermitTombstone(
      tombstones,
      verified.digest,
      verified.payload.expiresAt,
    );
    const consumedAt = new Date().toISOString();
    const consumed = {
      ...stored,
      consumedAt,
      consumedDocumentId: connection.documentId,
    };
    await chrome.storage.local.set({
      [CAPABILITY_PERMIT_STORAGE_KEY]: consumed,
      [CAPABILITY_PERMIT_CONSUMED_STORAGE_KEY]: updatedTombstones,
    });
    return {
      evidence: { sha256: verified.digest, consumedAt },
      expectedDeclaration: {
        title: verified.payload.capability.title,
        description: verified.payload.capability.description,
        inputSchema: verified.payload.capability.inputSchema,
        annotations: verified.payload.capability.annotations,
      },
    };
  });
}

function publicStatus(connection) {
  if (!connection) return { paired: false };
  return {
    paired: true,
    origin: connection.origin,
    pageUrl: connection.pageUrl,
    connectorBase: connection.connectorBase,
    sessionId: connection.sessionId,
    pairedAt: connection.pairedAt,
    lastPollAt: connection.lastPollAt ?? null,
    lastCommand: connection.lastCommand ?? null,
    lastError: connection.lastError ?? null,
  };
}

async function publicStatusWithPermit(connection, tabId) {
  const stored = await getCapabilityPermit();
  const capabilityPermit = {
    ...publicCapabilityPermitStatus(stored),
    boundToCurrentDocument:
      Number.isInteger(tabId) &&
      permitBindingMatchesConnection(stored, tabId, connection),
  };
  return {
    ...publicStatus(connection),
    capabilityPermit,
    hud: buildHudModel({ connection, permit: capabilityPermit }),
  };
}

async function setBadge(tabId, state) {
  const badge =
    state === 'protected'
      ? {
          text: '1',
          color: '#176b4b',
          title: 'One exact WebMCP action is guarded',
        }
      : state === 'detected'
        ? {
            text: 'MCP',
            color: '#a16207',
            title: 'WebMCP detected · not protected',
          }
        : state === 'changed'
          ? {
              text: 'Δ',
              color: '#b45309',
              title: 'WebMCP declarations changed',
            }
          : state === 'receipt'
            ? { text: 'R', color: '#0f766e', title: 'WebMCP receipt recorded' }
            : state === 'none-observed'
              ? {
                  text: '0',
                  color: '#475569',
                  title: 'No WebMCP actions observed',
                }
              : state === 'paired' || state === 'checking'
                ? {
                    text: '…',
                    color: '#475569',
                    title: 'Checking this page for WebMCP',
                  }
                : state === 'error'
                  ? {
                      text: '!',
                      color: '#a33a2b',
                      title: 'WebMCP protection paused',
                    }
                  : {
                      text: '',
                      color: '#000000',
                      title: 'LeftOut WebMCP safety',
                    };
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: badge.color,
  });
  await chrome.action.setBadgeText({ tabId, text: badge.text });
  await chrome.action.setTitle?.({ tabId, title: badge.title });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${label} returned non-JSON data.`);
  }
  if (!response.ok) {
    const detail =
      value && typeof value.error === 'string'
        ? value.error.slice(0, 300)
        : `${response.status} ${response.statusText}`;
    throw new Error(`${label} rejected the request: ${detail}`);
  }
  return value;
}

async function activeTab(expectedTabId) {
  const tab = await chrome.tabs.get(expectedTabId);
  if (
    !tab ||
    typeof tab.id !== 'number' ||
    tab.id !== expectedTabId ||
    tab.active !== true ||
    typeof tab.url !== 'string'
  ) {
    throw new Error('The selected active tab changed. Reopen the popup.');
  }
  return tab;
}

function exactTopFrameResult(injected, expectedDocumentId) {
  if (!Array.isArray(injected) || injected.length !== 1) {
    throw new Error('The browser returned an ambiguous document result.');
  }
  const entry = injected[0];
  if (
    !entry ||
    typeof entry !== 'object' ||
    entry.frameId !== 0 ||
    !isDocumentId(entry.documentId) ||
    (expectedDocumentId !== undefined &&
      entry.documentId !== expectedDocumentId)
  ) {
    throw new Error('The browser returned a mismatched document identity.');
  }
  return entry;
}

async function captureActiveDocument(tab) {
  const visiblePage = pageIdentityFromUrl(tab.url);
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    func: readCurrentLocationInPage,
  });
  const entry = exactTopFrameResult(injected);
  const page = pageIdentityFromUrl(entry.result);
  if (!connectionMatchesPage(visiblePage, page)) {
    throw new Error('The selected tab navigated. Reopen the popup.');
  }
  return Object.freeze({
    ...page,
    navigationUrl: new URL(entry.result).toString(),
    documentId: entry.documentId,
    frameId: 0,
  });
}

async function probePairedDocument(tabId, connection) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, documentIds: [connection.documentId] },
    func: readCurrentLocationInPage,
  });
  const entry = exactTopFrameResult(injected, connection.documentId);
  const page = pageIdentityFromUrl(entry.result);
  return connectionMatchesDocument(connection, {
    ...page,
    documentId: entry.documentId,
    frameId: entry.frameId,
  });
}

async function pairActiveTab(message) {
  if (!Number.isInteger(message.tabId)) {
    throw new Error('The popup did not identify an active tab.');
  }
  const tab = await activeTab(message.tabId);
  closedTabs.delete(tab.id);
  const page = await captureActiveDocument(tab);
  const connectorBase = normalizeConnectorBase(message.connectorBase);
  const pairIdentity = {
    origin: page.origin,
    page_url: page.pageUrl,
    client_label: CLIENT_LABEL,
  };
  let credential;
  if (typeof message.pairCode === 'string' && message.pairCode.trim()) {
    credential = { pair_code: normalizePairCode(message.pairCode) };
  } else {
    const challengeResponse = await fetchWithTimeout(
      `${connectorBase}/bridge/challenge`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pairIdentity),
      },
    );
    const challenge = sanitizePairChallengeResponse(
      await parseJsonResponse(challengeResponse, 'Pairing challenge'),
    );
    credential = { challenge_token: challenge.challengeToken };
  }
  const response = await fetchWithTimeout(`${connectorBase}/bridge/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...credential,
      ...pairIdentity,
    }),
  });
  const paired = sanitizePairResponse(
    await parseJsonResponse(response, 'Pairing'),
    page.origin,
  );
  const connection = {
    connectorBase,
    sessionId: paired.sessionId,
    bridgeToken: paired.bridgeToken,
    origin: paired.origin,
    pageUrl: page.pageUrl,
    documentId: page.documentId,
    frameId: page.frameId,
    pairedAt: paired.pairedAt,
    lastPollAt: null,
    lastCommand: null,
    lastError: null,
  };
  await putConnection(tab.id, connection);
  try {
    const attached = await chrome.scripting.executeScript({
      target: { tabId: tab.id, documentIds: [page.documentId] },
      files: ['content-script.js'],
    });
    exactTopFrameResult(attached, page.documentId);
  } catch (error) {
    await revokeConnection(connection).catch(() => undefined);
    await removeConnection(tab.id, connection);
    throw new Error(
      `Pairing could not attach to the tab: ${safeErrorMessage(error)}`,
    );
  }
  await setBadge(tab.id, 'checking');
  let observedConnection = connection;
  try {
    observedConnection = await observePairedWebMcp(
      tab.id,
      connection,
      new URL(tab.url).toString(),
    );
  } catch (error) {
    observedConnection =
      (await updateConnectionStatus(
        tab.id,
        { lastError: safeErrorMessage(error) },
        connection,
      )) ?? connection;
  }
  return publicStatusWithPermit(observedConnection, tab.id);
}

async function updateConnectionStatus(tabId, patch, expectedConnection) {
  const updated = await withConnectionMutation(tabId, async () => {
    if (closedTabs.has(tabId)) return undefined;
    const connection = await getConnection(tabId);
    if (
      closedTabs.has(tabId) ||
      !connection ||
      (expectedConnection &&
        !sameConnectionIdentity(connection, expectedConnection))
    ) {
      return undefined;
    }
    const next = { ...connection, ...patch };
    if (patch.pendingCompletion === null) delete next.pendingCompletion;
    await chrome.storage.local.set({
      [connectionStorageKey(tabId)]: next,
    });
    return next;
  });
  if (!updated) return undefined;
  const status = await publicStatusWithPermit(updated, tabId);
  await setBadge(tabId, status.hud.state);
  return updated;
}

function bridgeHeaders(connection, includeJson = false) {
  return {
    authorization: `Bearer ${connection.bridgeToken}`,
    ...(includeJson ? { 'content-type': 'application/json' } : {}),
  };
}

async function revokeConnection(connection) {
  const url = new URL('/bridge/revoke', connection.connectorBase);
  url.searchParams.set('session_id', connection.sessionId);
  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: bridgeHeaders(connection, true),
    body: '{}',
  });
  const acknowledgement = await parseJsonResponse(response, 'Disconnect');
  if (!isPlainRecord(acknowledgement) || acknowledgement.revoked !== true) {
    throw new Error('Disconnect returned an invalid acknowledgement.');
  }
}

async function openActiveReports(message) {
  if (!Number.isInteger(message.tabId)) {
    throw new Error('The popup did not identify an active tab.');
  }
  const tab = await activeTab(message.tabId);
  const connection = await getConnection(tab.id);
  if (!connection) throw new Error('Pair this tab before opening reports.');
  const url = new URL('/bridge/report-link', connection.connectorBase);
  url.searchParams.set('session_id', connection.sessionId);
  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: bridgeHeaders(connection),
  });
  const launch = sanitizeReportLaunchResponse(
    await parseJsonResponse(response, 'Report link'),
    connection.connectorBase,
  );
  await chrome.tabs.create({ url: launch.reportUrl, active: true });
  return { opened: true };
}

function requirePopupSender(sender) {
  const popupUrl = chrome.runtime.getURL('popup.html');
  if (
    sender?.id !== chrome.runtime.id ||
    sender?.url !== popupUrl ||
    sender.tab !== undefined
  ) {
    throw new Error('Only the extension popup may perform this operation.');
  }
}

async function importCapabilityPermitFromPopup(message) {
  if (
    !hasExactKeys(message, ['tabId', 'text', 'type']) ||
    !Number.isInteger(message.tabId) ||
    typeof message.text !== 'string'
  ) {
    throw new Error('The capability permit import request is invalid.');
  }
  const tab = await activeTab(message.tabId);
  const connection = await getConnection(tab.id);
  if (!connection) {
    throw new Error('Connect this tab before importing a capability permit.');
  }
  const currentDocument = await captureActiveDocument(tab);
  if (!connectionMatchesDocument(connection, currentDocument)) {
    throw new Error(
      'The capability permit cannot be bound because the paired document changed.',
    );
  }
  return importCapabilityPermit(
    message.text,
    tab.id,
    connection,
    currentDocument.navigationUrl,
  );
}

async function acceptPageCapabilityPermit(message, sender) {
  if (
    !hasExactKeys(message, ['text', 'type']) ||
    typeof message.text !== 'string'
  ) {
    throw new Error('The page capability-permit handoff is invalid.');
  }
  const senderDocument = documentIdentityFromSender(sender);
  const tabId = sender.tab.id;
  const connection = await getConnection(tabId);
  if (
    closedTabs.has(tabId) ||
    !connection ||
    !connectionMatchesDocument(connection, senderDocument)
  ) {
    throw new Error(
      'The page capability permit did not come from the exact paired document.',
    );
  }

  // Page data is not approval evidence. Validation can only narrow the fixed
  // closed synthetic-lesson policy and extension-created browser/session binding.
  await importCapabilityPermit(
    message.text,
    tabId,
    connection,
    senderDocument.navigationUrl,
  );
  const currentConnection = await getConnection(tabId);
  const status = await publicStatusWithPermit(currentConnection, tabId);
  await setBadge(tabId, status.hud.state);
  return { accepted: true };
}

async function executePageCommand(
  tabId,
  connection,
  command,
  expectedNavigationUrl,
) {
  const target = {
    tabId,
    documentIds: [connection.documentId],
  };
  if (command.kind === 'inspect-tools') {
    const injected = await chrome.scripting.executeScript({
      target,
      world: 'MAIN',
      func: inspectModelContextInMainWorld,
      args: [expectedNavigationUrl, connection.pageUrl],
    });
    const entry = exactTopFrameResult(injected, connection.documentId);
    return sanitizeInspectionPayload(
      entry.result,
      connection.origin,
      connection.pageUrl,
      expectedNavigationUrl,
    );
  }

  if (
    command.kind !== 'invoke-approved-capability' ||
    !APPROVED_CAPABILITY_TOOL_PATTERN.test(command.toolName) ||
    Object.keys(command.arguments).length !== 0
  ) {
    throw new Error(
      'The command is outside the extension synthetic-lesson invocation policy.',
    );
  }
  const inspection = await chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    func: inspectModelContextInMainWorld,
    args: [expectedNavigationUrl, connection.pageUrl],
  });
  const inspectedEntry = exactTopFrameResult(inspection, connection.documentId);
  const inspected = sanitizeInspectionPayload(
    inspectedEntry.result,
    connection.origin,
    connection.pageUrl,
    expectedNavigationUrl,
  );
  const matches = inspected.tools.filter(
    (tool) => tool.name === command.toolName,
  );
  if (inspected.tools.length !== 1 || matches.length !== 1) {
    throw new Error(
      'The approved capability permit requires one exact registered declaration.',
    );
  }
  const declaration = matches[0];
  const consumedPermit = await consumeCapabilityPermit(
    {
      origin: connection.origin,
      pageUrl: connection.pageUrl,
      toolName: command.toolName,
      title: declaration.title,
      description: declaration.description,
      arguments: command.arguments,
      inputSchema: declaration.inputSchema,
      annotations: declaration.annotations,
    },
    tabId,
    connection,
    command.issuedAt,
  );
  const injected = await chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    func: invokeApprovedCapabilityInMainWorld,
    args: [
      command.toolName,
      expectedNavigationUrl,
      connection.pageUrl,
      consumedPermit.expectedDeclaration,
    ],
  });
  const entry = exactTopFrameResult(injected, connection.documentId);
  return {
    ...sanitizeInvocationPayload(
      entry.result,
      connection.origin,
      connection.pageUrl,
      expectedNavigationUrl,
      command.toolName,
    ),
    permit: consumedPermit.evidence,
  };
}

async function postCommandResult(connection, result) {
  const url = new URL('/bridge/result', connection.connectorBase);
  url.searchParams.set('session_id', connection.sessionId);
  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: bridgeHeaders(connection, true),
    body: JSON.stringify(result),
  });
  const acknowledgement = await parseJsonResponse(response, 'Result delivery');
  if (!isPlainRecord(acknowledgement) || acknowledgement.accepted !== true) {
    throw new Error('Result delivery returned an invalid acknowledgement.');
  }
}

async function deliverPendingCompletion(tabId, connection) {
  if (connection.pendingCompletion === undefined) return false;
  let completion;
  try {
    completion = sanitizePendingCompletion(
      connection.pendingCompletion,
      connection.origin,
    );
  } catch (error) {
    await revokeConnection(connection).catch(() => undefined);
    await removeConnection(tabId, connection);
    await setBadge(tabId, 'idle');
    throw new Error(
      `The saved result cannot be delivered safely: ${safeErrorMessage(error)}`,
    );
  }

  await postCommandResult(connection, completion);
  await updateConnectionStatus(
    tabId,
    {
      pendingCompletion: null,
      lastPollAt: new Date().toISOString(),
      lastError: completion.ok ? null : completion.error,
    },
    connection,
  );
  return true;
}

async function requireCurrentConnection(tabId, expectedConnection) {
  const connection = await getConnection(tabId);
  if (!sameConnectionIdentity(connection, expectedConnection)) {
    throw new Error('The tab pairing changed before command execution.');
  }
  return connection;
}

async function pollConnector(tabId, senderDocument) {
  if (pollLocks.has(tabId)) return;
  pollLocks.add(tabId);
  let expectedConnection;
  try {
    const connection = await getConnection(tabId);
    if (!connection) return;
    expectedConnection = connection;
    if (!connectionMatchesDocument(connection, senderDocument)) {
      await revokeConnection(connection).catch(() => undefined);
      await removeConnection(tabId, connection);
      await setBadge(tabId, 'idle');
      throw new Error(
        'The paired tab navigated; pair the new document explicitly.',
      );
    }

    if (await deliverPendingCompletion(tabId, connection)) return;

    const pollUrl = new URL('/bridge/poll', connection.connectorBase);
    pollUrl.searchParams.set('session_id', connection.sessionId);
    const response = await fetchWithTimeout(pollUrl.toString(), {
      method: 'GET',
      headers: bridgeHeaders(connection),
    });
    if (response.status === 204) {
      await updateConnectionStatus(
        tabId,
        {
          lastPollAt: new Date().toISOString(),
        },
        connection,
      );
      return;
    }

    let rawCommand;
    try {
      rawCommand = await parseJsonResponse(response, 'Connector poll');
    } catch (error) {
      await updateConnectionStatus(
        tabId,
        {
          lastError: safeErrorMessage(error),
        },
        connection,
      );
      return;
    }

    let command;
    try {
      command = sanitizeBridgeCommand(rawCommand);
      const issuedAge = Date.now() - Date.parse(command.issuedAt);
      if (issuedAge < -5_000 || issuedAge > 60_000) {
        throw new Error(
          'The connector command is outside the freshness window.',
        );
      }
    } catch (error) {
      const commandId =
        rawCommand && isBridgeCommandId(rawCommand.command_id)
          ? rawCommand.command_id
          : null;
      if (commandId) {
        const completion = sanitizePendingCompletion(
          {
            command_id: commandId,
            observed_at: new Date().toISOString(),
            observed_origin: connection.origin,
            ok: false,
            error: safeErrorMessage(error),
          },
          connection.origin,
        );
        const pendingConnection = await updateConnectionStatus(
          tabId,
          {
            pendingCompletion: completion,
            lastCommand: 'rejected-command',
            lastError: safeErrorMessage(error),
          },
          connection,
        );
        if (!pendingConnection) return;
        await postCommandResult(pendingConnection, completion);
        await updateConnectionStatus(
          tabId,
          {
            pendingCompletion: null,
            lastPollAt: new Date().toISOString(),
            lastError: safeErrorMessage(error),
          },
          pendingConnection,
        );
      }
      if (!commandId) {
        await updateConnectionStatus(
          tabId,
          { lastError: safeErrorMessage(error) },
          connection,
        );
      }
      return;
    }

    let completion;
    let observation;
    try {
      const currentConnection = await requireCurrentConnection(
        tabId,
        connection,
      );
      if (!connectionMatchesDocument(currentConnection, senderDocument)) {
        throw new Error('The paired tab navigated before command execution.');
      }
      const payload = await executePageCommand(
        tabId,
        currentConnection,
        command,
        senderDocument.navigationUrl,
      );
      observation =
        command.kind === 'inspect-tools'
          ? await observationFromInspection(payload, connection.observation)
          : undefined;
      completion = {
        command_id: command.commandId,
        observed_at: new Date().toISOString(),
        observed_origin: payload.origin,
        ok: true,
        payload,
      };
    } catch (error) {
      completion = {
        command_id: command.commandId,
        observed_at: new Date().toISOString(),
        observed_origin: connection.origin,
        ok: false,
        error: safeErrorMessage(error),
      };
    }
    completion = sanitizePendingCompletion(completion, connection.origin);
    const pendingConnection = await updateConnectionStatus(
      tabId,
      {
        pendingCompletion: completion,
        lastCommand: command.kind,
        lastError: completion.ok ? null : completion.error,
        ...(observation ? { observation } : {}),
      },
      connection,
    );
    if (!pendingConnection) return;
    await postCommandResult(pendingConnection, completion);
    await updateConnectionStatus(
      tabId,
      {
        pendingCompletion: null,
        lastPollAt: new Date().toISOString(),
        lastCommand: command.kind,
        lastError: completion.ok ? null : completion.error,
      },
      pendingConnection,
    );
  } catch (error) {
    await updateConnectionStatus(
      tabId,
      { lastError: safeErrorMessage(error) },
      expectedConnection,
    );
  } finally {
    pollLocks.delete(tabId);
  }
}

function documentIdentityFromSender(sender) {
  if (
    !sender.tab ||
    typeof sender.tab.id !== 'number' ||
    sender.frameId !== 0 ||
    !isDocumentId(sender.documentId) ||
    typeof sender.url !== 'string'
  ) {
    throw new Error(
      'Bridge polling must come from the paired top-level document.',
    );
  }
  return {
    ...pageIdentityFromUrl(sender.url),
    navigationUrl: new URL(sender.url).toString(),
    documentId: sender.documentId,
    frameId: sender.frameId,
  };
}

async function tickBridge(tabId, senderDocument) {
  let connection = await getConnection(tabId);
  if (!connection) {
    return { completed: true, hud: buildHudModel({}) };
  }
  if (!connectionMatchesDocument(connection, senderDocument)) {
    closedTabs.add(tabId);
    await revokeConnection(connection).catch(() => undefined);
    await clearBoundCapabilityPermit(tabId, connection);
    await removeConnection(tabId, connection);
    await setBadge(tabId, 'idle');
    return { completed: true, hud: buildHudModel({}) };
  }
  await pollConnector(tabId, senderDocument);
  connection = await getConnection(tabId);
  if (!connection) {
    return { completed: true, hud: buildHudModel({}) };
  }
  const observedAt = Date.parse(connection.observation?.observedAt ?? '');
  if (
    !connection.pendingCompletion &&
    !connection.lastError &&
    (!Number.isFinite(observedAt) ||
      Date.now() - observedAt >= OBSERVATION_INTERVAL_MS)
  ) {
    try {
      connection = await observePairedWebMcp(
        tabId,
        connection,
        senderDocument.navigationUrl,
      );
    } catch (error) {
      connection =
        (await updateConnectionStatus(
          tabId,
          { lastError: safeErrorMessage(error) },
          connection,
        )) ?? connection;
    }
  }
  const current = await getConnection(tabId);
  const status = await publicStatusWithPermit(current, tabId);
  return { completed: true, hud: status.hud };
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') {
    throw new Error('Invalid extension message.');
  }
  if (message.type === 'pair-active-tab') {
    requirePopupSender(sender);
    return pairActiveTab(message);
  }
  if (message.type === 'offer-capability-permit') {
    return acceptPageCapabilityPermit(message, sender);
  }
  if (message.type === 'import-capability-permit') {
    requirePopupSender(sender);
    return importCapabilityPermitFromPopup(message);
  }
  if (message.type === 'remove-capability-permit') {
    requirePopupSender(sender);
    return removeCapabilityPermit();
  }
  if (message.type === 'open-active-reports') {
    requirePopupSender(sender);
    return openActiveReports(message);
  }
  if (message.type === 'get-active-status') {
    if (!Number.isInteger(message.tabId)) return { paired: false };
    const tab = await activeTab(message.tabId);
    const connection = await getConnection(tab.id);
    if (!connection) return { paired: false };
    let page;
    try {
      page = pageIdentityFromUrl(tab.url);
    } catch {
      page = null;
    }
    let documentMatches = false;
    if (page && connectionMatchesPage(connection, page)) {
      try {
        documentMatches = await probePairedDocument(tab.id, connection);
      } catch {
        documentMatches = false;
      }
    }
    if (!documentMatches) {
      closedTabs.add(tab.id);
      await revokeConnection(connection).catch(() => undefined);
      await clearBoundCapabilityPermit(tab.id, connection);
      await removeConnection(tab.id, connection);
      await setBadge(tab.id, 'idle');
      return { paired: false };
    }
    return publicStatusWithPermit(connection, tab.id);
  }
  if (message.type === 'forget-active-tab') {
    requirePopupSender(sender);
    if (!Number.isInteger(message.tabId)) return { paired: false };
    const tab = await activeTab(message.tabId);
    const connection = await getConnection(tab.id);
    if (connection) {
      await revokeConnection(connection);
      await clearBoundCapabilityPermit(tab.id, connection);
      await removeConnection(tab.id, connection);
    }
    await setBadge(tab.id, 'idle');
    return publicStatusWithPermit(undefined, tab.id);
  }
  if (message.type === 'bridge-tick') {
    const senderDocument = documentIdentityFromSender(sender);
    return tickBridge(sender.tab.id, senderDocument);
  }
  throw new Error('Unsupported extension message.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({ ok: false, error: safeErrorMessage(error) }),
    );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  closedTabs.add(tabId);
  pollLocks.delete(tabId);
  void getConnection(tabId)
    .then(async (connection) => {
      if (connection) await revokeConnection(connection).catch(() => undefined);
      await clearBoundCapabilityPermit(tabId, connection);
      await removeConnection(tabId, connection);
    })
    .catch(() => undefined);
});

chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
  if (changeInfo?.status !== 'loading') return;
  closedTabs.add(tabId);
  pollLocks.delete(tabId);
  void getConnection(tabId)
    .then(async (connection) => {
      if (connection) await revokeConnection(connection).catch(() => undefined);
      await clearBoundCapabilityPermit(tabId, connection);
      await removeConnection(tabId, connection);
      await setBadge(tabId, 'idle');
    })
    .catch(() => undefined);
});
