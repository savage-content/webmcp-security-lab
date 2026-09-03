import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import { canonicalJson } from '../../lib/capability-core';
import {
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
  createPrivacySafeIssueDraft,
  type PrivacySafeIssueDraft,
} from '../connector/issue-draft';
import {
  ISSUE_MODERATION_STATES,
  type IssueModerationState,
} from '../connector/issue-publication';
import {
  parseReportingLedgerBundle,
  type ReportingLedgerRecord,
  type ReportingLedgerEvent,
} from '../reporting-service/ledger';
import { REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION } from '../reporting-service/review';

export const REPORTING_REVIEWER_ENVIRONMENT = Object.freeze({
  mode: 'LEFTOUT_REPORTING_REVIEWER_MODE',
  serviceOrigin: 'LEFTOUT_REPORTING_REVIEWER_SERVICE_ORIGIN',
  token: 'LEFTOUT_REPORTING_REVIEWER_TOKEN',
});

const PUBLIC_LEARNING_HOST =
  'left-out-webmcp-security-lab.taitfor.chatgpt.site';
const MAX_RESPONSE_BYTES = 256 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REVIEWER_TARGETS = new Set<IssueModerationState>([
  'under_review',
  'needs_evidence',
  'accepted_private',
  'duplicate',
  'rejected',
]);
const NON_PUBLIC_HOST_SUFFIXES = [
  '.home',
  '.home.arpa',
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.test',
];

export interface ReportingReviewListItem {
  reportId: string;
  state: IssueModerationState;
  revision: number;
  receivedAt: string;
  updatedAt: string;
  draft: Readonly<PrivacySafeIssueDraft>;
}

export interface ReportingReviewListPage {
  reports: readonly Readonly<ReportingReviewListItem>[];
  nextCursor: string | null;
  assuranceLimitation: typeof ISSUE_DRAFT_ASSURANCE_LIMITATION;
}

export interface ReportingReviewDetail {
  record: Readonly<ReportingLedgerRecord>;
  events: readonly Readonly<ReportingLedgerEvent>[];
  assuranceLimitation: typeof ISSUE_DRAFT_ASSURANCE_LIMITATION;
}

export interface ReportingReviewTransitionReceipt {
  disposition: 'existing' | 'updated';
  reportId: string;
  state: IssueModerationState;
  revision: number;
  updatedAt: string;
  assuranceLimitation: typeof ISSUE_DRAFT_ASSURANCE_LIMITATION;
}

type ReviewerConfiguration =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'invited';
      serviceOrigin: string;
      token: string;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => typeof key === 'string' && expected.includes(key))
  );
}

function environmentString(
  environment: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = environment[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string when configured.`);
  }
  return value;
}

function containsForbiddenTokenCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

function reviewerToken(value: string | undefined) {
  if (
    !value ||
    value.length < 32 ||
    value.length > 512 ||
    value !== value.trim() ||
    containsForbiddenTokenCharacter(value)
  ) {
    throw new Error(
      'Reviewer token must be a header-safe 32–512 character secret.',
    );
  }
  return value;
}

function publicServiceOrigin(value: string | undefined) {
  if (!value || value !== value.trim() || value.length > 512) {
    throw new Error('Reviewer service origin is required.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Reviewer service origin is invalid.');
  }
  const hostname = url.hostname.toLowerCase();
  const address =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    value !== url.origin ||
    hostname === PUBLIC_LEARNING_HOST ||
    hostname === 'localhost' ||
    isIP(address) !== 0 ||
    !hostname.includes('.') ||
    NON_PUBLIC_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    throw new Error(
      'Reviewer service must be a separate credential-free public HTTPS origin.',
    );
  }
  return url.origin;
}

export function loadReportingReviewerConfiguration(
  environment: Readonly<Record<string, unknown>>,
): ReviewerConfiguration {
  const mode = environmentString(
    environment,
    REPORTING_REVIEWER_ENVIRONMENT.mode,
  );
  const serviceOrigin = environmentString(
    environment,
    REPORTING_REVIEWER_ENVIRONMENT.serviceOrigin,
  );
  const token = environmentString(
    environment,
    REPORTING_REVIEWER_ENVIRONMENT.token,
  );
  if (mode === undefined || mode === 'disabled') {
    if (serviceOrigin !== undefined || token !== undefined) {
      throw new Error(
        'Disabled reviewer mode cannot retain an endpoint or credential.',
      );
    }
    return Object.freeze({ mode: 'disabled' });
  }
  if (mode !== 'invited') {
    throw new Error('Reviewer mode must be disabled or invited.');
  }
  return Object.freeze({
    mode,
    serviceOrigin: publicServiceOrigin(serviceOrigin),
    token: reviewerToken(token),
  });
}

function exactIsoTime(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function reportId(value: unknown) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error('Remote report identity is invalid.');
  }
  return value;
}

function moderationState(value: unknown) {
  if (
    typeof value !== 'string' ||
    !ISSUE_MODERATION_STATES.includes(value as IssueModerationState)
  ) {
    throw new Error('Remote moderation state is invalid.');
  }
  return value as IssueModerationState;
}

function canonicalDraft(value: unknown) {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'assuranceLimitation',
      'category',
      'context',
      'schemaVersion',
      'severity',
      'siteOrigin',
      'stage',
      'submission',
    ])
  ) {
    throw new Error('Remote report draft is invalid.');
  }
  const draft = createPrivacySafeIssueDraft({
    context: value.context,
    category: value.category,
    severity: value.severity,
    siteOrigin: value.siteOrigin,
    stage: value.stage,
  });
  if (
    draft.context !== 'public-web' ||
    canonicalJson(draft) !== canonicalJson(value)
  ) {
    throw new Error('Remote report draft is not canonical.');
  }
  return draft;
}

function cursor(value: unknown) {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new Error('Remote review cursor is invalid.');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Remote review cursor is invalid.');
  }
  return value;
}

function parseListItem(value: unknown): Readonly<ReportingReviewListItem> {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'draft',
      'receivedAt',
      'reportId',
      'revision',
      'state',
      'updatedAt',
    ]) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1
  ) {
    throw new Error('Remote review list item is invalid.');
  }
  return Object.freeze({
    reportId: reportId(value.reportId),
    state: moderationState(value.state),
    revision: Number(value.revision),
    receivedAt: exactIsoTime(value.receivedAt, 'Remote received time'),
    updatedAt: exactIsoTime(value.updatedAt, 'Remote update time'),
    draft: canonicalDraft(value.draft),
  });
}

function parseListResponse(value: unknown): Readonly<ReportingReviewListPage> {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'assuranceLimitation',
      'nextCursor',
      'reports',
      'schemaVersion',
    ]) ||
    value.schemaVersion !== REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION ||
    value.assuranceLimitation !== ISSUE_DRAFT_ASSURANCE_LIMITATION ||
    !Array.isArray(value.reports) ||
    value.reports.length > 20
  ) {
    throw new Error('Remote review list response is invalid.');
  }
  return Object.freeze({
    reports: Object.freeze(value.reports.map(parseListItem)),
    nextCursor: cursor(value.nextCursor),
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  });
}

function parseDetailResponse(
  value: unknown,
  expectedReportId: string,
): Readonly<ReportingReviewDetail> {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['assuranceLimitation', 'ledger', 'schemaVersion']) ||
    value.schemaVersion !== REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION ||
    value.assuranceLimitation !== ISSUE_DRAFT_ASSURANCE_LIMITATION ||
    !isRecord(value.ledger) ||
    !exactKeys(value.ledger, ['events', 'record'])
  ) {
    throw new Error('Remote review detail response is invalid.');
  }
  const ledger = parseReportingLedgerBundle(
    value.ledger.record,
    value.ledger.events,
  );
  if (ledger.record.moderation.id !== expectedReportId) {
    throw new Error(
      'Remote review detail does not match the requested report.',
    );
  }
  return Object.freeze({
    ...ledger,
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  });
}

function parseTransitionResponse(
  value: unknown,
  expectedReportId: string,
): Readonly<ReportingReviewTransitionReceipt> {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'assuranceLimitation',
      'disposition',
      'reportId',
      'revision',
      'schemaVersion',
      'state',
      'updatedAt',
    ]) ||
    value.schemaVersion !== REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION ||
    value.assuranceLimitation !== ISSUE_DRAFT_ASSURANCE_LIMITATION ||
    !['existing', 'updated'].includes(String(value.disposition)) ||
    reportId(value.reportId) !== expectedReportId ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 2
  ) {
    throw new Error('Remote transition response is invalid.');
  }
  return Object.freeze({
    disposition: value.disposition as 'existing' | 'updated',
    reportId: expectedReportId,
    state: moderationState(value.state),
    revision: Number(value.revision),
    updatedAt: exactIsoTime(value.updatedAt, 'Remote transition time'),
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  });
}

async function boundedJson(response: Response) {
  const declared = response.headers.get('content-length');
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declared) ||
      !Number.isSafeInteger(Number(declared)) ||
      Number(declared) > MAX_RESPONSE_BYTES)
  ) {
    throw new Error('Remote reviewer response exceeds its byte boundary.');
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Remote reviewer response exceeds its byte boundary.');
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
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error('Remote reviewer response is not valid UTF-8 JSON.');
  }
}

export interface ReportingReviewerClientOptions {
  environment?: Readonly<Record<string, unknown>>;
  fetch?: typeof fetch;
  requestId?: () => string;
  timeoutMs?: number;
}

export class ReportingReviewerClient {
  readonly #configuration: ReviewerConfiguration;
  readonly #fetch: typeof fetch;
  readonly #requestId: () => string;
  readonly #timeoutMs: number;

  constructor(options: ReportingReviewerClientOptions = {}) {
    this.#configuration = loadReportingReviewerConfiguration(
      options.environment ?? process.env,
    );
    this.#fetch = options.fetch ?? fetch;
    this.#requestId = options.requestId ?? randomUUID;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (this.#timeoutMs < 1_000 || this.#timeoutMs > 30_000) {
      throw new Error('Reviewer request timeout must be 1 to 30 seconds.');
    }
  }

  status() {
    return Object.freeze(
      this.#configuration.mode === 'invited'
        ? {
            connected: true as const,
            serviceOrigin: this.#configuration.serviceOrigin,
          }
        : { connected: false as const },
    );
  }

  async list(nextCursor?: string): Promise<Readonly<ReportingReviewListPage>> {
    const configuration = this.enabledConfiguration();
    const url = new URL('/api/reports/review', configuration.serviceOrigin);
    url.searchParams.set('limit', '20');
    if (nextCursor !== undefined)
      url.searchParams.set('cursor', cursor(nextCursor) ?? '');
    return parseListResponse(await this.request(url, { method: 'GET' }));
  }

  async detail(idValue: string): Promise<Readonly<ReportingReviewDetail>> {
    const configuration = this.enabledConfiguration();
    const id = reportId(idValue);
    const value = await this.request(
      new URL(`/api/reports/review/${id}`, configuration.serviceOrigin),
      { method: 'GET' },
    );
    return parseDetailResponse(value, id);
  }

  async transition(input: {
    reportId: string;
    expectedRevision: number;
    to: IssueModerationState;
  }): Promise<Readonly<ReportingReviewTransitionReceipt>> {
    const configuration = this.enabledConfiguration();
    const id = reportId(input.reportId);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !REVIEWER_TARGETS.has(input.to)
    ) {
      throw new Error(
        'Reviewer transition is outside the closed authority set.',
      );
    }
    const value = await this.request(
      new URL(`/api/reports/review/${id}`, configuration.serviceOrigin),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': this.#requestId(),
        },
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          to: input.to,
        }),
      },
    );
    return parseTransitionResponse(value, id);
  }

  private enabledConfiguration() {
    if (this.#configuration.mode !== 'invited') {
      throw new Error('Reviewer service is disabled.');
    }
    return this.#configuration;
  }

  private async request(url: URL, init: RequestInit) {
    const configuration = this.enabledConfiguration();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${configuration.token}`);
    headers.set('Cache-Control', 'no-store');
    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers,
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new Error('Reviewer service request failed without retry.');
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        `Reviewer service rejected the request (${response.status}).`,
      );
    }
    if (
      response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() !==
      'application/json'
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Reviewer service returned an unsupported content type.');
    }
    return boundedJson(response);
  }
}
