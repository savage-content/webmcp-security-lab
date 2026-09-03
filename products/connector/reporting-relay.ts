import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';

import {
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
  createPrivacySafeIssueDraft,
  isIssueDraftAssuranceLimitation,
  type PrivacySafeIssueDraft,
} from './issue-draft';

export const REPORTING_RELAY_ENVIRONMENT = Object.freeze({
  mode: 'LEFTOUT_CONNECTOR_REPORTING_MODE',
  endpoint: 'LEFTOUT_CONNECTOR_REPORTING_ENDPOINT',
  invitationToken: 'LEFTOUT_CONNECTOR_REPORTING_INVITATION_TOKEN',
});

export const REPORTING_RELAY_RESPONSE_SCHEMA_VERSION =
  'leftout.reporting-intake-response/1' as const;

const RESPONSE_MAX_BYTES = 16 * 1024;
const SPECIAL_HOST_SUFFIXES = [
  '.home',
  '.home.arpa',
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.test',
];
const PUBLIC_LEARNING_HOST =
  'left-out-webmcp-security-lab.taitfor.chatgpt.site';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/u;

export type ReportingRelayStatus = Readonly<
  | {
      mode: 'disabled';
      acceptsExternalReports: false;
      automaticRetry: false;
      browserCredentialsExposed: false;
    }
  | {
      mode: 'invited';
      acceptsExternalReports: true;
      automaticRetry: false;
      browserCredentialsExposed: false;
      destinationOrigin: string;
    }
>;

export interface ReportingRelayReceipt {
  assuranceLimitation: typeof ISSUE_DRAFT_ASSURANCE_LIMITATION;
  disposition: 'created' | 'existing';
  receivedAt: string;
  reportId: string;
  revision: 1;
  schemaVersion: typeof REPORTING_RELAY_RESPONSE_SCHEMA_VERSION;
  state: 'quarantined';
}

type RelayFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ReportingRelayClientOptions {
  environment?: Readonly<Record<string, unknown>>;
  fetch?: RelayFetch;
  idempotencyKey?: () => string;
  timeoutMs?: number;
}

interface EnabledConfiguration {
  endpoint: string;
  invitationToken: string;
}

function environmentString(
  environment: Readonly<Record<string, unknown>>,
  name: string,
) {
  const value = environment[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string when configured.`);
  }
  return value;
}

function publicReportingEndpoint(value: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('Reporting relay endpoint is invalid.');
  }
  const hostname = endpoint.hostname.toLowerCase();
  const address =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/api/reports/intake' ||
    hostname === 'localhost' ||
    hostname === PUBLIC_LEARNING_HOST ||
    isIP(address) !== 0 ||
    !hostname.includes('.') ||
    SPECIAL_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    throw new Error(
      'Reporting relay endpoint must be an exact public HTTPS intake URL.',
    );
  }
  return endpoint.toString();
}

function loadConfiguration(
  environment: Readonly<Record<string, unknown>>,
): EnabledConfiguration | null {
  const mode = environmentString(environment, REPORTING_RELAY_ENVIRONMENT.mode);
  const endpoint = environmentString(
    environment,
    REPORTING_RELAY_ENVIRONMENT.endpoint,
  );
  const invitationToken = environmentString(
    environment,
    REPORTING_RELAY_ENVIRONMENT.invitationToken,
  );

  if (mode === undefined || mode === 'disabled') {
    if (endpoint !== undefined || invitationToken !== undefined) {
      throw new Error(
        'Disabled reporting relay configuration cannot retain a destination or credential.',
      );
    }
    return null;
  }
  if (mode !== 'invited') {
    throw new Error('Reporting relay mode must be disabled or invited.');
  }
  if (!endpoint || !invitationToken) {
    throw new Error(
      'Invited reporting relay requires one endpoint and invitation credential.',
    );
  }
  if (!TOKEN_PATTERN.test(invitationToken)) {
    throw new Error(
      'Reporting relay invitation credential must be a bounded header-safe secret.',
    );
  }
  return {
    endpoint: publicReportingEndpoint(endpoint),
    invitationToken,
  };
}

function exactIsoTime(value: unknown) {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function parseReceipt(value: unknown, responseStatus: number) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Reporting service returned an invalid receipt.');
  }
  const body = value as Record<string, unknown>;
  const expectedKeys = [
    'assuranceLimitation',
    'disposition',
    'receivedAt',
    'reportId',
    'revision',
    'schemaVersion',
    'state',
  ];
  const actualKeys = Object.keys(body).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key, index) => actualKeys[index] === key)
  ) {
    throw new Error('Reporting service returned an invalid receipt.');
  }
  if (
    body.schemaVersion !== REPORTING_RELAY_RESPONSE_SCHEMA_VERSION ||
    !['created', 'existing'].includes(String(body.disposition)) ||
    !UUID_PATTERN.test(String(body.reportId)) ||
    body.state !== 'quarantined' ||
    body.revision !== 1 ||
    !exactIsoTime(body.receivedAt) ||
    !isIssueDraftAssuranceLimitation(body.assuranceLimitation) ||
    (body.disposition === 'created' && responseStatus !== 201) ||
    (body.disposition === 'existing' && responseStatus !== 200)
  ) {
    throw new Error('Reporting service returned an invalid receipt.');
  }
  return Object.freeze({
    ...body,
    // A rolling schema-v1 service may return the old brand literal. It is not
    // signed here, so normalize the client-visible receipt after validation.
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  }) as unknown as Readonly<ReportingRelayReceipt>;
}

async function readBoundedResponse(response: Response) {
  if (!response.body) {
    throw new Error('Reporting service returned an empty receipt.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('Reporting service receipt exceeds its byte boundary.');
    }
    chunks.push(chunk.value);
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
    throw new Error('Reporting service returned an invalid receipt.');
  }
}

export class ReportingRelayClient {
  readonly #configuration: EnabledConfiguration | null;
  readonly #fetch: RelayFetch;
  readonly #idempotencyKey: () => string;
  readonly #timeoutMs: number;

  constructor(options: ReportingRelayClientOptions = {}) {
    this.#configuration = loadConfiguration(options.environment ?? process.env);
    this.#fetch = options.fetch ?? fetch;
    this.#idempotencyKey = options.idempotencyKey ?? randomUUID;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (this.#timeoutMs < 1_000 || this.#timeoutMs > 30_000) {
      throw new Error('Reporting relay timeout must be 1 to 30 seconds.');
    }
  }

  status(): ReportingRelayStatus {
    if (!this.#configuration) {
      return Object.freeze({
        mode: 'disabled',
        acceptsExternalReports: false,
        automaticRetry: false,
        browserCredentialsExposed: false,
      });
    }
    return Object.freeze({
      mode: 'invited',
      acceptsExternalReports: true,
      automaticRetry: false,
      browserCredentialsExposed: false,
      destinationOrigin: new URL(this.#configuration.endpoint).origin,
    });
  }

  async submit(draftInput: PrivacySafeIssueDraft) {
    if (!this.#configuration) {
      throw new Error('External reporting is not configured.');
    }
    const draft = createPrivacySafeIssueDraft({
      context: draftInput.context,
      category: draftInput.category,
      severity: draftInput.severity,
      stage: draftInput.stage,
      ...(draftInput.siteOrigin ? { siteOrigin: draftInput.siteOrigin } : {}),
    });
    if (draft.context !== 'public-web' || !draft.siteOrigin) {
      throw new Error('Only a reviewed public-web draft can be submitted.');
    }
    const idempotencyKey = this.#idempotencyKey();
    if (!UUID_PATTERN.test(idempotencyKey)) {
      throw new Error('Reporting relay idempotency key is invalid.');
    }
    const body = JSON.stringify({
      siteOrigin: draft.siteOrigin,
      category: draft.category,
      severity: draft.severity,
      stage: draft.stage,
    });
    const response = await this.#fetch(this.#configuration.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#configuration.invitationToken}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(
        `Reporting service declined the report (${response.status}).`,
      );
    }
    return parseReceipt(await readBoundedResponse(response), response.status);
  }
}
