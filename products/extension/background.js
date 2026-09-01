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
  sanitizePairResponse,
  sanitizePendingCompletion,
} from './validation.js';

const CONNECTION_STORAGE_PREFIX = 'leftoutBridgeConnectionV2:';
const CLIENT_LABEL = 'LeftOut Chrome capability bridge';
const FETCH_TIMEOUT_MS = 10_000;
const pollLocks = new Set();
const connectionMutationQueues = new Map();
const closedTabs = new Set();

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
    const approvedPattern = /^get_training_1042_eligibility_once_[0-9a-f]{16}$/;
    if (typeof toolName !== 'string' || !approvedPattern.test(toolName)) {
      throw new Error('The tool name is outside the Scenario 1 allowlist.');
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
      throw new Error('The approved generated tool is not registered.');

    const tool = matchingTools[0];

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
    const schemaKeys =
      schema && typeof schema === 'object' && !Array.isArray(schema)
        ? Object.keys(schema)
        : [];
    const zeroInputSchema =
      schema &&
      typeof schema === 'object' &&
      !Array.isArray(schema) &&
      schemaKeys.length === 4 &&
      schemaKeys.includes('type') &&
      schemaKeys.includes('properties') &&
      schemaKeys.includes('required') &&
      schemaKeys.includes('additionalProperties') &&
      schema.type === 'object' &&
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties) &&
      Object.keys(schema.properties).length === 0 &&
      Array.isArray(schema.required) &&
      schema.required.length === 0 &&
      schema.additionalProperties === false;
    if (!zeroInputSchema || tool.annotations?.readOnlyHint !== true) {
      throw new Error(
        'The generated tool is not the expected no-input read capability.',
      );
    }
    const executionUrl = assertPairedLocation();

    // Chrome's current WebMCP implementation accepts tool arguments as a JSON
    // string and returns a JSON string for structured callback results. The
    // bridge neither registers tools nor synthesizes approval: it can only call
    // the already registered, uniquely named grant with exactly {}.
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

async function setBadge(tabId, state) {
  const badge =
    state === 'paired'
      ? { text: 'ON', color: '#176b4b' }
      : state === 'error'
        ? { text: '!', color: '#a33a2b' }
        : { text: '', color: '#000000' };
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: badge.color,
  });
  await chrome.action.setBadgeText({ tabId, text: badge.text });
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    !tab ||
    typeof tab.id !== 'number' ||
    tab.id !== expectedTabId ||
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
  const pairCode = normalizePairCode(message.pairCode);
  const connectorBase = normalizeConnectorBase(message.connectorBase);
  const response = await fetchWithTimeout(`${connectorBase}/bridge/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pair_code: pairCode,
      origin: page.origin,
      page_url: page.pageUrl,
      client_label: CLIENT_LABEL,
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
    await removeConnection(tab.id, connection);
    throw new Error(
      `Pairing could not attach to the tab: ${safeErrorMessage(error)}`,
    );
  }
  await setBadge(tab.id, 'paired');
  return publicStatus(connection);
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
  await setBadge(tabId, updated.lastError ? 'error' : 'paired');
  return updated;
}

function bridgeHeaders(connection, includeJson = false) {
  return {
    authorization: `Bearer ${connection.bridgeToken}`,
    ...(includeJson ? { 'content-type': 'application/json' } : {}),
  };
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
    throw new Error('The command is outside the extension invocation policy.');
  }
  const injected = await chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    func: invokeApprovedCapabilityInMainWorld,
    args: [command.toolName, expectedNavigationUrl, connection.pageUrl],
  });
  const entry = exactTopFrameResult(injected, connection.documentId);
  return sanitizeInvocationPayload(
    entry.result,
    connection.origin,
    connection.pageUrl,
    expectedNavigationUrl,
    command.toolName,
  );
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

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') {
    throw new Error('Invalid extension message.');
  }
  if (message.type === 'pair-active-tab') return pairActiveTab(message);
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
      await removeConnection(tab.id, connection);
      await setBadge(tab.id, 'idle');
      return { paired: false };
    }
    return publicStatus(connection);
  }
  if (message.type === 'forget-active-tab') {
    if (!Number.isInteger(message.tabId)) return { paired: false };
    const tab = await activeTab(message.tabId);
    await removeConnection(tab.id);
    await setBadge(tab.id, 'idle');
    return { paired: false };
  }
  if (message.type === 'bridge-tick') {
    const senderDocument = documentIdentityFromSender(sender);
    await pollConnector(sender.tab.id, senderDocument);
    return { completed: true };
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
  const removal = chrome.storage.local.remove(connectionStorageKey(tabId));
  if (removal && typeof removal.catch === 'function') removal.catch(() => {});
});
