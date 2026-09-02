import { randomUUID } from 'node:crypto';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import {
  ISSUE_MODERATION_STATES,
  type IssueModerationState,
} from '../connector/issue-publication';
import { authenticateReportingActor } from './auth';
import {
  loadReportingServiceConfiguration,
  type ReportingActorConfiguration,
} from './config';
import { transitionReportingLedger } from './ledger';
import {
  listReportingLedgers,
  loadReportingLedger,
  loadReportingRequestEvent,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
  saveReportingTransition,
  type ReportingLedgerBundle,
  type ReportingReviewCursor,
} from './store';

export const REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-review-response/1' as const;

const MAX_TRANSITION_BYTES = 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRANSITION_FIELDS = new Set(['expectedRevision', 'to']);
const LIST_FIELDS = new Set(['cursor', 'limit', 'state']);

class ReportingReviewInputError extends Error {}
class ReportingReviewBodyTooLargeError extends Error {}

export interface ReportingReviewDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
  eventId?: () => string;
}

type ReportingReviewAuthority =
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

function serviceAuthority(
  request: Request,
  dependencies: Readonly<ReportingReviewDependencies>,
): ReportingReviewAuthority {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(
      dependencies.environment,
    );
  } catch {
    return { response: jsonResponse({ error: 'Reporting service unavailable.' }, 503) } as const;
  }
  if (configuration.mode !== 'invited' || !configuration.gates.moderation) {
    return { response: jsonResponse({ error: 'Not found.' }, 404) } as const;
  }
  const actor = authenticateReportingActor(
    request,
    configuration,
    'reviewer',
  );
  if (!actor) {
    return {
      response: jsonResponse(
        { error: 'Reviewer authority is invalid.' },
        401,
        { 'WWW-Authenticate': 'Bearer' },
      ),
    } as const;
  }
  if (!dependencies.database) {
    return { response: jsonResponse({ error: 'Reporting service unavailable.' }, 503) } as const;
  }
  if (request.headers.has('origin')) {
    return {
      response: jsonResponse(
        { error: 'Browser-origin review is not enabled.' },
        403,
      ),
    } as const;
  }
  return { actor, database: dependencies.database } as const;
}

function reportId(request: Request) {
  const value = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingReviewInputError('Report ID is invalid.');
  }
  return value;
}

function idempotencyKey(request: Request) {
  const value = request.headers.get('idempotency-key');
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingReviewInputError('Idempotency key is invalid.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readTransitionBody(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      !Number.isSafeInteger(Number(contentLength)) ||
      Number(contentLength) > MAX_TRANSITION_BYTES)
  ) {
    throw new ReportingReviewBodyTooLargeError();
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_TRANSITION_BYTES) {
        await reader.cancel();
        throw new ReportingReviewBodyTooLargeError();
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
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new ReportingReviewInputError('Transition body is invalid.');
  }
  if (!isRecord(value)) {
    throw new ReportingReviewInputError('Transition body is invalid.');
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !TRANSITION_FIELDS.has(key)) {
      throw new ReportingReviewInputError('Transition field is invalid.');
    }
  }
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 1 ||
    typeof value.to !== 'string' ||
    !ISSUE_MODERATION_STATES.includes(value.to as IssueModerationState)
  ) {
    throw new ReportingReviewInputError('Transition contract is invalid.');
  }
  return {
    expectedRevision: Number(value.expectedRevision),
    to: value.to as IssueModerationState,
  };
}

function encodeCursor(value: Readonly<ReportingReviewCursor>) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: string) {
  if (
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new ReportingReviewInputError('Review cursor is invalid.');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new ReportingReviewInputError('Review cursor is invalid.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  } catch {
    throw new ReportingReviewInputError('Review cursor is invalid.');
  }
  if (!isRecord(parsed)) {
    throw new ReportingReviewInputError('Review cursor is invalid.');
  }
  if (
    typeof parsed.reportId !== 'string' ||
    !UUID_PATTERN.test(parsed.reportId) ||
    typeof parsed.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.updatedAt)) ||
    new Date(parsed.updatedAt).toISOString() !== parsed.updatedAt
  ) {
    throw new ReportingReviewInputError('Review cursor is invalid.');
  }
  for (const key of Reflect.ownKeys(parsed)) {
    if (
      typeof key !== 'string' ||
      !new Set(['reportId', 'updatedAt']).has(key)
    ) {
      throw new ReportingReviewInputError('Review cursor is invalid.');
    }
  }
  return {
    reportId: parsed.reportId as string,
    updatedAt: parsed.updatedAt as string,
  };
}

function parseListQuery(request: Request) {
  const parameters = new URL(request.url).searchParams;
  for (const key of parameters.keys()) {
    if (!LIST_FIELDS.has(key) || parameters.getAll(key).length !== 1) {
      throw new ReportingReviewInputError('Review query is invalid.');
    }
  }
  const rawLimit = parameters.get('limit');
  if (rawLimit !== null && !/^[1-9][0-9]?$/u.test(rawLimit)) {
    throw new ReportingReviewInputError('Review limit is invalid.');
  }
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (limit > 50) {
    throw new ReportingReviewInputError('Review limit is invalid.');
  }
  const rawState = parameters.get('state');
  if (
    rawState !== null &&
    !ISSUE_MODERATION_STATES.includes(rawState as IssueModerationState)
  ) {
    throw new ReportingReviewInputError('Review state is invalid.');
  }
  const rawCursor = parameters.get('cursor');
  return {
    limit,
    ...(rawState ? { state: rawState as IssueModerationState } : {}),
    ...(rawCursor ? { cursor: decodeCursor(rawCursor) } : {}),
  };
}

function listItem(
  ledger: Readonly<ReportingLedgerBundle>,
) {
  const record = ledger.record;
  return Object.freeze({
    reportId: record.moderation.id,
    state: record.moderation.state,
    revision: record.revision,
    receivedAt: record.moderation.receivedAt,
    updatedAt: record.moderation.updatedAt,
    draft: record.moderation.draft,
  });
}

export async function handleReportingReviewList(
  request: Request,
  dependencies: Readonly<ReportingReviewDependencies>,
): Promise<Response> {
  const authority = serviceAuthority(request, dependencies);
  if ('response' in authority) return authority.response;
  try {
    const result = await listReportingLedgers(
      authority.database,
      parseListQuery(request),
    );
    return jsonResponse(
      {
        schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
        reports: result.ledgers.map(listItem),
        nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof ReportingReviewInputError
            ? 'Review query was rejected.'
            : 'Reporting service unavailable.',
      },
      error instanceof ReportingReviewInputError ? 400 : 503,
    );
  }
}

export async function handleReportingReviewRecord(
  request: Request,
  dependencies: Readonly<ReportingReviewDependencies>,
): Promise<Response> {
  const authority = serviceAuthority(request, dependencies);
  if ('response' in authority) return authority.response;
  try {
    const ledger = await loadReportingLedger(authority.database, reportId(request));
    if (!ledger) return jsonResponse({ error: 'Report was not found.' }, 404);
    return jsonResponse(
      {
        schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
        ledger,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof ReportingReviewInputError
            ? 'Report identifier was rejected.'
            : 'Reporting service unavailable.',
      },
      error instanceof ReportingReviewInputError ? 400 : 503,
    );
  }
}

export async function handleReportingReviewTransition(
  request: Request,
  dependencies: Readonly<ReportingReviewDependencies>,
): Promise<Response> {
  const authority = serviceAuthority(request, dependencies);
  if ('response' in authority) return authority.response;
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
    const id = reportId(request);
    const requestId = idempotencyKey(request);
    const transition = await readTransitionBody(request);
    if (transition.to === 'published') {
      return jsonResponse(
        { error: 'Publication requires separate publisher authority.' },
        403,
      );
    }
    const current = await loadReportingLedger(authority.database, id);
    if (!current) return jsonResponse({ error: 'Report was not found.' }, 404);
    const existing = await loadReportingRequestEvent(
      authority.database,
      id,
      requestId,
    );
    if (existing) {
      if (
        existing.actor.id !== authority.actor.id ||
        existing.actor.role !== 'reviewer' ||
        existing.revision !== transition.expectedRevision + 1 ||
        existing.to !== transition.to
      ) {
        return jsonResponse({ error: 'Reporting request conflicts.' }, 409);
      }
      return jsonResponse(
        {
          schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
          disposition: 'existing',
          reportId: id,
          state: current.record.moderation.state,
          revision: current.record.revision,
          updatedAt: current.record.moderation.updatedAt,
          assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
        },
        200,
      );
    }
    if (current.record.revision !== transition.expectedRevision) {
      return jsonResponse({ error: 'Reporting revision is stale.' }, 409);
    }
    const next = transitionReportingLedger(
      current.record,
      { to: transition.to, at: new Date(now).toISOString() },
      {
        actor: { id: authority.actor.id, role: 'reviewer' },
        expectedRevision: transition.expectedRevision,
        requestId,
      },
      { eventId: dependencies.eventId ?? randomUUID },
    );
    const result = await saveReportingTransition(authority.database, next);
    return jsonResponse(
      {
        schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
        disposition: result.disposition,
        reportId: id,
        state: result.ledger.record.moderation.state,
        revision: result.ledger.record.revision,
        updatedAt: result.ledger.record.moderation.updatedAt,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      result.disposition === 'updated' ? 200 : 200,
    );
  } catch (error) {
    if (error instanceof ReportingReviewBodyTooLargeError) {
      return jsonResponse({ error: 'Review transition is too large.' }, 413);
    }
    if (error instanceof ReportingReviewInputError) {
      return jsonResponse({ error: 'Review transition was rejected.' }, 400);
    }
    if (error instanceof ReportingStoreConflictError) {
      return jsonResponse({ error: 'Reporting request conflicts.' }, 409);
    }
    if (error instanceof ReportingStoreIntegrityError) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse({ error: 'Review transition was rejected.' }, 400);
  }
}

export function handleReportingReviewUnsupportedMethod(
  request: Request,
  dependencies: Readonly<ReportingReviewDependencies>,
  allow: string,
): Response {
  const authority = serviceAuthority(request, dependencies);
  if ('response' in authority) return authority.response;
  return jsonResponse(
    { error: 'Method not allowed.' },
    405,
    { Allow: allow },
  );
}
