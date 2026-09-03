import { randomUUID } from 'node:crypto';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import { authenticateReportingActor } from './auth';
import {
  REPORTING_PUBLIC_CORRECTION_ACTIONS,
  REPORTING_PUBLIC_CORRECTION_REASONS,
  type ReportingPublicCorrectionAction,
  type ReportingPublicCorrectionReason,
} from './correction-core';
import {
  loadReportingServiceConfiguration,
  type ReportingActorConfiguration,
} from './config';
import {
  reportingCorrectionRequestSha256,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
  saveReportingCorrection,
} from './store';

export const REPORTING_CORRECTION_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-correction-response/1' as const;

const MAX_BODY_BYTES = 384;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BODY_FIELDS = new Set(['action', 'reason']);

class ReportingCorrectionInputError extends Error {}
class ReportingCorrectionBodyTooLargeError extends Error {}

export interface ReportingCorrectionDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
  correctionId?: () => string;
}

type ReportingCorrectionAuthority =
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
  dependencies: Readonly<ReportingCorrectionDependencies>,
): ReportingCorrectionAuthority {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(dependencies.environment);
  } catch {
    return {
      response: jsonResponse({ error: 'Reporting service unavailable.' }, 503),
    } as const;
  }
  if (configuration.mode !== 'invited' || !configuration.gates.correction) {
    return { response: jsonResponse({ error: 'Not found.' }, 404) } as const;
  }
  const actor = authenticateReportingActor(request, configuration, 'custodian');
  if (!actor) {
    return {
      response: jsonResponse(
        { error: 'Correction authority is invalid.' },
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
        { error: 'Browser-origin correction is not enabled.' },
        403,
      ),
    } as const;
  }
  return { actor, database: dependencies.database } as const;
}

function routePublicId(request: Request) {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const value = parts.at(-1);
  if (parts.at(-2) !== 'corrections' || !value || !UUID_PATTERN.test(value)) {
    throw new ReportingCorrectionInputError();
  }
  return value;
}

function requestId(request: Request) {
  const value = request.headers.get('idempotency-key');
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ReportingCorrectionInputError();
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
    throw new ReportingCorrectionBodyTooLargeError();
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
        throw new ReportingCorrectionBodyTooLargeError();
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
    throw new ReportingCorrectionInputError();
  }
}

async function parseBody(request: Request) {
  let value: unknown;
  try {
    value = JSON.parse(await boundedBody(request)) as unknown;
  } catch (error) {
    if (error instanceof ReportingCorrectionBodyTooLargeError) throw error;
    throw new ReportingCorrectionInputError();
  }
  if (!isRecord(value)) throw new ReportingCorrectionInputError();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !BODY_FIELDS.has(key)) {
      throw new ReportingCorrectionInputError();
    }
  }
  if (
    typeof value.action !== 'string' ||
    !REPORTING_PUBLIC_CORRECTION_ACTIONS.includes(
      value.action as ReportingPublicCorrectionAction,
    ) ||
    typeof value.reason !== 'string' ||
    !REPORTING_PUBLIC_CORRECTION_REASONS.includes(
      value.reason as ReportingPublicCorrectionReason,
    )
  ) {
    throw new ReportingCorrectionInputError();
  }
  return Object.freeze({
    action: value.action as ReportingPublicCorrectionAction,
    reason: value.reason as ReportingPublicCorrectionReason,
  });
}

export async function handleReportingCorrection(
  request: Request,
  dependencies: Readonly<ReportingCorrectionDependencies>,
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
    const publicId = routePublicId(request);
    const idempotencyKey = requestId(request);
    const input = await parseBody(request);
    const result = await saveReportingCorrection(authorized.database, {
      publicId,
      action: input.action,
      reason: input.reason,
      custodianId: authorized.actor.id,
      requestId: idempotencyKey,
      requestSha256: reportingCorrectionRequestSha256({
        publicId,
        action: input.action,
        reason: input.reason,
      }),
      now: (dependencies.now ?? Date.now)(),
      correctionId: dependencies.correctionId ?? randomUUID,
    });
    return jsonResponse(
      {
        schemaVersion: REPORTING_CORRECTION_RESPONSE_SCHEMA_VERSION,
        disposition: result.disposition,
        correction: result.correction,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      result.disposition === 'created' ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof ReportingCorrectionBodyTooLargeError) {
      return jsonResponse({ error: 'Correction request is too large.' }, 413);
    }
    if (error instanceof ReportingCorrectionInputError) {
      return jsonResponse({ error: 'Correction request was rejected.' }, 400);
    }
    if (error instanceof ReportingStoreConflictError) {
      return jsonResponse({ error: 'Correction request conflicts.' }, 409);
    }
    if (error instanceof ReportingStoreIntegrityError) {
      return jsonResponse({ error: 'Reporting service unavailable.' }, 503);
    }
    return jsonResponse({ error: 'Correction request was rejected.' }, 400);
  }
}

export function handleReportingCorrectionUnsupportedMethod(
  request: Request,
  dependencies: Readonly<ReportingCorrectionDependencies>,
) {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
