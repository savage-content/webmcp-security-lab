import { afterEach, describe, expect, it, vi } from 'vitest';

const CONNECTION_STORAGE_PREFIX = 'leftoutBridgeConnectionV2:';
const TAB_ID = 7;
const SECOND_TAB_ID = 8;
const ORIGIN = 'http://localhost:3000';
const PAGE_URL = 'http://localhost:3000/scenario-1';
const DOCUMENT_ID = '0f24795a-201d-4e3f-bf25-f7080dfe90af';
const OTHER_DOCUMENT_ID = 'ca1a5a19-c174-49cf-8f7b-fdf5556752ce';
const COMMAND_ID = '5af587fe-f44c-4ab0-8243-7b63d348f612';

type ExtensionResponse = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

type MessageListener = (
  message: unknown,
  sender: Record<string, unknown>,
  sendResponse: (response: ExtensionResponse) => void,
) => boolean;

function jsonResponse(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 202 ? 'Accepted' : 'OK',
    async json() {
      return structuredClone(value);
    },
  };
}

function baseConnection(overrides: Record<string, unknown> = {}) {
  return {
    connectorBase: 'http://127.0.0.1:8788',
    sessionId: '1420ef15-7b3f-4ed0-9e06-094245ca9bf2',
    bridgeToken: 'a'.repeat(43),
    origin: ORIGIN,
    pageUrl: PAGE_URL,
    documentId: DOCUMENT_ID,
    frameId: 0,
    pairedAt: '2026-09-01T12:00:00.000Z',
    lastPollAt: null,
    lastCommand: null,
    lastError: null,
    ...overrides,
  };
}

async function extensionHarness({
  activeUrl = PAGE_URL,
  connection = baseConnection(),
  initialConnections,
  executeScriptImplementation,
  fetchImplementation,
  storageGetImplementation,
}: {
  activeUrl?: string;
  connection?: ReturnType<typeof baseConnection> & {
    pendingCompletion?: Record<string, unknown>;
  };
  initialConnections?: Record<string, ReturnType<typeof baseConnection>>;
  executeScriptImplementation?: (
    details: Record<string, unknown>,
  ) => Promise<unknown>;
  fetchImplementation?: (...args: unknown[]) => unknown;
  storageGetImplementation?: (
    key: string,
    call: number,
    readSnapshot: () => Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
} = {}) {
  vi.resetModules();
  let listener: MessageListener | undefined;
  let removedListener: ((tabId: number) => void) | undefined;
  let storageGetCalls = 0;
  const storageValues: Record<string, unknown> = {};
  const connections = initialConnections ?? {
    [String(TAB_ID)]: connection,
  };
  for (const [tabId, value] of Object.entries(connections)) {
    storageValues[`${CONNECTION_STORAGE_PREFIX}${tabId}`] =
      structuredClone(value);
  }
  const storageSetCalls: Record<string, unknown>[] = [];
  const executeScript = vi.fn(async (details: Record<string, unknown>) => {
    if (executeScriptImplementation) {
      return executeScriptImplementation(details);
    }
    const target = details.target as { documentIds?: string[] } | undefined;
    const documentId = target?.documentIds?.[0] ?? DOCUMENT_ID;
    if (details.files) return [{ documentId, frameId: 0 }];
    return [
      {
        documentId,
        frameId: 0,
        result:
          details.world === 'MAIN'
            ? {
                origin: ORIGIN,
                executionUrl: activeUrl,
                observedAt: new Date().toISOString(),
                tools: [],
              }
            : activeUrl,
      },
    ];
  });
  const setBadgeText = vi.fn(async () => undefined);
  const chromeMock = {
    action: {
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setBadgeText,
    },
    runtime: {
      onMessage: {
        addListener(value: MessageListener) {
          listener = value;
        },
      },
    },
    scripting: { executeScript },
    storage: {
      local: {
        async get(key: string) {
          storageGetCalls += 1;
          const readSnapshot = () => {
            const value = storageValues[key];
            return {
              [key]: value === undefined ? undefined : structuredClone(value),
            };
          };
          return storageGetImplementation
            ? storageGetImplementation(key, storageGetCalls, readSnapshot)
            : readSnapshot();
        },
        async set(value: Record<string, unknown>) {
          storageSetCalls.push(structuredClone(value));
          for (const [key, entry] of Object.entries(value)) {
            storageValues[key] = structuredClone(entry);
          }
        },
        async remove(key: string) {
          delete storageValues[key];
        },
      },
    },
    tabs: {
      async query() {
        return [{ id: TAB_ID, url: activeUrl }];
      },
      onRemoved: {
        addListener(value: (tabId: number) => void) {
          removedListener = value;
        },
      },
    },
  };
  const fetchMock = vi.fn(fetchImplementation ?? (() => jsonResponse({}, 204)));
  vi.stubGlobal('chrome', chromeMock);
  vi.stubGlobal('fetch', fetchMock);
  await import('../products/extension/background.js');
  if (!listener)
    throw new Error('The extension did not register its listener.');

  const dispatch = (message: unknown, sender: Record<string, unknown> = {}) =>
    new Promise<ExtensionResponse>((resolve) => {
      expect(listener?.(message, sender, resolve)).toBe(true);
    });

  return {
    dispatch,
    executeScript,
    fetchMock,
    getConnections: () =>
      Object.fromEntries(
        Object.entries(storageValues)
          .filter(([key]) => key.startsWith(CONNECTION_STORAGE_PREFIX))
          .map(([key, value]) => [
            key.slice(CONNECTION_STORAGE_PREFIX.length),
            structuredClone(value),
          ]),
      ),
    storageSetCalls,
    setBadgeText,
    removeTab(tabId: number) {
      if (!removedListener) throw new Error('No tab removal listener.');
      removedListener(tabId);
    },
  };
}

function bridgeSender({
  tabId = TAB_ID,
  documentId = DOCUMENT_ID,
  url = PAGE_URL,
  frameId = 0,
} = {}) {
  return {
    tab: { id: tabId, url },
    documentId,
    frameId,
    url,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Timed out waiting for the test boundary.');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('extension bridge delivery state', () => {
  it('retries a durably saved completion before polling or invoking again', async () => {
    let resultAttempts = 0;
    const harness = await extensionHarness({
      fetchImplementation: async (_url, options) => {
        const method = (options as { method?: string } | undefined)?.method;
        if (method === 'GET') {
          return jsonResponse({
            command_id: COMMAND_ID,
            kind: 'inspect-tools',
            issued_at: new Date().toISOString(),
          });
        }
        resultAttempts += 1;
        if (resultAttempts === 1) {
          throw new Error('temporary delivery failure');
        }
        return jsonResponse({ accepted: true }, 202);
      },
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());
    const savedAfterFailure = harness.getConnections()[String(TAB_ID)] as {
      pendingCompletion?: { command_id?: string };
      lastError?: string;
    };
    expect(savedAfterFailure.pendingCompletion?.command_id).toBe(COMMAND_ID);
    expect(savedAfterFailure.lastError).toContain('temporary delivery failure');
    expect(harness.executeScript).toHaveBeenCalledTimes(1);
    expect(harness.fetchMock).toHaveBeenCalledTimes(2);

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());
    const savedAfterRetry = harness.getConnections()[String(TAB_ID)] as {
      pendingCompletion?: unknown;
      lastError?: string | null;
    };
    expect(savedAfterRetry).not.toHaveProperty('pendingCompletion');
    expect(savedAfterRetry.lastError).toBeNull();
    expect(harness.executeScript).toHaveBeenCalledTimes(1);
    expect(harness.fetchMock).toHaveBeenCalledTimes(3);
    expect(resultAttempts).toBe(2);
  });

  it('get-active-status forgets a pairing after path or origin navigation', async () => {
    const harness = await extensionHarness({
      activeUrl: 'https://other.example/new-document',
    });

    await expect(
      harness.dispatch({ type: 'get-active-status', tabId: TAB_ID }),
    ).resolves.toEqual({ ok: true, result: { paired: false } });
    expect(harness.getConnections()).not.toHaveProperty(String(TAB_ID));
    expect(harness.fetchMock).not.toHaveBeenCalled();
    expect(harness.setBadgeText).toHaveBeenLastCalledWith({
      tabId: TAB_ID,
      text: '',
    });
  });

  it('get-active-status rejects a same-URL replacement document', async () => {
    const harness = await extensionHarness({
      executeScriptImplementation: async () => [
        {
          documentId: OTHER_DOCUMENT_ID,
          frameId: 0,
          result: PAGE_URL,
        },
      ],
    });

    await expect(
      harness.dispatch({ type: 'get-active-status', tabId: TAB_ID }),
    ).resolves.toEqual({ ok: true, result: { paired: false } });
    expect(harness.getConnections()).not.toHaveProperty(String(TAB_ID));
  });

  it('keeps each tab in an independent record during concurrent updates', async () => {
    const harness = await extensionHarness({
      initialConnections: {
        [String(TAB_ID)]: baseConnection({
          pendingCompletion: {
            command_id: COMMAND_ID,
            observed_at: new Date().toISOString(),
            observed_origin: ORIGIN,
            ok: true,
            payload: { origin: ORIGIN, pageUrl: PAGE_URL, tools: [] },
          },
        }),
        [String(SECOND_TAB_ID)]: baseConnection({
          sessionId: '8a64b91f-d2f2-498f-a10b-59093ff472ef',
          bridgeToken: 'b'.repeat(43),
          documentId: OTHER_DOCUMENT_ID,
        }),
      },
      fetchImplementation: async (_url, options) => {
        const method = (options as { method?: string } | undefined)?.method;
        if (method === 'POST') throw new Error('keep pending for retry');
        return jsonResponse({}, 204);
      },
    });

    await Promise.all([
      harness.dispatch({ type: 'bridge-tick' }, bridgeSender()),
      harness.dispatch(
        { type: 'bridge-tick' },
        bridgeSender({
          tabId: SECOND_TAB_ID,
          documentId: OTHER_DOCUMENT_ID,
        }),
      ),
    ]);

    const connections = harness.getConnections() as Record<
      string,
      { lastPollAt?: string }
    >;
    expect(connections[String(TAB_ID)]).toMatchObject({
      pendingCompletion: { command_id: COMMAND_ID },
      lastError: 'keep pending for retry',
    });
    expect(
      Number.isFinite(
        Date.parse(connections[String(SECOND_TAB_ID)]?.lastPollAt ?? ''),
      ),
    ).toBe(true);
    expect(harness.storageSetCalls.length).toBeGreaterThanOrEqual(2);
    for (const write of harness.storageSetCalls) {
      expect(Object.keys(write)).toHaveLength(1);
      expect(Object.keys(write)[0]).toMatch(/^leftoutBridgeConnectionV2:\d+$/u);
    }
  });

  it('keeps the last command error visible across empty polls', async () => {
    const harness = await extensionHarness({
      initialConnections: {
        [String(TAB_ID)]: baseConnection({
          lastError: 'diagnostic remains until a command succeeds',
        }),
      },
      fetchImplementation: async () => jsonResponse({}, 204),
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

    expect(harness.getConnections()[String(TAB_ID)]).toMatchObject({
      lastError: 'diagnostic remains until a command succeeds',
    });
  });

  it('does not resurrect a forgotten pairing after a delayed poll', async () => {
    const polled = deferred<ReturnType<typeof jsonResponse>>();
    const harness = await extensionHarness({
      fetchImplementation: async (_url, options) => {
        const method = (options as { method?: string } | undefined)?.method;
        if (method === 'GET') return polled.promise;
        return jsonResponse({ accepted: true }, 202);
      },
    });

    const tick = harness.dispatch({ type: 'bridge-tick' }, bridgeSender());
    await waitUntil(() => harness.fetchMock.mock.calls.length === 1);
    await harness.dispatch({ type: 'forget-active-tab', tabId: TAB_ID });
    polled.resolve(
      jsonResponse({
        command_id: COMMAND_ID,
        kind: 'inspect-tools',
        issued_at: new Date().toISOString(),
      }),
    );
    await tick;

    expect(harness.getConnections()).not.toHaveProperty(String(TAB_ID));
    expect(harness.executeScript).not.toHaveBeenCalled();
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect a tab record when removal races a paused update read', async () => {
    const updateReadStarted = deferred<void>();
    const releaseUpdateRead = deferred<void>();
    const harness = await extensionHarness({
      storageGetImplementation: async (_key, call, readSnapshot) => {
        const snapshot = readSnapshot();
        if (call === 2) {
          updateReadStarted.resolve(undefined);
          await releaseUpdateRead.promise;
        }
        return snapshot;
      },
    });

    const tick = harness.dispatch({ type: 'bridge-tick' }, bridgeSender());
    await updateReadStarted.promise;
    harness.removeTab(TAB_ID);
    releaseUpdateRead.resolve(undefined);
    await tick;

    expect(harness.getConnections()).not.toHaveProperty(String(TAB_ID));
  });

  it('requires the exact top-level sender document before polling', async () => {
    const harness = await extensionHarness();

    await harness.dispatch(
      { type: 'bridge-tick' },
      bridgeSender({ documentId: OTHER_DOCUMENT_ID }),
    );

    expect(harness.getConnections()).not.toHaveProperty(String(TAB_ID));
    expect(harness.fetchMock).not.toHaveBeenCalled();
    expect(harness.executeScript).not.toHaveBeenCalled();
  });

  it.each([
    ['History API path change', `${ORIGIN}/scenario-2`, '/scenario-2'],
    ['fragment change', `${PAGE_URL}#changed`, '/scenario-1'],
  ])(
    'blocks invocation after a same-document %s during the async poll',
    async (_label, href, pathname) => {
      const toolName = 'get_training_1042_eligibility_once_0123456789abcdef';
      const getTools = vi.fn(async () => []);
      const executeTool = vi.fn(async () => ({ eligible: true }));
      vi.stubGlobal('location', { origin: ORIGIN, href, pathname });
      vi.stubGlobal('document', {
        modelContext: { getTools, executeTool },
      });
      const postBodies: Array<Record<string, unknown>> = [];
      const harness = await extensionHarness({
        executeScriptImplementation: async (details) => {
          const injected = details.func as (
            ...args: unknown[]
          ) => Promise<unknown>;
          return [
            {
              documentId: DOCUMENT_ID,
              frameId: 0,
              result: await injected(...((details.args as unknown[]) ?? [])),
            },
          ];
        },
        fetchImplementation: async (_url, options) => {
          const request = options as
            | { method?: string; body?: string }
            | undefined;
          if (request?.method === 'GET') {
            return jsonResponse({
              command_id: COMMAND_ID,
              kind: 'invoke-approved-capability',
              issued_at: new Date().toISOString(),
              tool_name: toolName,
              arguments: {},
            });
          }
          postBodies.push(JSON.parse(request?.body ?? '{}'));
          return jsonResponse({ accepted: true }, 202);
        },
      });

      await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

      expect(getTools).not.toHaveBeenCalled();
      expect(executeTool).not.toHaveBeenCalled();
      expect(postBodies).toHaveLength(1);
      expect(postBodies[0]).toMatchObject({
        command_id: COMMAND_ID,
        ok: false,
        error: 'The paired page navigated before invocation.',
      });
      expect(postBodies[0]).not.toHaveProperty('payload');
    },
  );

  it('rechecks the exact URL after asynchronous discovery and before executeTool', async () => {
    const toolName = 'get_training_1042_eligibility_once_0123456789abcdef';
    const locationState = {
      origin: ORIGIN,
      href: PAGE_URL,
      pathname: '/scenario-1',
    };
    const getTools = vi.fn(async () => {
      locationState.href = `${PAGE_URL}#changed-during-discovery`;
      return [
        {
          name: toolName,
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
        },
      ];
    });
    const executeTool = vi.fn(async () => ({ eligible: true }));
    vi.stubGlobal('location', locationState);
    vi.stubGlobal('document', {
      modelContext: { getTools, executeTool },
    });
    const postBodies: Array<Record<string, unknown>> = [];
    const harness = await extensionHarness({
      executeScriptImplementation: async (details) => {
        const injected = details.func as (
          ...args: unknown[]
        ) => Promise<unknown>;
        return [
          {
            documentId: DOCUMENT_ID,
            frameId: 0,
            result: await injected(...((details.args as unknown[]) ?? [])),
          },
        ];
      },
      fetchImplementation: async (_url, options) => {
        const request = options as
          | { method?: string; body?: string }
          | undefined;
        if (request?.method === 'GET') {
          return jsonResponse({
            command_id: COMMAND_ID,
            kind: 'invoke-approved-capability',
            issued_at: new Date().toISOString(),
            tool_name: toolName,
            arguments: {},
          });
        }
        postBodies.push(JSON.parse(request?.body ?? '{}'));
        return jsonResponse({ accepted: true }, 202);
      },
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

    expect(getTools).toHaveBeenCalledOnce();
    expect(executeTool).not.toHaveBeenCalled();
    expect(postBodies[0]).toMatchObject({
      command_id: COMMAND_ID,
      ok: false,
      error: 'The paired page navigated before invocation.',
    });
  });

  it('targets and verifies the paired document for MAIN-world execution', async () => {
    const postBodies: Array<Record<string, unknown>> = [];
    const harness = await extensionHarness({
      executeScriptImplementation: async () => [
        {
          documentId: OTHER_DOCUMENT_ID,
          frameId: 0,
          result: {
            origin: ORIGIN,
            observedAt: new Date().toISOString(),
            tools: [],
          },
        },
      ],
      fetchImplementation: async (_url, options) => {
        const request = options as
          | { method?: string; body?: string }
          | undefined;
        if (request?.method === 'GET') {
          return jsonResponse({
            command_id: COMMAND_ID,
            kind: 'inspect-tools',
            issued_at: new Date().toISOString(),
          });
        }
        postBodies.push(JSON.parse(request?.body ?? '{}'));
        return jsonResponse({ accepted: true }, 202);
      },
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

    const mainInjection = harness.executeScript.mock.calls[0]?.[0] as {
      target?: unknown;
    };
    expect(mainInjection.target).toEqual({
      tabId: TAB_ID,
      documentIds: [DOCUMENT_ID],
    });
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]).toMatchObject({
      command_id: COMMAND_ID,
      ok: false,
    });
    expect(postBodies[0]).not.toHaveProperty('payload');
  });

  it('keeps the tick response open until result persistence and delivery finish', async () => {
    const delivery = deferred<ReturnType<typeof jsonResponse>>();
    const harness = await extensionHarness({
      fetchImplementation: async (_url, options) => {
        const method = (options as { method?: string } | undefined)?.method;
        if (method === 'GET') {
          return jsonResponse({
            command_id: COMMAND_ID,
            kind: 'inspect-tools',
            issued_at: new Date().toISOString(),
          });
        }
        return delivery.promise;
      },
    });
    let settled = false;
    const tick = harness
      .dispatch({ type: 'bridge-tick' }, bridgeSender())
      .then((response) => {
        settled = true;
        return response;
      });

    await waitUntil(() => harness.fetchMock.mock.calls.length === 2);
    expect(settled).toBe(false);
    const pending = harness.getConnections()[String(TAB_ID)] as {
      pendingCompletion?: { command_id?: string };
    };
    expect(pending.pendingCompletion?.command_id).toBe(COMMAND_ID);

    delivery.resolve(jsonResponse({ accepted: true }, 202));
    await expect(tick).resolves.toEqual({
      ok: true,
      result: { completed: true },
    });
    expect(harness.getConnections()[String(TAB_ID)]).not.toHaveProperty(
      'pendingCompletion',
    );
  });

  it('normalizes bounded schema strings for discovery and exact invocation', async () => {
    const toolName = 'get_training_1042_eligibility_once_0123456789abcdef';
    const executeTool = vi.fn(async () => JSON.stringify({ eligible: true }));
    let schemaText = JSON.stringify({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    });
    vi.stubGlobal('location', {
      origin: ORIGIN,
      href: PAGE_URL,
      pathname: '/scenario-1',
    });
    vi.stubGlobal('document', {
      modelContext: {
        async getTools() {
          return [
            {
              name: toolName,
              title: 'Approved read',
              description: 'Synthetic eligibility read',
              inputSchema: schemaText,
              annotations: {
                readOnlyHint: true,
                untrustedContentHint: false,
              },
            },
          ];
        },
        executeTool,
      },
    });
    const commands = [
      {
        command_id: COMMAND_ID,
        kind: 'inspect-tools',
        issued_at: new Date().toISOString(),
      },
      {
        command_id: '6ba0f59e-a8ec-4110-a3ce-8b4cc35da4c9',
        kind: 'invoke-approved-capability',
        issued_at: new Date().toISOString(),
        tool_name: toolName,
        arguments: {},
      },
      {
        command_id: 'dfd39730-6441-4d40-8ce6-658d8f071017',
        kind: 'invoke-approved-capability',
        issued_at: new Date().toISOString(),
        tool_name: toolName,
        arguments: {},
      },
    ];
    const postBodies: Array<Record<string, unknown>> = [];
    const harness = await extensionHarness({
      executeScriptImplementation: async (details) => {
        const injected = details.func as (
          ...args: unknown[]
        ) => Promise<unknown>;
        const result = await injected(...((details.args as unknown[]) ?? []));
        return [{ documentId: DOCUMENT_ID, frameId: 0, result }];
      },
      fetchImplementation: async (_url, options) => {
        const request = options as
          | { method?: string; body?: string }
          | undefined;
        if (request?.method === 'GET') return jsonResponse(commands.shift());
        postBodies.push(JSON.parse(request?.body ?? '{}'));
        return jsonResponse({ accepted: true }, 202);
      },
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());
    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());
    schemaText = JSON.stringify({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
      hiddenAuthority: true,
    });
    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

    expect(postBodies[0]).toMatchObject({
      ok: true,
      payload: {
        tools: [
          {
            name: toolName,
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        ],
      },
    });
    expect(postBodies[1]).toMatchObject({
      ok: true,
      payload: { toolName, result: { eligible: true } },
    });
    expect(postBodies[2]).toMatchObject({ ok: false });
    expect(postBodies[2]).not.toHaveProperty('payload');
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith(expect.any(Object), '{}');
  });

  it('accepts a direct structured result without retrying a transition-era implementation', async () => {
    const toolName = 'get_training_1042_eligibility_once_0123456789abcdef';
    const executeTool = vi.fn(async () => ({ eligible: true }));
    vi.stubGlobal('location', {
      origin: ORIGIN,
      href: PAGE_URL,
      pathname: '/scenario-1',
    });
    vi.stubGlobal('document', {
      modelContext: {
        async getTools() {
          return [
            {
              name: toolName,
              inputSchema: JSON.stringify({
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              }),
              annotations: { readOnlyHint: true },
            },
          ];
        },
        executeTool,
      },
    });
    const postBodies: Array<Record<string, unknown>> = [];
    const harness = await extensionHarness({
      executeScriptImplementation: async (details) => {
        const injected = details.func as (
          ...args: unknown[]
        ) => Promise<unknown>;
        return [
          {
            documentId: DOCUMENT_ID,
            frameId: 0,
            result: await injected(...((details.args as unknown[]) ?? [])),
          },
        ];
      },
      fetchImplementation: async (_url, options) => {
        const request = options as
          | { method?: string; body?: string }
          | undefined;
        if (request?.method === 'GET') {
          return jsonResponse({
            command_id: COMMAND_ID,
            kind: 'invoke-approved-capability',
            issued_at: new Date().toISOString(),
            tool_name: toolName,
            arguments: {},
          });
        }
        postBodies.push(JSON.parse(request?.body ?? '{}'));
        return jsonResponse({ accepted: true }, 202);
      },
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith(expect.any(Object), '{}');
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]).toMatchObject({
      ok: true,
      payload: { toolName, result: { eligible: true } },
    });
  });

  it('rejects a malformed string result without retrying the one-use invocation', async () => {
    const toolName = 'get_training_1042_eligibility_once_0123456789abcdef';
    const executeTool = vi.fn(async () => '{not-json');
    vi.stubGlobal('location', {
      origin: ORIGIN,
      href: PAGE_URL,
      pathname: '/scenario-1',
    });
    vi.stubGlobal('document', {
      modelContext: {
        async getTools() {
          return [
            {
              name: toolName,
              inputSchema: JSON.stringify({
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              }),
              annotations: { readOnlyHint: true },
            },
          ];
        },
        executeTool,
      },
    });
    const postBodies: Array<Record<string, unknown>> = [];
    const harness = await extensionHarness({
      executeScriptImplementation: async (details) => {
        const injected = details.func as (
          ...args: unknown[]
        ) => Promise<unknown>;
        return [
          {
            documentId: DOCUMENT_ID,
            frameId: 0,
            result: await injected(...((details.args as unknown[]) ?? [])),
          },
        ];
      },
      fetchImplementation: async (_url, options) => {
        const request = options as
          | { method?: string; body?: string }
          | undefined;
        if (request?.method === 'GET') {
          return jsonResponse({
            command_id: COMMAND_ID,
            kind: 'invoke-approved-capability',
            issued_at: new Date().toISOString(),
            tool_name: toolName,
            arguments: {},
          });
        }
        postBodies.push(JSON.parse(request?.body ?? '{}'));
        return jsonResponse({ accepted: true }, 202);
      },
    });

    await harness.dispatch({ type: 'bridge-tick' }, bridgeSender());

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]).toMatchObject({
      ok: false,
      error: 'The approved WebMCP result was malformed.',
    });
    expect(postBodies[0]).not.toHaveProperty('payload');
  });
});
