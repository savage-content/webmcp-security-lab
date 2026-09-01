import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import {
  BridgeCoordinator,
  type BridgeCommandResult,
  type PairPageInput,
} from './bridge-coordinator';
import { createDashboardDocument } from './dashboard';
import {
  commitApprovedInvocationResult,
  createCapabilityConnectorServer,
} from './mcp-server';
import { ReceiptStore, type ConnectorReceiptEntry } from './receipt-store';

const MCP_PATH = '/mcp';
const REQUEST_URL_BASE = 'http://connector.invalid';
const MCP_CORS_REQUEST_HEADERS = [
  'Content-Type',
  'Authorization',
  'MCP-Session-Id',
  'MCP-Protocol-Version',
  'Last-Event-ID',
].join(', ');
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://left-out-webmcp-security-lab.taitfor.chatgpt.site',
];

function secret() {
  return Buffer.from(randomBytes(32)).toString('base64url');
}

function resolveAccessToken(configuredOption: string | undefined) {
  const configured: unknown =
    configuredOption === undefined
      ? process.env.MCP_ACCESS_TOKEN
      : configuredOption;
  if (configured === undefined) return secret();
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    throw new Error(
      'MCP access token must be a non-empty string when configured.',
    );
  }
  return configured;
}

function resolveBridgeHost(configuredOption: string | undefined) {
  const configured = configuredOption ?? process.env.BRIDGE_HOST ?? '127.0.0.1';
  if (configured !== '127.0.0.1' && configured !== '::1') {
    throw new Error(
      'Browser bridge host must be an explicit loopback address.',
    );
  }
  return configured;
}

function urlHost(host: string) {
  return host.includes(':') ? `[${host}]` : host;
}

function safeSecretEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function accessTokenFrom(request: IncomingMessage, url: URL) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return url.searchParams.get('access_token') ?? '';
}

function bridgeTokenFrom(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function requestUrl(request: IncomingMessage) {
  try {
    // The Host header is attacker-controlled and is not needed to route these
    // origin-form requests. A fixed base keeps malformed Host values inert.
    return new URL(request.url ?? '/', REQUEST_URL_BASE);
  } catch {
    return undefined;
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try {
      server.listen(port, host);
    } catch (error) {
      server.off('error', onError);
      server.off('listening', onListening);
      reject(error);
    }
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage, limit = 64 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text || '{}') as unknown;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected connector error.';
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A JSON object is required.');
  }
  return value as Record<string, unknown>;
}

function pairInput(value: unknown): PairPageInput {
  const body = asRecord(value);
  if (
    typeof body.pair_code !== 'string' ||
    typeof body.origin !== 'string' ||
    typeof body.page_url !== 'string' ||
    typeof body.client_label !== 'string'
  ) {
    throw new Error(
      'Pair code, origin, page URL, and client label are required.',
    );
  }
  return {
    pairCode: body.pair_code,
    origin: body.origin,
    pageUrl: body.page_url,
    clientLabel: body.client_label,
  };
}

function commandResult(value: unknown): BridgeCommandResult {
  const body = asRecord(value);
  if (
    typeof body.command_id !== 'string' ||
    typeof body.observed_at !== 'string' ||
    typeof body.observed_origin !== 'string' ||
    typeof body.ok !== 'boolean'
  ) {
    throw new Error('The bridge command result is incomplete.');
  }
  return {
    commandId: body.command_id,
    observedAt: body.observed_at,
    observedOrigin: body.observed_origin,
    ok: body.ok,
    ...(body.payload === undefined ? {} : { payload: body.payload }),
    ...(typeof body.error === 'string' ? { error: body.error } : {}),
  };
}

export interface CapabilityConnectorOptions {
  mcpPort?: number;
  bridgePort?: number;
  bridgeHost?: string;
  publicHost?: string;
  ledgerPath?: string;
  allowedOrigins?: string[];
  accessToken?: string;
  pairCode?: string;
  log?: (message: string) => void;
}

export async function startCapabilityConnector(
  options: CapabilityConnectorOptions = {},
) {
  const mcpPort = options.mcpPort ?? Number(process.env.MCP_PORT ?? 8787);
  const bridgePort =
    options.bridgePort ?? Number(process.env.BRIDGE_PORT ?? 8788);
  const bridgeHost = resolveBridgeHost(options.bridgeHost);
  const publicHost = options.publicHost ?? process.env.MCP_HOST ?? '127.0.0.1';
  const accessToken = resolveAccessToken(options.accessToken);
  const allowedOrigins =
    options.allowedOrigins ??
    process.env.ALLOWED_PAGE_ORIGINS?.split(',').map((item) => item.trim()) ??
    DEFAULT_ALLOWED_ORIGINS;
  const ledgerPath =
    options.ledgerPath ??
    process.env.RECEIPT_LEDGER_PATH ??
    resolve('products/connector/runtime-data/receipts.jsonl');
  const log = options.log ?? console.log;

  const receipts = new ReceiptStore({ ledgerPath });
  await receipts.initialize();
  const coordinator = new BridgeCoordinator({
    pairCode: options.pairCode ?? process.env.BRIDGE_PAIR_CODE,
    allowedOrigins,
    commitResult: async ({ command, result, page }) => {
      if (command.kind !== 'invoke-approved-capability' || !result.ok) {
        return undefined;
      }
      const entry = await commitApprovedInvocationResult({
        result,
        page,
        toolName: command.toolName,
        receipts,
      });
      return { receiptEntryId: entry.entryId };
    },
    onPairCodeRotated: (newCode) =>
      log(`Next one-time browser pairing code: ${newCode}`),
  });

  const publicServer = createServer(async (request, response) => {
    const url = requestUrl(request);
    if (!url) {
      sendJson(response, 400, { error: 'Invalid request target.' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendJson(response, 200, {
        service: 'leftout-webmcp-capability-connector',
        status: 'ok',
        mcp_path: MCP_PATH,
        reporting_path: '/receipts',
      });
      return;
    }

    const isMcpRequest =
      url.pathname === MCP_PATH &&
      request.method &&
      ['POST', 'GET', 'DELETE', 'OPTIONS'].includes(request.method);
    if (isMcpRequest && request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
        'access-control-allow-headers': MCP_CORS_REQUEST_HEADERS,
        'access-control-expose-headers': 'Mcp-Session-Id',
        'cache-control': 'no-store',
      });
      response.end();
      return;
    }

    const suppliedToken = accessTokenFrom(request, url);
    if (!safeSecretEqual(suppliedToken, accessToken)) {
      sendJson(response, 401, { error: 'Connector access denied.' });
      return;
    }

    if (isMcpRequest) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      const mcpServer = createCapabilityConnectorServer({
        coordinator,
        receipts,
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      response.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(request, response);
      } catch (error) {
        if (!response.headersSent) {
          sendJson(response, 500, { error: errorMessage(error) });
        }
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/receipts') {
      try {
        sendJson(response, 200, {
          entries: await receipts.listVerified(),
          chain_verified: true,
        });
      } catch (error) {
        sendJson(response, 500, { error: errorMessage(error) });
      }
      return;
    }

    const reportMatch = /^\/receipts(?:\/([0-9a-f-]{36}))?$/u.exec(
      url.pathname,
    );
    if (request.method === 'GET' && reportMatch) {
      let entries: ConnectorReceiptEntry[] = [];
      let loadError: string | undefined;
      try {
        entries = await receipts.listVerified();
      } catch {
        loadError = 'The local receipt chain could not be verified.';
      }
      const document = createDashboardDocument({
        entries,
        selectedEntryId: reportMatch[1],
        loadError,
      });
      response.writeHead(loadError ? 500 : 200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': document.contentSecurityPolicy,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      response.end(document.html);
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  });

  const bridgeServer = createServer(async (request, response) => {
    const url = requestUrl(request);
    if (!url) {
      sendJson(response, 400, { error: 'Invalid request target.' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendJson(response, 200, {
        service: 'leftout-local-browser-bridge',
        status: 'ok',
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/bridge/pair') {
      try {
        const paired = coordinator.pair(pairInput(await readJsonBody(request)));
        sendJson(response, 201, {
          session_id: paired.sessionId,
          bridge_token: paired.bridgeToken,
          origin: paired.origin,
          page_url: paired.pageUrl,
          paired_at: paired.pairedAt,
        });
      } catch (error) {
        sendJson(response, 400, { error: errorMessage(error) });
      }
      return;
    }

    const sessionId = url.searchParams.get('session_id') ?? '';
    const bridgeToken = bridgeTokenFrom(request);
    try {
      if (request.method === 'GET' && url.pathname === '/bridge/poll') {
        const command = coordinator.poll(sessionId, bridgeToken);
        if (!command) {
          response.writeHead(204, { 'cache-control': 'no-store' });
          response.end();
          return;
        }
        sendJson(response, 200, {
          command_id: command.id,
          kind: command.kind,
          issued_at: command.issuedAt,
          ...('toolName' in command
            ? { tool_name: command.toolName, arguments: command.arguments }
            : {}),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/bridge/heartbeat') {
        const page = coordinator.heartbeat(sessionId, bridgeToken);
        sendJson(response, 200, { page });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/bridge/result') {
        await coordinator.complete(
          sessionId,
          bridgeToken,
          commandResult(await readJsonBody(request)),
        );
        sendJson(response, 202, { accepted: true });
        return;
      }
      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      sendJson(response, 401, { error: errorMessage(error) });
    }
  });

  try {
    await listen(publicServer, mcpPort, publicHost);
    await listen(bridgeServer, bridgePort, bridgeHost);
  } catch (error) {
    coordinator.dispose();
    await Promise.allSettled([close(publicServer), close(bridgeServer)]);
    throw error;
  }

  const actualMcpPort = (publicServer.address() as { port: number }).port;
  const actualBridgePort = (bridgeServer.address() as { port: number }).port;
  log(
    `MCP connector: http://${urlHost(publicHost)}:${actualMcpPort}${MCP_PATH}?access_token=${accessToken}`,
  );
  log(
    `Receipt dashboard: http://${urlHost(publicHost)}:${actualMcpPort}/receipts?access_token=${accessToken}`,
  );
  log(
    `Local browser bridge: http://${urlHost(bridgeHost)}:${actualBridgePort}`,
  );
  log(`One-time browser pairing code: ${coordinator.pairCode}`);

  return {
    accessToken,
    pairCode: coordinator.pairCode,
    mcpPort: actualMcpPort,
    bridgePort: actualBridgePort,
    bridgeHost,
    coordinator,
    receipts,
    async close() {
      coordinator.dispose();
      await Promise.all([close(publicServer), close(bridgeServer)]);
    },
  };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const connector = await startCapabilityConnector();
  const shutdown = async () => {
    await connector.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
