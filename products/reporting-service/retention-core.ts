import { createHash, randomUUID } from 'node:crypto';

export const REPORTING_RETENTION_STATE_SCHEMA_VERSION =
  'leftout.reporting-retention-state/1' as const;
export const REPORTING_RETENTION_EVENT_SCHEMA_VERSION =
  'leftout.reporting-retention-event/1' as const;

export const REPORTING_RETENTION_ACTIONS = [
  'policy_assigned',
  'legal_hold_set',
  'legal_hold_cleared',
] as const;

export type ReportingRetentionAction =
  (typeof REPORTING_RETENTION_ACTIONS)[number];

export interface ReportingRetentionActor {
  id: string;
  role: 'custodian' | 'system';
}

export interface ReportingRetentionEvent {
  schemaVersion: typeof REPORTING_RETENTION_EVENT_SCHEMA_VERSION;
  eventId: string;
  reportId: string;
  revision: number;
  at: string;
  actor: Readonly<ReportingRetentionActor>;
  requestId: string;
  action: ReportingRetentionAction;
  legalHold: boolean;
  retainUntil: string;
  policyVersion: string;
  previousEventSha256: string | null;
  eventSha256: string;
}

export interface ReportingRetentionState {
  schemaVersion: typeof REPORTING_RETENTION_STATE_SCHEMA_VERSION;
  reportId: string;
  revision: number;
  updatedAt: string;
  legalHold: boolean;
  retainUntil: string;
  policyVersion: string;
  lastEventSha256: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POLICY_PATTERN = /^retention\.[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;
const ACTOR_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{1,126}[a-z0-9])?$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase UUID.`);
  }
  return value;
}

function exactTime(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be an exact ISO-8601 UTC timestamp.`);
  }
  return value;
}

function policyVersion(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !POLICY_PATTERN.test(value)
  ) {
    throw new Error(
      'Reporting retention policy must be a normalized retention.* identifier.',
    );
  }
  return value;
}

function actor(value: Readonly<ReportingRetentionActor>) {
  if (
    typeof value.id !== 'string' ||
    value.id.length < 3 ||
    value.id.length > 128 ||
    !ACTOR_PATTERN.test(value.id) ||
    (value.role !== 'system' && value.role !== 'custodian')
  ) {
    throw new Error('Reporting retention actor is invalid.');
  }
  return Object.freeze({ id: value.id, role: value.role });
}

function eventHash(
  value: Omit<Readonly<ReportingRetentionEvent>, 'eventSha256'>,
) {
  return sha256(
    JSON.stringify({
      schemaVersion: value.schemaVersion,
      eventId: value.eventId,
      reportId: value.reportId,
      revision: value.revision,
      at: value.at,
      actor: value.actor,
      requestId: value.requestId,
      action: value.action,
      legalHold: value.legalHold,
      retainUntil: value.retainUntil,
      policyVersion: value.policyVersion,
      previousEventSha256: value.previousEventSha256,
    }),
  );
}

function makeEvent(input: {
  eventId: string;
  reportId: string;
  revision: number;
  at: string;
  actor: Readonly<ReportingRetentionActor>;
  requestId: string;
  action: ReportingRetentionAction;
  legalHold: boolean;
  retainUntil: string;
  policyVersion: string;
  previousEventSha256: string | null;
}) {
  const withoutHash = Object.freeze({
    schemaVersion: REPORTING_RETENTION_EVENT_SCHEMA_VERSION,
    eventId: uuid(input.eventId, 'Retention event ID'),
    reportId: uuid(input.reportId, 'Retention report ID'),
    revision: input.revision,
    at: exactTime(input.at, 'Retention event time'),
    actor: actor(input.actor),
    requestId: uuid(input.requestId, 'Retention request ID'),
    action: input.action,
    legalHold: input.legalHold,
    retainUntil: exactTime(input.retainUntil, 'Retention deadline'),
    policyVersion: policyVersion(input.policyVersion),
    previousEventSha256: input.previousEventSha256,
  });
  if (
    !Number.isSafeInteger(withoutHash.revision) ||
    withoutHash.revision < 1 ||
    !REPORTING_RETENTION_ACTIONS.includes(withoutHash.action) ||
    typeof withoutHash.legalHold !== 'boolean' ||
    (withoutHash.previousEventSha256 !== null &&
      !SHA256_PATTERN.test(withoutHash.previousEventSha256))
  ) {
    throw new Error('Reporting retention event is invalid.');
  }
  return Object.freeze({
    ...withoutHash,
    eventSha256: eventHash(withoutHash),
  });
}

function stateFromEvent(event: Readonly<ReportingRetentionEvent>) {
  return Object.freeze({
    schemaVersion: REPORTING_RETENTION_STATE_SCHEMA_VERSION,
    reportId: event.reportId,
    revision: event.revision,
    updatedAt: event.at,
    legalHold: event.legalHold,
    retainUntil: event.retainUntil,
    policyVersion: event.policyVersion,
    lastEventSha256: event.eventSha256,
  });
}

export function createReportingRetention(
  input: {
    reportId: string;
    receivedAt: string;
    retentionDays: number;
    policyVersion: string;
    requestId: string;
  },
  options: { eventId?: () => string } = {},
) {
  const receivedAt = exactTime(input.receivedAt, 'Retention start time');
  if (
    !Number.isSafeInteger(input.retentionDays) ||
    input.retentionDays < 1 ||
    input.retentionDays > 3_650
  ) {
    throw new Error('Reporting retention days must be between 1 and 3650.');
  }
  const retainUntil = new Date(
    Date.parse(receivedAt) + input.retentionDays * 86_400_000,
  ).toISOString();
  const event = makeEvent({
    eventId: (options.eventId ?? randomUUID)(),
    reportId: input.reportId,
    revision: 1,
    at: receivedAt,
    actor: { id: 'system.retention-policy', role: 'system' },
    requestId: input.requestId,
    action: 'policy_assigned',
    legalHold: false,
    retainUntil,
    policyVersion: input.policyVersion,
    previousEventSha256: null,
  });
  return Object.freeze({ state: stateFromEvent(event), event });
}

export function transitionReportingLegalHold(
  current: Readonly<ReportingRetentionState>,
  input: {
    actor: Readonly<ReportingRetentionActor>;
    at: string;
    eventId?: () => string;
    held: boolean;
    requestId: string;
  },
) {
  const parsed = parseReportingRetentionState(current);
  if (input.actor.role !== 'custodian') {
    throw new Error('Legal hold changes require custodian authority.');
  }
  if (input.held === parsed.legalHold) {
    throw new Error('Legal hold already has the requested state.');
  }
  const at = exactTime(input.at, 'Legal hold change time');
  if (Date.parse(at) < Date.parse(parsed.updatedAt)) {
    throw new Error('Legal hold change time cannot move backward.');
  }
  const event = makeEvent({
    eventId: (input.eventId ?? randomUUID)(),
    reportId: parsed.reportId,
    revision: parsed.revision + 1,
    at,
    actor: input.actor,
    requestId: input.requestId,
    action: input.held ? 'legal_hold_set' : 'legal_hold_cleared',
    legalHold: input.held,
    retainUntil: parsed.retainUntil,
    policyVersion: parsed.policyVersion,
    previousEventSha256: parsed.lastEventSha256,
  });
  return Object.freeze({ state: stateFromEvent(event), event });
}

export function parseReportingRetentionState(
  value: unknown,
): Readonly<ReportingRetentionState> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stored reporting retention state is invalid.');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(candidate);
  const expected = [
    'schemaVersion',
    'reportId',
    'revision',
    'updatedAt',
    'legalHold',
    'retainUntil',
    'policyVersion',
    'lastEventSha256',
  ];
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string') ||
    expected.some((key) => !Object.hasOwn(candidate, key)) ||
    candidate.schemaVersion !== REPORTING_RETENTION_STATE_SCHEMA_VERSION ||
    !Number.isSafeInteger(candidate.revision) ||
    Number(candidate.revision) < 1 ||
    typeof candidate.legalHold !== 'boolean' ||
    typeof candidate.lastEventSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.lastEventSha256)
  ) {
    throw new Error('Stored reporting retention state is invalid.');
  }
  return Object.freeze({
    schemaVersion: REPORTING_RETENTION_STATE_SCHEMA_VERSION,
    reportId: uuid(candidate.reportId, 'Retention report ID'),
    revision: Number(candidate.revision),
    updatedAt: exactTime(candidate.updatedAt, 'Retention update time'),
    legalHold: candidate.legalHold,
    retainUntil: exactTime(candidate.retainUntil, 'Retention deadline'),
    policyVersion: policyVersion(candidate.policyVersion),
    lastEventSha256: candidate.lastEventSha256,
  });
}

export function parseReportingRetentionEvent(
  value: unknown,
): Readonly<ReportingRetentionEvent> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stored reporting retention event is invalid.');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(candidate);
  const expected = [
    'schemaVersion',
    'eventId',
    'reportId',
    'revision',
    'at',
    'actor',
    'requestId',
    'action',
    'legalHold',
    'retainUntil',
    'policyVersion',
    'previousEventSha256',
    'eventSha256',
  ];
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string') ||
    expected.some((key) => !Object.hasOwn(candidate, key)) ||
    candidate.schemaVersion !== REPORTING_RETENTION_EVENT_SCHEMA_VERSION ||
    typeof candidate.eventSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.eventSha256) ||
    typeof candidate.action !== 'string' ||
    !REPORTING_RETENTION_ACTIONS.includes(
      candidate.action as ReportingRetentionAction,
    ) ||
    typeof candidate.legalHold !== 'boolean' ||
    typeof candidate.actor !== 'object' ||
    candidate.actor === null ||
    Array.isArray(candidate.actor)
  ) {
    throw new Error('Stored reporting retention event is invalid.');
  }
  const actorValue = candidate.actor as Record<string, unknown>;
  const actorKeys = Reflect.ownKeys(actorValue);
  if (
    actorKeys.length !== 2 ||
    actorKeys.some((key) => typeof key !== 'string') ||
    !Object.hasOwn(actorValue, 'id') ||
    !Object.hasOwn(actorValue, 'role')
  ) {
    throw new Error('Stored reporting retention event is invalid.');
  }
  const parsed = makeEvent({
    eventId: candidate.eventId as string,
    reportId: candidate.reportId as string,
    revision: Number(candidate.revision),
    at: candidate.at as string,
    actor: {
      id: actorValue.id as string,
      role: actorValue.role as 'custodian' | 'system',
    },
    requestId: candidate.requestId as string,
    action: candidate.action as ReportingRetentionAction,
    legalHold: candidate.legalHold,
    retainUntil: candidate.retainUntil as string,
    policyVersion: candidate.policyVersion as string,
    previousEventSha256:
      candidate.previousEventSha256 === null
        ? null
        : (candidate.previousEventSha256 as string),
  });
  if (parsed.eventSha256 !== candidate.eventSha256) {
    throw new Error('Stored reporting retention event hash is invalid.');
  }
  return parsed;
}
