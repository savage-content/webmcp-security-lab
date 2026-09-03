import { randomUUID } from 'node:crypto';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import { authenticateReportingActor } from './auth';
import {
  loadReportingServiceConfiguration,
  type ReportingActorConfiguration,
} from './config';
import {
  REPORTING_DELETION_REASONS,
  type ReportingDeletionReason,
} from './deletion-core';
import {
  deleteReportingRecord,
  reportingDeletionRequestSha256,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
} from './store';

export const REPORTING_DELETION_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-deletion-response/1' as const;

const MAX_BODY_BYTES = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BODY_FIELDS = new Set(['expectedRetentionRevision', 'reason']);

class ReportingDeletionInputError extends Error {}
class ReportingDeletionBodyTooLargeError extends Error {}

export interface ReportingDeletionDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
  tombstoneId?: () => string;
}

type ReportingDeletionAuthority =
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
  const values = new Headers(responseHeaders);
  new Headers(headers).forEach((value, key) => values.set(key, value));
  return Response.json(body, { status, headers: values });
}

function authority(
  request: Request,
  dependencies: Readonly<ReportingDeletionDependencies>,
): ReportingDeletionAuthority {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(dependencies.environment);
  } catch {
    return {
      response: jsonResponse({ error: 'Reporting service unavailable.' }, 503),
    } as const;
  }
  if (configuration.mode !== 'invited' || !configuration.gates.lifecycle) {
    return { response: jsonResponse({ error: 'Not found.' }, 404) } as const;
  }
  const actor = authenticateReportingActor(request, configuration, 'custodian');
  if (!actor) {
    return {
      response: jsonResponse(
        { error: 'Custodian authority is invalid.' },
        401,
        { 'WWW-Authenticate': 'Bearer' },
      ),
    } as const;
  }
  if (!dependencies.database) {
    return {
      response: jsonResponse({ error: 'Reporting service unavailable.' }, 503),
    } as const;
  }
  if (request.headers.has('origin')) {
    return {
      response: jsonResponse(
        { error: 'Browser-origin deletion is not enabled.' },
        403,
      ),
    } as const;
  }
  return { actor, database: dependencies.database } as const;
}

function routeReportId(request: Request) {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const value = parts.at(-2);
  if (parts.at(-1) !== 'delete' || !value || !UUID_PATTERN.test(value)) {
    throw new ReportingDeletionInputError();
  }
  return value;
}

function requestId(request: Request) {
  const value = request.headers.get('idempotency-key');
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingDeletionInputError();
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
    throw new ReportingDeletionBodyTooLargeError();
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
        throw new ReportingDeletionBodyTooLargeError();
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
    throw new ReportingDeletionInputError();
  }
}

async function parseBody(request: Request) {
  let value: unknown;
  try {
    value = JSON.parse(await boundedBody(request)) as unknown;
  } catch (error) {
    if (error instanceof ReportingDeletionBodyTooLargeError) throw error;
    throw new ReportingDeletionInputError();
  }
  if (!isRecord(value)) throw new ReportingDeletionInputError();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !BODY_FIELDS.has(key)) {
      throw new ReportingDeletionInputError();
    }
  }
  if (
    !Number.isSafeInteger(value.expectedRetentionRevision) ||
    Number(value.expectedRetentionRevision) < 1 ||
    typeof value.reason !== 'string' ||
    !REPORTING_DELETION_REASONS.includes(
      value.reason as ReportingDeletionReason,
    )
  ) {
    throw new ReportingDeletionInputError();
  }
  return Object.freeze({
    expectedRetentionRevision: Number(value.expectedRetentionRevision),
    reason: value.reason as ReportingDeletionReason,
  });
}

export async function handleReportingDeletion(
  request: Request,
  dependencies: Readonly<ReportingDeletionDependencies>,
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
    const result = await deleteReportingRecord(authorized.database, {
      reportId,
      expectedRetentionRevision: input.expectedRetentionRevision,
      reason: input.reason,
      custodianId: authorized.actor.id,
      requestId: idempotencyKey,
      requestSha256: reportingDeletionRequestSha256({
        reportId,
        expectedRetentionRevision: input.expectedRetentionRevision,
        reason: input.reason,
      }),
      now: (dependencies.now ?? Date.now)(),
      tombstoneId: dependencies.tombstoneId ?? randomUUID,
    });
    return jsonResponse(
      {
        schemaVersion: REPORTING_DELETION_RESPONSE_SCHEMA_VERSION,
        disposition: result.disposition,
        tombstone: result.tombstone,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      200,
    );
  } catch (error) {
    if (error instanceof ReportingDeletionBodyTooLargeError) {
      return jsonResponse({ error: 'Deletion request is too large.' }, 413);
    }
    if (error instanceof ReportingDeletionInputError) {
      return jsonResponse({ error: 'Deletion request was rejected.' }, 400);
    }
    if (error instanceof ReportingStoreConflictError) {
      return jsonResponse({ error: 'Deletion request conflicts.' }, 409);
    }
    if (error instanceof ReportingStoreIntegrityError) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse({ error: 'Deletion request was rejected.' }, 400);
  }
}

export function handleReportingDeletionUnsupportedMethod(
  request: Request,
  dependencies: Readonly<ReportingDeletionDependencies>,
) {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
