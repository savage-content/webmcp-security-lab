import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import { authenticateReportingFeed } from './auth';
import { loadReportingServiceConfiguration } from './config';
import { signReportingFeedBytes } from './feed-signing';
import {
  listReportingPublicFeedEntries,
  ReportingStoreIntegrityError,
  type ReportingPublicFeedCursor,
  type ReportingPublicFeedEntry,
} from './store';

export const REPORTING_FEED_PAGE_SCHEMA_VERSION =
  'leftout.reporting-feed-page/2' as const;

export const REPORTING_FEED_FORMATS = ['json', 'ndjson'] as const;
export type ReportingFeedFormat = (typeof REPORTING_FEED_FORMATS)[number];

const QUERY_FIELDS = new Set(['cursor', 'format', 'limit']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

class ReportingFeedInputError extends Error {}

export interface ReportingFeedDependencies {
  environment: Readonly<Record<string, unknown>>;
  database?: D1Database;
  now?: () => number;
}

type FeedAuthority =
  | Readonly<{ response: Response }>
  | Readonly<{
      configuration: ReturnType<typeof loadReportingServiceConfiguration>;
      database: D1Database;
    }>;

const securityHeaders = Object.freeze({
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function jsonError(message: string, status: number, headers?: HeadersInit) {
  const values = new Headers(securityHeaders);
  new Headers(headers).forEach((value, key) => values.set(key, value));
  return Response.json({ error: message }, { status, headers: values });
}

function authority(
  request: Request,
  dependencies: Readonly<ReportingFeedDependencies>,
): FeedAuthority {
  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(dependencies.environment);
  } catch {
    return {
      response: jsonError('Reporting service unavailable.', 503),
    };
  }
  if (
    configuration.mode !== 'invited' ||
    !configuration.gates.feed ||
    !configuration.feedSigning
  ) {
    return { response: jsonError('Not found.', 404) };
  }
  if (!authenticateReportingFeed(request, configuration)) {
    return {
      response: jsonError('Feed authority is invalid.', 401, {
        'WWW-Authenticate': 'Bearer',
      }),
    };
  }
  if (!dependencies.database) {
    return {
      response: jsonError('Reporting service unavailable.', 503),
    };
  }
  if (request.headers.has('origin')) {
    return {
      response: jsonError('Browser-origin feed access is not enabled.', 403),
    };
  }
  return { configuration, database: dependencies.database };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactTime(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new ReportingFeedInputError();
  }
  return value;
}

interface FeedCursor extends ReportingPublicFeedCursor {
  snapshotAt: string;
}

function encodeCursor(value: Readonly<FeedCursor>) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: string): Readonly<FeedCursor> {
  if (
    value.length < 1 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new ReportingFeedInputError();
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new ReportingFeedInputError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(decoded),
    ) as unknown;
  } catch {
    throw new ReportingFeedInputError();
  }
  if (!isRecord(parsed)) throw new ReportingFeedInputError();
  const keys = Reflect.ownKeys(parsed);
  if (
    keys.length !== 4 ||
    keys.some((key) => typeof key !== 'string') ||
    !Object.hasOwn(parsed, 'entryType') ||
    !Object.hasOwn(parsed, 'entryId') ||
    !Object.hasOwn(parsed, 'occurredAt') ||
    !Object.hasOwn(parsed, 'snapshotAt') ||
    typeof parsed.entryType !== 'string' ||
    !['correction', 'publication'].includes(parsed.entryType) ||
    typeof parsed.entryId !== 'string' ||
    !UUID_PATTERN.test(parsed.entryId)
  ) {
    throw new ReportingFeedInputError();
  }
  const occurredAt = exactTime(parsed.occurredAt);
  const snapshotAt = exactTime(parsed.snapshotAt);
  if (Date.parse(occurredAt) > Date.parse(snapshotAt)) {
    throw new ReportingFeedInputError();
  }
  return Object.freeze({
    entryType: parsed.entryType as 'correction' | 'publication',
    entryId: parsed.entryId,
    occurredAt,
    snapshotAt,
  });
}

function parseQuery(request: Request, now: number) {
  const parameters = new URL(request.url).searchParams;
  for (const key of parameters.keys()) {
    if (!QUERY_FIELDS.has(key) || parameters.getAll(key).length !== 1) {
      throw new ReportingFeedInputError();
    }
  }
  const rawFormat = parameters.get('format') ?? 'json';
  if (!REPORTING_FEED_FORMATS.includes(rawFormat as ReportingFeedFormat)) {
    throw new ReportingFeedInputError();
  }
  const rawLimit = parameters.get('limit');
  if (rawLimit !== null && !/^[1-9][0-9]{0,2}$/u.test(rawLimit)) {
    throw new ReportingFeedInputError();
  }
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > 100) {
    throw new ReportingFeedInputError();
  }
  const cursorValue = parameters.get('cursor');
  const cursor = cursorValue ? decodeCursor(cursorValue) : undefined;
  const current = exactTime(new Date(now).toISOString());
  return Object.freeze({
    format: rawFormat as ReportingFeedFormat,
    limit,
    snapshotAt: cursor?.snapshotAt ?? current,
    ...(cursor
      ? {
          cursor: Object.freeze({
            entryType: cursor.entryType,
            entryId: cursor.entryId,
            occurredAt: cursor.occurredAt,
          }),
        }
      : {}),
  });
}

function publicEntry(entry: Readonly<ReportingPublicFeedEntry>) {
  if (entry.entryType === 'publication') {
    return Object.freeze({
      type: 'publication' as const,
      entryId: entry.entryId,
      occurredAt: entry.occurredAt,
      publicId: entry.publication.publicId,
      recordSha256: entry.publication.recordSha256,
      record: entry.publication.record,
    });
  }
  return Object.freeze({
    type: 'correction' as const,
    entryId: entry.entryId,
    occurredAt: entry.occurredAt,
    publicId: entry.correction.publicId,
    correctionSha256: entry.correction.correctionSha256,
    correction: entry.correction,
  });
}

function jsonBytes(input: {
  generatedAt: string;
  snapshotAt: string;
  entries: readonly ReturnType<typeof publicEntry>[];
  nextCursor: string | null;
}) {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: REPORTING_FEED_PAGE_SCHEMA_VERSION,
      format: 'json',
      generatedAt: input.generatedAt,
      snapshotAt: input.snapshotAt,
      entries: input.entries,
      nextCursor: input.nextCursor,
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    }),
  );
}

function ndjsonBytes(input: {
  generatedAt: string;
  snapshotAt: string;
  entries: readonly ReturnType<typeof publicEntry>[];
  nextCursor: string | null;
}) {
  const lines = [
    JSON.stringify({
      type: 'metadata',
      schemaVersion: REPORTING_FEED_PAGE_SCHEMA_VERSION,
      format: 'ndjson',
      generatedAt: input.generatedAt,
      snapshotAt: input.snapshotAt,
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    }),
    ...input.entries.map((entry) => JSON.stringify(entry)),
    JSON.stringify({ type: 'page', nextCursor: input.nextCursor }),
  ];
  return new TextEncoder().encode(`${lines.join('\n')}\n`);
}

export async function handleReportingFeed(
  request: Request,
  dependencies: Readonly<ReportingFeedDependencies>,
): Promise<Response> {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  try {
    const now = (dependencies.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new ReportingStoreIntegrityError('Reporting feed time is invalid.');
    }
    const query = parseQuery(request, now);
    const page = await listReportingPublicFeedEntries(authorized.database, {
      limit: query.limit,
      through: query.snapshotAt,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const generatedAt = new Date(now).toISOString();
    const entries = Object.freeze(page.entries.map(publicEntry));
    const nextCursor = page.nextCursor
      ? encodeCursor({ ...page.nextCursor, snapshotAt: query.snapshotAt })
      : null;
    const bytes =
      query.format === 'json'
        ? jsonBytes({
            generatedAt,
            snapshotAt: query.snapshotAt,
            entries,
            nextCursor,
          })
        : ndjsonBytes({
            generatedAt,
            snapshotAt: query.snapshotAt,
            entries,
            nextCursor,
          });
    const feedSigning = authorized.configuration.feedSigning;
    if (!feedSigning) {
      throw new ReportingStoreIntegrityError(
        'Reporting feed signer is unavailable.',
      );
    }
    const signature = signReportingFeedBytes(bytes, feedSigning);
    const headers = new Headers(securityHeaders);
    headers.set(
      'Content-Type',
      query.format === 'json'
        ? 'application/json; charset=utf-8'
        : 'application/x-ndjson; charset=utf-8',
    );
    headers.set('Content-Digest', `sha-256=:${signature.bodySha256Base64}:`);
    headers.set('X-LeftOut-Feed-Schema', REPORTING_FEED_PAGE_SCHEMA_VERSION);
    headers.set('X-LeftOut-Feed-Signature-Algorithm', signature.algorithm);
    headers.set('X-LeftOut-Feed-Signature', signature.signatureBase64);
    headers.set('X-LeftOut-Feed-Key-Id', signature.keyId);
    headers.set(
      'X-LeftOut-Feed-Public-Key-SPKI',
      signature.publicKeySpkiBase64,
    );
    headers.set(
      'X-LeftOut-Feed-Public-Key-SHA256',
      signature.publicKeySpkiSha256,
    );
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    return jsonError(
      error instanceof ReportingFeedInputError
        ? 'Feed query was rejected.'
        : 'Reporting service unavailable.',
      error instanceof ReportingFeedInputError ? 400 : 503,
    );
  }
}

export function handleReportingFeedUnsupportedMethod(
  request: Request,
  dependencies: Readonly<ReportingFeedDependencies>,
) {
  const authorized = authority(request, dependencies);
  if ('response' in authorized) return authorized.response;
  return jsonError('Method not allowed.', 405, { Allow: 'GET' });
}
