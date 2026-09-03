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
  canonicalExternalReportOrigin,
  ExternalReportActionManager,
} from './external-report-action';
import {
  createIssueCandidateFromVerifiedReceipt,
  createSyntheticLessonIssueCandidate,
  type LocalIssueCandidateSource,
} from './issue-candidate';
import {
  createIssueDashboardDocument,
  createIssueReviewListDocument,
} from './issue-dashboard';
import { IssueSaveActionManager, LocalIssueReviewStore } from './issue-review';
import { startConnectorIpcServer } from './ipc-server';
import {
  commitApprovedInvocationResult,
  createCapabilityConnectorServer,
} from './mcp-server';
import {
  cookieValue,
  ReportAccessManager,
  REPORT_SESSION_COOKIE,
  type LocalPageTarget,
} from './report-access';
import { PairingChallengeManager } from './pairing-challenge';
import { ReceiptStore, type ConnectorReceiptEntry } from './receipt-store';
import { ReportingRelayClient } from './reporting-relay';
import {
  createExternalReportFailureDocument,
  createExternalReportFormDocument,
  createExternalReportPreviewDocument,
  createExternalReportReceiptDocument,
} from './reporting-workbench';
import { createSetupDocument } from './setup';
import { NativeBridgeAdapter } from './native-adapter';

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
const SYNTHETIC_PUBLIC_ORIGINS = new Set([
  'https://left-out-webmcp-security-lab.taitfor.chatgpt.site',
]);

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

function resolveLoopbackHost(
  configuredOption: string | undefined,
  environmentValue: string | undefined,
  label: string,
) {
  const configured = configuredOption ?? environmentValue ?? '127.0.0.1';
  if (configured !== '127.0.0.1' && configured !== '::1') {
    throw new Error(`${label} host must be an explicit loopback address.`);
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

async function readFormParameters(request: IncomingMessage, limit = 4 * 1024) {
  const contentType = request.headers['content-type'] ?? '';
  if (
    Array.isArray(contentType) ||
    contentType.split(';', 1)[0].trim().toLowerCase() !==
      'application/x-www-form-urlencoded'
  ) {
    throw new Error('A URL-encoded local action is required.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('Local action body is too large.');
    chunks.push(bytes);
  }
  const parameters = new URLSearchParams(
    Buffer.concat(chunks).toString('utf8'),
  );
  return parameters;
}

async function readFormBody(request: IncomingMessage, limit = 4 * 1024) {
  const parameters = await readFormParameters(request, limit);
  const values = parameters.getAll('action_token');
  if (
    values.length !== 1 ||
    [...parameters.keys()].length !== 1 ||
    values[0].length < 20 ||
    values[0].length > 128
  ) {
    throw new Error('One bounded local action token is required.');
  }
  return { actionToken: values[0] };
}

async function readExternalReportForm(request: IncomingMessage) {
  const parameters = await readFormParameters(request);
  const fields = ['action_token', 'category', 'severity', 'stage'] as const;
  if (
    [...parameters.keys()].length !== fields.length ||
    fields.some((field) => parameters.getAll(field).length !== 1)
  ) {
    throw new Error('The external report form is incomplete or over-broad.');
  }
  const actionToken = parameters.get('action_token') ?? '';
  const category = parameters.get('category') ?? '';
  const severity = parameters.get('severity') ?? '';
  const stage = parameters.get('stage') ?? '';
  if (
    actionToken.length < 20 ||
    actionToken.length > 128 ||
    category.length > 80 ||
    severity.length > 32 ||
    stage.length > 32
  ) {
    throw new Error('The external report form exceeds its boundary.');
  }
  return { actionToken, category, severity, stage };
}

function sendHtmlDocument(
  response: ServerResponse,
  document: { html: string; contentSecurityPolicy: string },
  status = 200,
) {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': document.contentSecurityPolicy,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(document.html);
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

function hasExactlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === expected.length &&
    sortedExpected.every((key, index) => actual[index] === key)
  );
}

interface BrowserPairInput extends PairPageInput {
  challengeToken?: string;
}

function pairInput(value: unknown): BrowserPairInput {
  const body = asRecord(value);
  const usesPairCode =
    typeof body.pair_code === 'string' && body.challenge_token === undefined;
  const usesChallenge =
    typeof body.challenge_token === 'string' && body.pair_code === undefined;
  if (
    typeof body.origin !== 'string' ||
    typeof body.page_url !== 'string' ||
    typeof body.client_label !== 'string' ||
    !(usesPairCode || usesChallenge) ||
    !hasExactlyKeys(body, [
      usesPairCode ? 'pair_code' : 'challenge_token',
      'origin',
      'page_url',
      'client_label',
    ])
  ) {
    throw new Error(
      'One pairing credential, origin, page URL, and client label are required.',
    );
  }
  return {
    pairCode: typeof body.pair_code === 'string' ? body.pair_code : '',
    origin: body.origin,
    pageUrl: body.page_url,
    clientLabel: body.client_label,
    ...(typeof body.challenge_token === 'string'
      ? { challengeToken: body.challenge_token }
      : {}),
  };
}

function extensionOriginFrom(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') {
    throw new Error('The extension origin is required for automatic pairing.');
  }
  return origin;
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
  instanceId?: string;
  mcpPort?: number;
  bridgePort?: number;
  bridgeHost?: string;
  browserBridgeEnabled?: boolean;
  nativeIpc?: {
    pipePath: string;
    secret: Uint8Array;
  };
  publicHost?: string;
  ledgerPath?: string;
  allowedOrigins?: string[];
  accessToken?: string;
  pairCode?: string;
  setup?: {
    siteUrl: string;
    extensionPath: string;
  };
  reportTicketTtlMs?: number;
  reportSessionTtlMs?: number;
  reportingRelay?: ReportingRelayClient;
  log?: (message: string) => void;
}

export async function startCapabilityConnector(
  options: CapabilityConnectorOptions = {},
) {
  const mcpPort = options.mcpPort ?? Number(process.env.MCP_PORT ?? 8787);
  const bridgePort =
    options.bridgePort ?? Number(process.env.BRIDGE_PORT ?? 8788);
  const bridgeHost = resolveLoopbackHost(
    options.bridgeHost,
    process.env.BRIDGE_HOST,
    'Browser bridge',
  );
  const browserBridgeEnabled = options.browserBridgeEnabled ?? true;
  if (!browserBridgeEnabled && !options.nativeIpc) {
    throw new Error(
      'Disabling the browser HTTP bridge requires the native IPC transport.',
    );
  }
  const publicHost = resolveLoopbackHost(
    options.publicHost,
    process.env.MCP_HOST,
    'Connector',
  );
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
  const reportAccess = new ReportAccessManager({
    ticketTtlMs: options.reportTicketTtlMs,
    sessionTtlMs: options.reportSessionTtlMs,
  });
  const issueSaveActions = new IssueSaveActionManager();
  const issueReviews = new LocalIssueReviewStore();
  const externalReportActions = new ExternalReportActionManager();
  const reportingRelay =
    options.reportingRelay ??
    new ReportingRelayClient({ environment: process.env });
  let publicBaseUrl = '';

  const createLaunchUrl = (target: LocalPageTarget, binding?: string) => {
    if (!publicBaseUrl) {
      throw new Error('The connector reporting listener is not ready.');
    }
    const issued = reportAccess.issue(target, binding);
    const url = new URL('/reports/open', publicBaseUrl);
    url.searchParams.set('ticket', issued.ticket);
    return { url: url.toString(), expiresAt: issued.expiresAt };
  };

  const receipts = new ReceiptStore({ ledgerPath });
  await receipts.initialize();

  const issueScope = (
    reportSession: string,
    authorization: { binding?: string },
  ) =>
    authorization.binding
      ? `pairing:${authorization.binding}`
      : `report-session:${reportSession}`;

  const issueCandidateForSource = async (
    source: LocalIssueCandidateSource,
    binding?: string,
  ) => {
    if (source.kind === 'synthetic-lesson') {
      return createSyntheticLessonIssueCandidate();
    }
    const entry = await receipts.getVerified(source.entryId);
    if (binding && entry.connection.sessionId !== binding) {
      throw new Error('The selected receipt is outside this report session.');
    }
    return createIssueCandidateFromVerifiedReceipt(entry);
  };
  const boundPage = (binding: string | undefined) =>
    binding
      ? coordinator.listPairedPages().find((page) => page.sessionId === binding)
      : undefined;
  const reportableOrigin = (binding: string | undefined) => {
    const page = boundPage(binding);
    if (!page || SYNTHETIC_PUBLIC_ORIGINS.has(page.origin)) return undefined;
    try {
      return canonicalExternalReportOrigin(page.origin);
    } catch {
      return undefined;
    }
  };
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
  const pairingChallenges = new PairingChallengeManager();

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
        ...(options.instanceId ? { instance_id: options.instanceId } : {}),
        mcp_path: MCP_PATH,
        reporting_path: '/receipts',
        setup_path: '/setup',
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/reports/open') {
      const ticketValues = url.searchParams.getAll('ticket');
      if (
        ticketValues.length !== 1 ||
        [...url.searchParams.keys()].length !== 1
      ) {
        sendJson(response, 400, {
          error: 'A single launch ticket is required.',
        });
        return;
      }
      try {
        const session = reportAccess.consume(ticketValues[0]);
        response.writeHead(303, {
          location: session.target,
          'set-cookie': `${REPORT_SESSION_COOKIE}=${encodeURIComponent(session.sessionToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${session.maxAgeSeconds}`,
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
        });
        response.end();
      } catch (error) {
        sendJson(response, 401, { error: errorMessage(error) });
      }
      return;
    }

    const reportSession = cookieValue(
      request.headers.cookie,
      REPORT_SESSION_COOKIE,
    );
    if (request.method === 'GET' && url.pathname === '/setup') {
      if (!reportAccess.authorize(reportSession, '/setup')) {
        sendJson(response, 401, { error: 'Local setup access denied.' });
        return;
      }
      const document = createSetupDocument({
        siteUrl: options.setup?.siteUrl ?? allowedOrigins[0],
        extensionPath:
          options.setup?.extensionPath ?? resolve('products/extension'),
        bridgeUrl: browserBridgeEnabled
          ? `http://${urlHost(bridgeHost)}:${
              (bridgeServer.address() as { port?: number } | null)?.port ??
              bridgePort
            }`
          : 'Chrome native messaging → authenticated install-owned IPC',
        transport: browserBridgeEnabled ? 'developer-loopback' : 'native-ipc',
        pages: coordinator.listPairedPages(),
      });
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': document.contentSecurityPolicy,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      response.end(document.html);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/issues/public/new') {
      const authorization = reportAccess.authorize(
        reportSession,
        '/issues/preview',
      );
      if (!authorization) {
        sendJson(response, 401, { error: 'External report access denied.' });
        return;
      }
      const siteOrigin = reportableOrigin(authorization.binding);
      if (!siteOrigin) {
        sendHtmlDocument(
          response,
          createExternalReportFailureDocument(
            'A paired public HTTPS page is required. Synthetic lessons, local pages, IP addresses, and private names cannot enter external reporting.',
          ),
          400,
        );
        return;
      }
      const actionToken = externalReportActions.issueComposition(
        issueScope(reportSession, authorization),
        siteOrigin,
      );
      sendHtmlDocument(
        response,
        createExternalReportFormDocument({
          actionToken,
          siteOrigin,
          relayStatus: reportingRelay.status(),
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/issues/public/preview'
    ) {
      const authorization = reportAccess.authorize(
        reportSession,
        '/issues/preview',
      );
      if (!authorization) {
        sendJson(response, 401, { error: 'External report access denied.' });
        return;
      }
      try {
        const form = await readExternalReportForm(request);
        const scope = issueScope(reportSession, authorization);
        const draft = externalReportActions.compose(
          form.actionToken,
          scope,
          form,
        );
        const relayStatus = reportingRelay.status();
        const submissionToken = relayStatus.acceptsExternalReports
          ? externalReportActions.issueSubmission(scope, draft)
          : undefined;
        sendHtmlDocument(
          response,
          createExternalReportPreviewDocument({
            draft,
            relayStatus,
            ...(submissionToken ? { submissionToken } : {}),
          }),
        );
      } catch (error) {
        sendHtmlDocument(
          response,
          createExternalReportFailureDocument(errorMessage(error)),
          400,
        );
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/issues/public/submit') {
      const authorization = reportAccess.authorize(
        reportSession,
        '/issues/preview',
      );
      if (!authorization) {
        sendJson(response, 401, { error: 'External report access denied.' });
        return;
      }
      try {
        const { actionToken } = await readFormBody(request);
        const scope = issueScope(reportSession, authorization);
        const draft = externalReportActions.consumeSubmission(
          actionToken,
          scope,
        );
        const relayStatus = reportingRelay.status();
        if (!relayStatus.acceptsExternalReports) {
          throw new Error('External reporting is not configured.');
        }
        const receipt = await reportingRelay.submit(draft);
        sendHtmlDocument(
          response,
          createExternalReportReceiptDocument({
            receipt,
            destinationOrigin: relayStatus.destinationOrigin,
          }),
        );
      } catch (error) {
        sendHtmlDocument(
          response,
          createExternalReportFailureDocument(errorMessage(error)),
          502,
        );
      }
      return;
    }

    const issuePreviewMatch = /^\/issues\/preview(?:\/([0-9a-f-]{36}))?$/u.exec(
      url.pathname,
    );
    if (request.method === 'GET' && issuePreviewMatch) {
      const issueAuthorization = reportAccess.authorize(
        reportSession,
        '/issues/preview',
      );
      if (!issueAuthorization) {
        sendJson(response, 401, { error: 'Issue preview access denied.' });
        return;
      }
      let candidate;
      try {
        candidate = issuePreviewMatch[1]
          ? await issueCandidateForSource(
              {
                kind: 'verified-receipt',
                entryId: issuePreviewMatch[1],
              },
              issueAuthorization.binding,
            )
          : createSyntheticLessonIssueCandidate();
      } catch {
        sendJson(response, 404, {
          error: 'The selected verified receipt is not available.',
        });
        return;
      }
      const actionToken = issueSaveActions.issue(
        issueScope(reportSession, issueAuthorization),
        candidate.source,
      );
      const document = createIssueDashboardDocument({
        candidate,
        actionToken,
      });
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': document.contentSecurityPolicy,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      response.end(document.html);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/issues/save') {
      const issueAuthorization = reportAccess.authorize(
        reportSession,
        '/issues/preview',
      );
      if (!issueAuthorization) {
        sendJson(response, 401, { error: 'Issue save access denied.' });
        return;
      }
      const scope = issueScope(reportSession, issueAuthorization);
      try {
        const { actionToken } = await readFormBody(request);
        const source = issueSaveActions.consume(actionToken, scope);
        const candidate = await issueCandidateForSource(
          source,
          issueAuthorization.binding,
        );
        issueReviews.save(scope, candidate.draft);
        response.writeHead(303, {
          location: '/issues/review',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
        });
        response.end();
      } catch (error) {
        sendJson(response, 400, { error: errorMessage(error) });
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/issues/review') {
      const issueAuthorization = reportAccess.authorize(
        reportSession,
        '/issues/preview',
      );
      if (!issueAuthorization) {
        sendJson(response, 401, { error: 'Issue review access denied.' });
        return;
      }
      const document = createIssueReviewListDocument(
        issueReviews.list(issueScope(reportSession, issueAuthorization)),
      );
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': document.contentSecurityPolicy,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      response.end(document.html);
      return;
    }

    const reportMatch = /^\/receipts(?:\/([0-9a-f-]{36}))?$/u.exec(
      url.pathname,
    );
    if (request.method === 'GET' && reportMatch) {
      const reportAuthorization = reportAccess.authorize(
        reportSession,
        '/receipts',
      );
      if (!reportAuthorization) {
        sendJson(response, 401, { error: 'Receipt viewer access denied.' });
        return;
      }
      let entries: ConnectorReceiptEntry[] = [];
      let loadError: string | undefined;
      try {
        entries = await receipts.listVerified();
        if (reportAuthorization.binding) {
          entries = entries.filter(
            (entry) =>
              entry.connection.sessionId === reportAuthorization.binding,
          );
        }
      } catch {
        loadError = 'The local receipt chain could not be verified.';
      }
      const document = createDashboardDocument({
        entries,
        selectedEntryId: reportMatch[1],
        loadError,
        publicReportOrigin: reportableOrigin(reportAuthorization.binding),
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
        ...(options.instanceId ? { instance_id: options.instanceId } : {}),
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/bridge/challenge') {
      try {
        const body = asRecord(await readJsonBody(request));
        if (
          !hasExactlyKeys(body, ['origin', 'page_url', 'client_label']) ||
          typeof body.origin !== 'string' ||
          typeof body.page_url !== 'string' ||
          typeof body.client_label !== 'string'
        ) {
          throw new Error(
            'Origin, page URL, and client label are required for pairing.',
          );
        }
        const challenge = pairingChallenges.issue({
          extensionOrigin: extensionOriginFrom(request),
          origin: body.origin,
          pageUrl: body.page_url,
          clientLabel: body.client_label,
        });
        sendJson(response, 201, {
          challenge_token: challenge.token,
          expires_at: challenge.expiresAt,
        });
      } catch (error) {
        sendJson(response, 400, { error: errorMessage(error) });
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/bridge/pair') {
      try {
        const input = pairInput(await readJsonBody(request));
        if (input.challengeToken) {
          pairingChallenges.consume(input.challengeToken, {
            extensionOrigin: extensionOriginFrom(request),
            origin: input.origin,
            pageUrl: input.pageUrl,
            clientLabel: input.clientLabel,
          });
          input.pairCode = coordinator.pairCode;
        }
        const paired = coordinator.pair(input);
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
      if (request.method === 'GET' && url.pathname === '/bridge/report-link') {
        coordinator.authenticate(sessionId, bridgeToken);
        const launch = createLaunchUrl('/receipts', sessionId);
        sendJson(response, 200, {
          report_url: launch.url,
          expires_at: launch.expiresAt,
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/bridge/revoke') {
        coordinator.revoke(sessionId, bridgeToken);
        reportAccess.revokeBinding(sessionId);
        issueSaveActions.revokeScope(`pairing:${sessionId}`);
        issueReviews.revokeScope(`pairing:${sessionId}`);
        externalReportActions.revokeScope(`pairing:${sessionId}`);
        sendJson(response, 200, { revoked: true });
        return;
      }
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

  let nativeAdapter: NativeBridgeAdapter | undefined;
  let nativeIpcServer:
    | Awaited<ReturnType<typeof startConnectorIpcServer>>
    | undefined;
  try {
    await listen(publicServer, mcpPort, publicHost);
    if (browserBridgeEnabled) {
      await listen(bridgeServer, bridgePort, bridgeHost);
    }
    const boundMcpPort = (publicServer.address() as { port: number }).port;
    publicBaseUrl = `http://${urlHost(publicHost)}:${boundMcpPort}`;
    if (options.nativeIpc) {
      nativeAdapter = new NativeBridgeAdapter({
        coordinator,
        createReportLaunch: (sessionId) =>
          createLaunchUrl('/receipts', sessionId),
        revokeSessionResources: (sessionId) => {
          reportAccess.revokeBinding(sessionId);
          issueSaveActions.revokeScope(`pairing:${sessionId}`);
          issueReviews.revokeScope(`pairing:${sessionId}`);
          externalReportActions.revokeScope(`pairing:${sessionId}`);
        },
      });
      nativeIpcServer = await startConnectorIpcServer({
        pipePath: options.nativeIpc.pipePath,
        secret: options.nativeIpc.secret,
        handle: (request) => nativeAdapter!.handle(request),
      });
    }
  } catch (error) {
    nativeAdapter?.revokeAll();
    coordinator.dispose();
    await nativeIpcServer?.close().catch(() => undefined);
    await Promise.allSettled([close(publicServer), close(bridgeServer)]);
    throw error;
  }

  const actualMcpPort = (publicServer.address() as { port: number }).port;
  const actualBridgePort = browserBridgeEnabled
    ? (bridgeServer.address() as { port: number }).port
    : 0;
  log(
    `MCP connector: http://${urlHost(publicHost)}:${actualMcpPort}${MCP_PATH}?access_token=${accessToken}`,
  );
  const initialReportLaunch = createLaunchUrl('/receipts');
  const initialSetupLaunch = createLaunchUrl('/setup');
  log(`Receipt dashboard: ${initialReportLaunch.url}`);
  log(`Local setup center: ${initialSetupLaunch.url}`);
  if (browserBridgeEnabled) {
    log(
      `Local browser bridge: http://${urlHost(bridgeHost)}:${actualBridgePort}`,
    );
    log(`One-time browser pairing code: ${coordinator.pairCode}`);
  }
  if (nativeIpcServer) {
    log(`Local Guard native IPC: ${nativeIpcServer.pipePath}`);
  }

  return {
    accessToken,
    pairCode: coordinator.pairCode,
    mcpPort: actualMcpPort,
    bridgePort: actualBridgePort,
    bridgeHost,
    browserBridgeEnabled,
    nativeIpcPath: nativeIpcServer?.pipePath,
    coordinator,
    receipts,
    issueReviews,
    issueReportLaunchTicket: () => createLaunchUrl('/receipts'),
    issueSetupLaunchTicket: () => createLaunchUrl('/setup'),
    async close() {
      nativeAdapter?.revokeAll();
      coordinator.dispose();
      reportAccess.dispose();
      issueSaveActions.dispose();
      issueReviews.dispose();
      externalReportActions.dispose();
      await Promise.all([
        close(publicServer),
        close(bridgeServer),
        nativeIpcServer?.close() ?? Promise.resolve(),
      ]);
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
