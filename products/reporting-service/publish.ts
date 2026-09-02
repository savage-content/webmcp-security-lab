import { randomUUID } from 'node:crypto';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import {
  parseIssuePublicationGate,
  type IssuePublicationGate,
} from '../connector/issue-publication';
import { authenticateReportingActor } from './auth';
import {
  loadReportingServiceConfiguration,
  type ReportingActorConfiguration,
} from './config';
import { transitionReportingLedger } from './ledger';
import {
  loadReportingLedger,
  loadReportingPublication,
  loadReportingRequestEvent,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
  saveReportingTransition,
} from './store';

export const REPORTING_PUBLICATION_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-publication-response/1' as const;

const MAX_PUBLICATION_BYTES = 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BODY_FIELDS = new Set(['expectedRevision', 'publication']);

class ReportingPublicationInputError extends Error {}
class ReportingPublicationBodyTooLargeError extends Error {}

export interface ReportingPublicationDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
  eventId?: () => string;
}

type ReportingPublicationAuthority =
  | Readonly<{ response: Response }>
  | Readonly<{
      actor: Readonly<ReportingActorConfiguration>;
      database: D1Database;
    }>;

const responseHeaders = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function jsonResponse(body: unknown, status: number, headers?: HeadersInit) {
  const responseHeaderValues = new Headers(responseHeaders);
  new Headers(headers).forEach((value, key) => {
    responseHeaderValues.set(key, value);
  });
  return Response.json(body, { status, headers: responseHeaderValues });
}

function authority(
  request: Request,
  dependencies: Readonly<ReportingPublicationDependencies>,
): ReportingPublicationAuthority {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(
      dependencies.environment,
    );
  } catch {
    return {
      response: jsonResponse({ error: 'Reporting service unavailable.' }, 503),
    };
  }
  if (configuration.mode !== 'invited' || !configuration.gates.publication) {
    return { response: jsonResponse({ error: 'Not found.' }, 404) };
  }
  const actor = authenticateReportingActor(
    request,
    configuration,
    'publisher',
  );
  if (!actor) {
    return {
      response: jsonResponse(
        { error: 'Publisher authority is invalid.' },
        401,
        { 'WWW-Authenticate': 'Bearer' },
      ),
    };
  }
  if (!dependencies.database) {
    return {
      response: jsonResponse({ error: 'Reporting service unavailable.' }, 503),
    };
  }
  if (request.headers.has('origin')) {
    return {
      response: jsonResponse(
        { error: 'Browser-origin publication is not enabled.' },
        403,
      ),
    };
  }
  return { actor, database: dependencies.database };
}

function routeReportId(request: Request) {
  const value = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingPublicationInputError();
  }
  return value;
}

function requestId(request: Request) {
  const value = request.headers.get('idempotency-key');
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingPublicationInputError();
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function boundedBody(request: Request) {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declared) ||
      !Number.isSafeInteger(Number(declared)) ||
      Number(declared) > MAX_PUBLICATION_BYTES)
  ) {
    throw new ReportingPublicationBodyTooLargeError();
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_PUBLICATION_BYTES) {
        await reader.cancel();
        throw new ReportingPublicationBodyTooLargeError();
      }
      chunks.push(result.value);
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ReportingPublicationInputError();
  }
}

async function parseBody(request: Request) {
  let value: unknown;
  try {
    value = JSON.parse(await boundedBody(request)) as unknown;
  } catch (error) {
    if (error instanceof ReportingPublicationBodyTooLargeError) throw error;
    throw new ReportingPublicationInputError();
  }
  if (!isRecord(value)) throw new ReportingPublicationInputError();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !BODY_FIELDS.has(key)) {
      throw new ReportingPublicationInputError();
    }
  }
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 1
  ) {
    throw new ReportingPublicationInputError();
  }
  try {
    return {
      expectedRevision: Number(value.expectedRevision),
      publication: parseIssuePublicationGate(value.publication),
    };
  } catch {
    throw new ReportingPublicationInputError();
  }
}

function samePublication(
  left: Readonly<IssuePublicationGate> | undefined,
  right: Readonly<IssuePublicationGate>,
) {
  return (
    left?.hostnameVisibility === right.hostnameVisibility &&
    left.hostnameConsent === right.hostnameConsent &&
    left.evidenceBasis === right.evidenceBasis &&
    left.hostname === right.hostname
  );
}

export async function handleReportingPublication(
  request: Request,
  dependencies: Readonly<ReportingPublicationDependencies>,
): Promise<Response> {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  if (
    request.headers.get('content-type')?.toLowerCase() !== 'application/json' ||
    request.headers.has('content-encoding')
  ) {
    return jsonResponse(
      { error: 'Content-Type must be exactly application/json.' },
      415,
    );
  }
  const now = (dependencies.now ?? Date.now)();
  try {
    const reportId = routeReportId(request);
    const idempotencyKey = requestId(request);
    const input = await parseBody(request);
    const current = await loadReportingLedger(authorized.database, reportId);
    if (!current) return jsonResponse({ error: 'Report was not found.' }, 404);
    const existing = await loadReportingRequestEvent(
      authorized.database,
      reportId,
      idempotencyKey,
    );
    if (existing) {
      const publication = await loadReportingPublication(
        authorized.database,
        reportId,
      );
      if (
        existing.actor.id !== authorized.actor.id ||
        existing.actor.role !== 'publisher' ||
        existing.revision !== input.expectedRevision + 1 ||
        existing.to !== 'published' ||
        !publication ||
        !samePublication(current.record.moderation.publication, input.publication)
      ) {
        return jsonResponse({ error: 'Reporting request conflicts.' }, 409);
      }
      return jsonResponse(
        {
          schemaVersion: REPORTING_PUBLICATION_RESPONSE_SCHEMA_VERSION,
          disposition: 'existing',
          reportId,
          state: current.record.moderation.state,
          revision: current.record.revision,
          publication: publication.record,
          assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
        },
        200,
      );
    }
    if (
      current.record.revision !== input.expectedRevision ||
      current.record.moderation.state !== 'accepted_private'
    ) {
      return jsonResponse(
        { error: 'Report is not at the approved publication revision.' },
        409,
      );
    }
    const next = transitionReportingLedger(
      current.record,
      {
        to: 'published',
        at: new Date(now).toISOString(),
        publication: input.publication,
      },
      {
        actor: { id: authorized.actor.id, role: 'publisher' },
        expectedRevision: input.expectedRevision,
        requestId: idempotencyKey,
      },
      { eventId: dependencies.eventId ?? randomUUID },
    );
    const result = await saveReportingTransition(authorized.database, next);
    const publication = await loadReportingPublication(
      authorized.database,
      reportId,
    );
    if (!publication) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse(
      {
        schemaVersion: REPORTING_PUBLICATION_RESPONSE_SCHEMA_VERSION,
        disposition: result.disposition,
        reportId,
        state: result.ledger.record.moderation.state,
        revision: result.ledger.record.revision,
        publication: publication.record,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      200,
    );
  } catch (error) {
    if (error instanceof ReportingPublicationBodyTooLargeError) {
      return jsonResponse({ error: 'Publication request is too large.' }, 413);
    }
    if (error instanceof ReportingPublicationInputError) {
      return jsonResponse({ error: 'Publication request was rejected.' }, 400);
    }
    if (error instanceof ReportingStoreConflictError) {
      return jsonResponse({ error: 'Reporting request conflicts.' }, 409);
    }
    if (error instanceof ReportingStoreIntegrityError) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse({ error: 'Publication request was rejected.' }, 400);
  }
}

export function handleReportingPublicationUnsupportedMethod(
  request: Request,
  dependencies: Readonly<ReportingPublicationDependencies>,
): Response {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  return jsonResponse(
    { error: 'Method not allowed.' },
    405,
    { Allow: 'POST' },
  );
}
