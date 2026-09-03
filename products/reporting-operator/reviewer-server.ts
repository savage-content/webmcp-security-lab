import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  ReviewerAccessManager,
  ReviewerActionManager,
  REVIEWER_SESSION_COOKIE,
  reviewerCookieValue,
} from './reviewer-access';
import {
  ReportingReviewerClient,
  type ReportingReviewDetail,
  type ReportingReviewListPage,
  type ReportingReviewTransitionReceipt,
} from './reviewer-client';
import {
  createReviewerDetailDocument,
  createReviewerFailureDocument,
  createReviewerListDocument,
  createReviewerTransitionReceiptDocument,
} from './reviewer-workbench';

const REQUEST_URL_BASE = 'http://reviewer.invalid';

interface ReviewerClientContract {
  status(): Readonly<
    { connected: false } | { connected: true; serviceOrigin: string }
  >;
  list(cursor?: string): Promise<Readonly<ReportingReviewListPage>>;
  detail(reportId: string): Promise<Readonly<ReportingReviewDetail>>;
  transition(input: {
    reportId: string;
    expectedRevision: number;
    to: ReportingReviewDetail['record']['moderation']['state'];
  }): Promise<Readonly<ReportingReviewTransitionReceipt>>;
}

export interface ReportingReviewerServerOptions {
  host?: string;
  port?: number;
  client?: ReviewerClientContract;
  access?: ReviewerAccessManager;
  actions?: ReviewerActionManager;
  log?: (message: string) => void;
}

function loopbackHost(value: string | undefined) {
  const host = value ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1') {
    throw new Error(
      'Reviewer workbench host must be an explicit loopback address.',
    );
  }
  return host;
}

function reviewerPort(value: number | undefined) {
  const port =
    value ?? Number(process.env.LEFTOUT_REPORTING_REVIEWER_PORT ?? 8790);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Reviewer workbench port is invalid.');
  }
  return port;
}

function urlHost(host: string) {
  return host.includes(':') ? `[${host}]` : host;
}

function requestUrl(request: IncomingMessage) {
  try {
    return new URL(request.url ?? '/', REQUEST_URL_BASE);
  } catch {
    return undefined;
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function sendHtml(
  response: ServerResponse,
  document: { html: string; contentSecurityPolicy: string },
  status = 200,
) {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': document.contentSecurityPolicy,
    'cache-control': 'no-store',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy':
      'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  response.end(document.html);
}

function sendText(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(message).toString(),
    'cache-control': 'no-store',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  response.end(message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Reviewer operation failed.';
}

async function readActionToken(request: IncomingMessage) {
  const contentType = request.headers['content-type'];
  if (
    Array.isArray(contentType) ||
    contentType?.split(';', 1)[0].trim().toLowerCase() !==
      'application/x-www-form-urlencoded'
  ) {
    throw new Error('A URL-encoded reviewer action is required.');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.byteLength;
    if (length > 1_024) throw new Error('Reviewer action body is too large.');
    chunks.push(bytes);
  }
  const parameters = new URLSearchParams(
    Buffer.concat(chunks).toString('utf8'),
  );
  const values = parameters.getAll('action_token');
  if (
    values.length !== 1 ||
    [...parameters.keys()].length !== 1 ||
    values[0].length < 20 ||
    values[0].length > 128
  ) {
    throw new Error('One bounded reviewer action token is required.');
  }
  return values[0];
}

function exactQueryToken(url: URL) {
  const values = url.searchParams.getAll('token');
  if (
    values.length !== 1 ||
    [...url.searchParams.keys()].length !== 1 ||
    values[0].length < 20 ||
    values[0].length > 128
  ) {
    throw new Error('One bounded local token is required.');
  }
  return values[0];
}

export async function startReportingReviewerServer(
  options: ReportingReviewerServerOptions = {},
) {
  const host = loopbackHost(options.host);
  const port = reviewerPort(options.port);
  const client = options.client ?? new ReportingReviewerClient();
  const status = client.status();
  if (!status.connected) {
    throw new Error('Reviewer service is disabled.');
  }
  const access = options.access ?? new ReviewerAccessManager();
  const actions = options.actions ?? new ReviewerActionManager();
  const log = options.log ?? console.log;
  let baseUrl = '';
  let expectedHostHeader = '';

  const listDocument = async (scope: string, cursor?: string) => {
    const page = await client.list(cursor);
    return createReviewerListDocument({
      reports: page.reports.map((item) => ({
        item,
        viewToken: actions.issueView(scope, item.reportId),
      })),
      ...(page.nextCursor
        ? { nextPageToken: actions.issuePage(scope, page.nextCursor) }
        : {}),
      serviceOrigin: status.serviceOrigin,
    });
  };

  const server = createServer(async (request, response) => {
    if (request.headers.host !== expectedHostHeader) {
      sendText(response, 421, 'Reviewer workbench host was rejected.');
      return;
    }
    const url = requestUrl(request);
    if (!url) {
      sendText(response, 400, 'Reviewer request target was rejected.');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/open') {
      try {
        const session = access.consumeLaunchTicket(exactQueryToken(url));
        response.writeHead(303, {
          location: '/reviews',
          'set-cookie': `${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(session.sessionToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${session.maxAgeSeconds}`,
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
        });
        response.end();
      } catch {
        sendText(response, 401, 'Reviewer launch access was rejected.');
      }
      return;
    }

    const sessionToken = reviewerCookieValue(request.headers.cookie);
    const authorization = access.authorize(sessionToken);
    if (!authorization) {
      sendText(response, 401, 'Reviewer session is invalid or expired.');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/reviews') {
      if ([...url.searchParams.keys()].length !== 0) {
        sendText(response, 400, 'Reviewer query was rejected.');
        return;
      }
      try {
        sendHtml(response, await listDocument(authorization.scope));
      } catch (error) {
        sendHtml(
          response,
          createReviewerFailureDocument(errorMessage(error)),
          502,
        );
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/reviews/page') {
      try {
        const action = actions.consume(
          exactQueryToken(url),
          authorization.scope,
          'page',
        );
        if (action.kind !== 'page')
          throw new Error('Reviewer page action was rejected.');
        sendHtml(
          response,
          await listDocument(authorization.scope, action.cursor),
        );
      } catch (error) {
        sendHtml(
          response,
          createReviewerFailureDocument(errorMessage(error)),
          400,
        );
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/reviews/view') {
      try {
        const action = actions.consume(
          exactQueryToken(url),
          authorization.scope,
          'view',
        );
        if (action.kind !== 'view')
          throw new Error('Reviewer view action was rejected.');
        const detail = await client.detail(action.reportId);
        sendHtml(
          response,
          createReviewerDetailDocument({
            detail,
            actions: actions.issueTransitions({
              scope: authorization.scope,
              reportId: detail.record.moderation.id,
              expectedRevision: detail.record.revision,
              state: detail.record.moderation.state,
            }),
          }),
        );
      } catch (error) {
        sendHtml(
          response,
          createReviewerFailureDocument(errorMessage(error)),
          400,
        );
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/reviews/transition') {
      const fetchSite = request.headers['sec-fetch-site'];
      if (
        request.headers.origin !== baseUrl ||
        (fetchSite !== undefined && fetchSite !== 'same-origin')
      ) {
        sendText(response, 403, 'Cross-origin reviewer action was rejected.');
        return;
      }
      try {
        const action = actions.consume(
          await readActionToken(request),
          authorization.scope,
          'transition',
        );
        if (action.kind !== 'transition') {
          throw new Error('Reviewer transition action was rejected.');
        }
        const receipt = await client.transition({
          reportId: action.reportId,
          expectedRevision: action.expectedRevision,
          to: action.to,
        });
        sendHtml(response, createReviewerTransitionReceiptDocument(receipt));
      } catch (error) {
        sendHtml(
          response,
          createReviewerFailureDocument(errorMessage(error)),
          400,
        );
      }
      return;
    }

    sendText(response, 404, 'Reviewer route was not found.');
  });

  try {
    await listen(server, port, host);
  } catch (error) {
    access.dispose();
    actions.dispose();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    await close(server);
    access.dispose();
    actions.dispose();
    throw new Error('Reviewer workbench did not expose a TCP listener.');
  }
  expectedHostHeader = `${urlHost(host)}:${address.port}`;
  baseUrl = `http://${expectedHostHeader}`;
  const launch = access.issueLaunchTicket();
  const launchUrl = new URL('/open', baseUrl);
  launchUrl.searchParams.set('token', launch.token);
  log(`Open the private reviewer workbench once: ${launchUrl.toString()}`);

  let closed = false;
  return Object.freeze({
    baseUrl,
    launchUrl: launchUrl.toString(),
    launchExpiresAt: launch.expiresAt,
    async close() {
      if (closed) return;
      closed = true;
      access.dispose();
      actions.dispose();
      await close(server);
    },
  });
}

async function runFromCommandLine() {
  const server = await startReportingReviewerServer();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.close();
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runFromCommandLine().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
