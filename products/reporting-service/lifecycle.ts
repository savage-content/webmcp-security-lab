import { randomUUID } from 'node:crypto';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import { authenticateReportingActor } from './auth';
import {
  loadReportingServiceConfiguration,
  type ReportingActorConfiguration,
} from './config';
import { transitionReportingLegalHold } from './retention-core';
import {
  loadReportingRetention,
  loadReportingRetentionRequestEvent,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
  saveReportingRetentionTransition,
} from './store';

export const REPORTING_LIFECYCLE_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-lifecycle-response/1' as const;

const MAX_BODY_BYTES = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BODY_FIELDS = new Set(['expectedRevision', 'legalHold']);

class ReportingLifecycleInputError extends Error {}
class ReportingLifecycleBodyTooLargeError extends Error {}

export interface ReportingLifecycleDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
  eventId?: () => string;
}

type ReportingLifecycleAuthority =
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
  dependencies: Readonly<ReportingLifecycleDependencies>,
): ReportingLifecycleAuthority {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(dependencies.environment);
  } catch {
    return {
      response: jsonResponse({ error: 'Reporting service unavailable.' }, 503),
    };
  }
  if (configuration.mode !== 'invited' || !configuration.gates.lifecycle) {
    return { response: jsonResponse({ error: 'Not found.' }, 404) };
  }
  const actor = authenticateReportingActor(request, configuration, 'custodian');
  if (!actor) {
    return {
      response: jsonResponse(
        { error: 'Custodian authority is invalid.' },
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
        { error: 'Browser-origin lifecycle access is not enabled.' },
        403,
      ),
    };
  }
  return { actor, database: dependencies.database };
}

function routeReportId(request: Request) {
  const value = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingLifecycleInputError();
  }
  return value;
}

function requestId(request: Request) {
  const value = request.headers.get('idempotency-key');
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingLifecycleInputError();
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
      Number(declared) > MAX_BODY_BYTES)
  ) {
    throw new ReportingLifecycleBodyTooLargeError();
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ReportingLifecycleBodyTooLargeError();
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
    throw new ReportingLifecycleInputError();
  }
}

async function parseBody(request: Request) {
  let value: unknown;
  try {
    value = JSON.parse(await boundedBody(request)) as unknown;
  } catch (error) {
    if (error instanceof ReportingLifecycleBodyTooLargeError) throw error;
    throw new ReportingLifecycleInputError();
  }
  if (!isRecord(value)) throw new ReportingLifecycleInputError();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !BODY_FIELDS.has(key)) {
      throw new ReportingLifecycleInputError();
    }
  }
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 1 ||
    typeof value.legalHold !== 'boolean'
  ) {
    throw new ReportingLifecycleInputError();
  }
  return Object.freeze({
    expectedRevision: Number(value.expectedRevision),
    legalHold: value.legalHold,
  });
}

function responseBody(
  reportId: string,
  disposition: 'existing' | 'updated',
  retention: NonNullable<Awaited<ReturnType<typeof loadReportingRetention>>>,
) {
  return Object.freeze({
    schemaVersion: REPORTING_LIFECYCLE_RESPONSE_SCHEMA_VERSION,
    disposition,
    reportId,
    revision: retention.state.revision,
    legalHold: retention.state.legalHold,
    retainUntil: retention.state.retainUntil,
    policyVersion: retention.state.policyVersion,
    updatedAt: retention.state.updatedAt,
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  });
}

export async function handleReportingLifecycleRead(
  request: Request,
  dependencies: Readonly<ReportingLifecycleDependencies>,
): Promise<Response> {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  try {
    const reportId = routeReportId(request);
    const retention = await loadReportingRetention(
      authorized.database,
      reportId,
    );
    if (!retention) {
      return jsonResponse({ error: 'Retention state was not found.' }, 404);
    }
    return jsonResponse(responseBody(reportId, 'existing', retention), 200);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof ReportingLifecycleInputError
            ? 'Lifecycle request was rejected.'
            : 'Reporting service unavailable.',
      },
      error instanceof ReportingLifecycleInputError ? 400 : 503,
    );
  }
}

export async function handleReportingLifecycleTransition(
  request: Request,
  dependencies: Readonly<ReportingLifecycleDependencies>,
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
  try {
    const reportId = routeReportId(request);
    const idempotencyKey = requestId(request);
    const input = await parseBody(request);
    const current = await loadReportingRetention(authorized.database, reportId);
    if (!current) {
      return jsonResponse({ error: 'Retention state was not found.' }, 404);
    }
    const existing = await loadReportingRetentionRequestEvent(
      authorized.database,
      reportId,
      idempotencyKey,
    );
    if (existing) {
      if (
        existing.actor.id !== authorized.actor.id ||
        existing.actor.role !== 'custodian' ||
        existing.revision !== input.expectedRevision + 1 ||
        existing.legalHold !== input.legalHold
      ) {
        return jsonResponse({ error: 'Lifecycle request conflicts.' }, 409);
      }
      return jsonResponse(responseBody(reportId, 'existing', current), 200);
    }
    if (
      current.state.revision !== input.expectedRevision ||
      current.state.legalHold === input.legalHold
    ) {
      return jsonResponse(
        { error: 'Retention revision or legal-hold state conflicts.' },
        409,
      );
    }
    const next = transitionReportingLegalHold(current.state, {
      actor: { id: authorized.actor.id, role: 'custodian' },
      at: new Date((dependencies.now ?? Date.now)()).toISOString(),
      eventId: dependencies.eventId ?? randomUUID,
      held: input.legalHold,
      requestId: idempotencyKey,
    });
    const result = await saveReportingRetentionTransition(
      authorized.database,
      next,
    );
    return jsonResponse(
      responseBody(reportId, result.disposition, result.retention),
      200,
    );
  } catch (error) {
    if (error instanceof ReportingLifecycleBodyTooLargeError) {
      return jsonResponse({ error: 'Lifecycle request is too large.' }, 413);
    }
    if (error instanceof ReportingLifecycleInputError) {
      return jsonResponse({ error: 'Lifecycle request was rejected.' }, 400);
    }
    if (error instanceof ReportingStoreConflictError) {
      return jsonResponse({ error: 'Lifecycle request conflicts.' }, 409);
    }
    if (error instanceof ReportingStoreIntegrityError) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse({ error: 'Lifecycle request was rejected.' }, 400);
  }
}

export function handleReportingLifecycleUnsupportedMethod(
  request: Request,
  dependencies: Readonly<ReportingLifecycleDependencies>,
): Response {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  return jsonResponse({ error: 'Method not allowed.' }, 405, {
    Allow: 'GET, POST',
  });
}
