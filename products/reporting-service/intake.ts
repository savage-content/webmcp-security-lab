import { createHash, randomUUID } from 'node:crypto';

import {
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
  createPrivacySafeIssueDraft,
} from '../connector/issue-draft';
import { authenticateReportingInvitation } from './auth';
import { loadReportingServiceConfiguration } from './config';
import { createReportingLedgerIntake } from './ledger';
import { createReportingRetention } from './retention-core';
import {
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
  ReportingStoreQuotaError,
  saveReportingIntake,
} from './store';

export const REPORTING_INTAKE_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-intake-response/1' as const;

const MAX_INTAKE_BYTES = 2 * 1024;
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INTAKE_FIELDS = new Set(['category', 'severity', 'siteOrigin', 'stage']);

class ReportingInputError extends Error {}
class ReportingBodyTooLargeError extends Error {}

export interface ReportingIntakeDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
  id?: () => string;
  eventId?: () => string;
  retentionEventId?: () => string;
}

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
  return Response.json(body, {
    status,
    headers: responseHeaderValues,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function contentLength(request: Request) {
  const value = request.headers.get('content-length');
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new ReportingInputError('Invalid content length.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ReportingBodyTooLargeError('Content length is too large.');
  }
  return parsed;
}

async function readBoundedBody(request: Request) {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > MAX_INTAKE_BYTES) {
    throw new ReportingBodyTooLargeError('Request body is too large.');
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > MAX_INTAKE_BYTES) {
      await reader.cancel();
      throw new ReportingBodyTooLargeError('Request body is too large.');
    }
    chunks.push(result.value);
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
    throw new ReportingInputError('Request body must be valid UTF-8.');
  }
}

function parseIntakeBody(bodyText: string) {
  let value: unknown;
  try {
    value = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ReportingInputError('Request body must be valid JSON.');
  }
  if (!isRecord(value)) {
    throw new ReportingInputError('Request body must be an object.');
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !INTAKE_FIELDS.has(key)) {
      throw new ReportingInputError('Request body contains an unknown field.');
    }
  }
  const draftInput = {
    context: 'public-web' as const,
    category: value.category,
    severity: value.severity,
    siteOrigin: value.siteOrigin,
    stage: value.stage,
  };
  const canonicalDraft = createPrivacySafeIssueDraft(draftInput);
  return { canonicalDraft, draftInput };
}

function retryAfterSeconds(now: number) {
  const hour = 60 * 60 * 1_000;
  return Math.max(
    1,
    Math.ceil((Math.ceil((now + 1) / hour) * hour - now) / 1_000),
  );
}

export async function handleReportingIntake(
  request: Request,
  dependencies: Readonly<ReportingIntakeDependencies>,
) {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(dependencies.environment);
  } catch {
    return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
  }
  if (configuration.mode !== 'invited' || !configuration.gates.intake) {
    return jsonResponse({ error: 'Not found.' }, 404);
  }
  if (!authenticateReportingInvitation(request, configuration)) {
    return jsonResponse({ error: 'Reporting invitation is invalid.' }, 401, {
      'WWW-Authenticate': 'Bearer',
    });
  }
  if (
    !configuration.intakeInvitationId ||
    !configuration.intakeHourlyLimit ||
    !configuration.globalHourlyLimit ||
    (configuration.gates.lifecycle &&
      (!configuration.retentionDays ||
        !configuration.retentionPolicyVersion)) ||
    !dependencies.database
  ) {
    return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
  }
  if (request.headers.has('origin')) {
    return jsonResponse(
      { error: 'Browser-origin intake is not enabled.' },
      403,
    );
  }
  if (
    request.headers.get('content-type')?.toLowerCase() !== 'application/json' ||
    request.headers.has('content-encoding')
  ) {
    return jsonResponse(
      { error: 'Content-Type must be exactly application/json.' },
      415,
    );
  }
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return jsonResponse(
      { error: 'A lowercase UUID Idempotency-Key is required.' },
      400,
    );
  }

  const now = (dependencies.now ?? Date.now)();
  try {
    const { canonicalDraft, draftInput } = parseIntakeBody(
      await readBoundedBody(request),
    );
    const bundle = createReportingLedgerIntake(
      draftInput,
      {
        actor: {
          id: configuration.intakeInvitationId,
          role: 'intake',
        },
        requestId: idempotencyKey,
      },
      {
        id: dependencies.id ?? randomUUID,
        eventId: dependencies.eventId ?? randomUUID,
        now: () => now,
      },
    );
    const retention = configuration.gates.lifecycle
      ? createReportingRetention(
          {
            reportId: bundle.record.moderation.id,
            receivedAt: bundle.record.moderation.receivedAt,
            retentionDays: configuration.retentionDays!,
            policyVersion: configuration.retentionPolicyVersion!,
            requestId: idempotencyKey,
          },
          { eventId: dependencies.retentionEventId ?? randomUUID },
        )
      : undefined;
    const result = await saveReportingIntake(
      dependencies.database,
      bundle,
      {
        invitationId: configuration.intakeInvitationId,
        keySha256: sha256(idempotencyKey),
        requestSha256: sha256(JSON.stringify(canonicalDraft)),
      },
      {
        invitationId: configuration.intakeInvitationId,
        invitationLimit: configuration.intakeHourlyLimit,
        globalLimit: configuration.globalHourlyLimit,
        now,
      },
      retention,
    );
    const record = result.ledger.record;
    return jsonResponse(
      {
        schemaVersion: REPORTING_INTAKE_RESPONSE_SCHEMA_VERSION,
        disposition: result.disposition,
        reportId: record.moderation.id,
        state: record.moderation.state,
        revision: record.revision,
        receivedAt: record.moderation.receivedAt,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      result.disposition === 'created' ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof ReportingBodyTooLargeError) {
      return jsonResponse({ error: 'Report input is too large.' }, 413);
    }
    if (error instanceof ReportingStoreQuotaError) {
      return jsonResponse(
        { error: 'Reporting intake quota is exhausted.' },
        429,
        { 'Retry-After': String(retryAfterSeconds(now)) },
      );
    }
    if (error instanceof ReportingStoreConflictError) {
      return jsonResponse({ error: 'Reporting request conflicts.' }, 409);
    }
    if (error instanceof ReportingStoreIntegrityError) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse({ error: 'Report input was rejected.' }, 400);
  }
}
