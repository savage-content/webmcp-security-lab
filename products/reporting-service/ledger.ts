import { createHash, randomUUID } from 'node:crypto';

import {
  createQuarantinedIssueRecord,
  parseIssueModerationRecord,
  transitionIssueModeration,
  type IssueModerationRecord,
} from '../connector/issue-moderation';
import {
  ISSUE_MODERATION_STATES,
  type IssueModerationState,
} from '../connector/issue-publication';

export const REPORTING_LEDGER_RECORD_SCHEMA_VERSION =
  'leftout.reporting-ledger-record/1' as const;
export const REPORTING_LEDGER_EVENT_SCHEMA_VERSION =
  'leftout.reporting-ledger-event/1' as const;

export const REPORTING_LEDGER_ACTOR_ROLES = [
  'intake',
  'reviewer',
  'publisher',
  'system',
] as const;

export type ReportingLedgerActorRole =
  (typeof REPORTING_LEDGER_ACTOR_ROLES)[number];

export interface ReportingLedgerActor {
  id: string;
  role: ReportingLedgerActorRole;
}

export interface ReportingLedgerEvent {
  schemaVersion: typeof REPORTING_LEDGER_EVENT_SCHEMA_VERSION;
  eventId: string;
  reportId: string;
  sequence: number;
  revision: number;
  at: string;
  actor: Readonly<ReportingLedgerActor>;
  requestId: string;
  from: 'received' | IssueModerationState;
  to: IssueModerationState;
  payloadSha256: string;
  previousEventSha256: string | null;
  eventSha256: string;
}

export interface ReportingLedgerRecord {
  schemaVersion: typeof REPORTING_LEDGER_RECORD_SCHEMA_VERSION;
  revision: number;
  moderation: Readonly<IssueModerationRecord>;
  lastEventSha256: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ACTOR_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{1,126}[a-z0-9])?$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new Error(`${label} contains an unknown field: ${String(key)}.`);
    }
  }
}

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

function actor(value: Readonly<ReportingLedgerActor>) {
  if (
    typeof value.id !== 'string' ||
    value.id.length < 3 ||
    value.id.length > 128 ||
    !ACTOR_ID_PATTERN.test(value.id)
  ) {
    throw new Error('Reporting ledger actor ID must be normalized and opaque.');
  }
  if (!REPORTING_LEDGER_ACTOR_ROLES.includes(value.role)) {
    throw new Error('Reporting ledger actor role is unsupported.');
  }
  return Object.freeze({ id: value.id, role: value.role });
}

function normalizedTransitionPayload(record: Readonly<IssueModerationRecord>) {
  return JSON.stringify({
    to: record.state,
    ...(record.publication ? { publication: record.publication } : {}),
  });
}

function normalizedIntakePayload(record: Readonly<IssueModerationRecord>) {
  return JSON.stringify({
    reportId: record.id,
    receivedAt: record.receivedAt,
    draft: record.draft,
  });
}

function eventHashInput(
  event: Omit<Readonly<ReportingLedgerEvent>, 'eventSha256'>,
) {
  return JSON.stringify({
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    reportId: event.reportId,
    sequence: event.sequence,
    revision: event.revision,
    at: event.at,
    actor: { id: event.actor.id, role: event.actor.role },
    requestId: event.requestId,
    from: event.from,
    to: event.to,
    payloadSha256: event.payloadSha256,
    previousEventSha256: event.previousEventSha256,
  });
}

function makeEvent(input: {
  eventId: string;
  reportId: string;
  sequence: number;
  revision: number;
  at: string;
  actor: Readonly<ReportingLedgerActor>;
  requestId: string;
  from: 'received' | IssueModerationState;
  to: IssueModerationState;
  payloadSha256: string;
  previousEventSha256: string | null;
}) {
  const withoutHash = Object.freeze({
    schemaVersion: REPORTING_LEDGER_EVENT_SCHEMA_VERSION,
    eventId: uuid(input.eventId, 'Reporting event ID'),
    reportId: uuid(input.reportId, 'Reporting record ID'),
    sequence: input.sequence,
    revision: input.revision,
    at: exactTime(input.at, 'Reporting event time'),
    actor: actor(input.actor),
    requestId: uuid(input.requestId, 'Reporting request ID'),
    from: input.from,
    to: input.to,
    payloadSha256: input.payloadSha256,
    previousEventSha256: input.previousEventSha256,
  });
  if (
    !Number.isSafeInteger(withoutHash.sequence) ||
    withoutHash.sequence < 1 ||
    !Number.isSafeInteger(withoutHash.revision) ||
    withoutHash.revision !== withoutHash.sequence ||
    !SHA256_PATTERN.test(withoutHash.payloadSha256) ||
    (withoutHash.previousEventSha256 !== null &&
      !SHA256_PATTERN.test(withoutHash.previousEventSha256))
  ) {
    throw new Error('Reporting ledger event sequence or digest is invalid.');
  }
  return Object.freeze({
    ...withoutHash,
    eventSha256: sha256(eventHashInput(withoutHash)),
  });
}

function freezeRecord(
  revision: number,
  moderation: Readonly<IssueModerationRecord>,
  lastEventSha256: string,
): Readonly<ReportingLedgerRecord> {
  return Object.freeze({
    schemaVersion: REPORTING_LEDGER_RECORD_SCHEMA_VERSION,
    revision,
    moderation,
    lastEventSha256,
  });
}

export function createReportingLedgerIntake(
  draftInput: unknown,
  input: {
    actor: Readonly<ReportingLedgerActor>;
    requestId: string;
  },
  options: {
    eventId?: () => string;
    id?: () => string;
    now?: () => number;
  } = {},
) {
  const intakeActor = actor(input.actor);
  if (intakeActor.role !== 'intake') {
    throw new Error('A reporting intake event requires intake authority.');
  }
  const now = options.now ?? Date.now;
  const moderation = createQuarantinedIssueRecord(draftInput, {
    id: options.id,
    now,
  });
  const transition = moderation.history[0];
  if (!transition) {
    throw new Error('Quarantined report did not produce its intake event.');
  }
  const event = makeEvent({
    eventId: (options.eventId ?? randomUUID)(),
    reportId: moderation.id,
    sequence: 1,
    revision: 1,
    at: transition.at,
    actor: intakeActor,
    requestId: input.requestId,
    from: 'received',
    to: 'quarantined',
    payloadSha256: sha256(normalizedIntakePayload(moderation)),
    previousEventSha256: null,
  });
  return Object.freeze({
    record: freezeRecord(1, moderation, event.eventSha256),
    event,
  });
}

function allowedRoleForTarget(target: IssueModerationState) {
  return target === 'published' ? 'publisher' : 'reviewer';
}

export function transitionReportingLedger(
  current: Readonly<ReportingLedgerRecord>,
  transitionInput: unknown,
  input: {
    actor: Readonly<ReportingLedgerActor>;
    expectedRevision: number;
    requestId: string;
  },
  options: { eventId?: () => string } = {},
) {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision !== current.revision
  ) {
    throw new Error('Reporting ledger revision is stale.');
  }
  const transitionActor = actor(input.actor);
  const transitioned = transitionIssueModeration(
    current.moderation,
    transitionInput,
  );
  const requiredRole = allowedRoleForTarget(transitioned.state);
  if (transitionActor.role !== requiredRole) {
    throw new Error(
      `The ${transitioned.state} transition requires ${requiredRole} authority.`,
    );
  }
  const nextRevision = current.revision + 1;
  const event = makeEvent({
    eventId: (options.eventId ?? randomUUID)(),
    reportId: transitioned.id,
    sequence: nextRevision,
    revision: nextRevision,
    at: transitioned.updatedAt,
    actor: transitionActor,
    requestId: input.requestId,
    from: current.moderation.state,
    to: transitioned.state,
    payloadSha256: sha256(normalizedTransitionPayload(transitioned)),
    previousEventSha256: current.lastEventSha256,
  });
  return Object.freeze({
    record: freezeRecord(nextRevision, transitioned, event.eventSha256),
    event,
  });
}

export function verifyReportingLedgerChain(
  record: Readonly<ReportingLedgerRecord>,
  events: readonly Readonly<ReportingLedgerEvent>[],
) {
  if (
    record.schemaVersion !== REPORTING_LEDGER_RECORD_SCHEMA_VERSION ||
    events.length !== record.revision ||
    events.length !== record.moderation.history.length ||
    record.moderation.state !== events.at(-1)?.to ||
    record.lastEventSha256 !== events.at(-1)?.eventSha256
  ) {
    return false;
  }

  let previous: string | null = null;
  for (const [index, event] of events.entries()) {
    const sequence = index + 1;
    const moderationEvent = record.moderation.history[index];
    const expectedPayloadSha256 = sha256(
      index === 0
        ? normalizedIntakePayload(record.moderation)
        : JSON.stringify({
            to: event.to,
            ...(event.to === 'published' && record.moderation.publication
              ? { publication: record.moderation.publication }
              : {}),
          }),
    );
    if (
      event.schemaVersion !== REPORTING_LEDGER_EVENT_SCHEMA_VERSION ||
      event.reportId !== record.moderation.id ||
      event.sequence !== sequence ||
      event.revision !== sequence ||
      event.previousEventSha256 !== previous ||
      event.from !== moderationEvent?.from ||
      event.to !== moderationEvent.to ||
      event.at !== moderationEvent.at ||
      event.payloadSha256 !== expectedPayloadSha256 ||
      event.eventSha256 !==
        sha256(
          eventHashInput({
            schemaVersion: event.schemaVersion,
            eventId: event.eventId,
            reportId: event.reportId,
            sequence: event.sequence,
            revision: event.revision,
            at: event.at,
            actor: event.actor,
            requestId: event.requestId,
            from: event.from,
            to: event.to,
            payloadSha256: event.payloadSha256,
            previousEventSha256: event.previousEventSha256,
          }),
        )
    ) {
      return false;
    }
    previous = event.eventSha256;
  }
  return true;
}

export function parseReportingLedgerEvent(
  value: unknown,
): Readonly<ReportingLedgerEvent> {
  if (!isRecord(value)) {
    throw new Error('Stored reporting ledger event must be an object.');
  }
  rejectUnknownFields(
    value,
    new Set([
      'schemaVersion',
      'eventId',
      'reportId',
      'sequence',
      'revision',
      'at',
      'actor',
      'requestId',
      'from',
      'to',
      'payloadSha256',
      'previousEventSha256',
      'eventSha256',
    ]),
    'Stored reporting ledger event',
  );
  if (
    value.schemaVersion !== REPORTING_LEDGER_EVENT_SCHEMA_VERSION ||
    !isRecord(value.actor) ||
    typeof value.to !== 'string' ||
    !ISSUE_MODERATION_STATES.includes(value.to as IssueModerationState) ||
    (value.from !== 'received' &&
      (typeof value.from !== 'string' ||
        !ISSUE_MODERATION_STATES.includes(
          value.from as IssueModerationState,
        ))) ||
    typeof value.payloadSha256 !== 'string' ||
    (value.previousEventSha256 !== null &&
      typeof value.previousEventSha256 !== 'string') ||
    typeof value.eventSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.eventSha256)
  ) {
    throw new Error('Stored reporting ledger event contract is invalid.');
  }
  rejectUnknownFields(
    value.actor,
    new Set(['id', 'role']),
    'Stored reporting ledger actor',
  );
  const restored = makeEvent({
    eventId: value.eventId as string,
    reportId: value.reportId as string,
    sequence: value.sequence as number,
    revision: value.revision as number,
    at: value.at as string,
    actor: {
      id: value.actor.id as string,
      role: value.actor.role as ReportingLedgerActorRole,
    },
    requestId: value.requestId as string,
    from: value.from as 'received' | IssueModerationState,
    to: value.to as IssueModerationState,
    payloadSha256: value.payloadSha256,
    previousEventSha256: value.previousEventSha256,
  });
  if (restored.eventSha256 !== value.eventSha256) {
    throw new Error('Stored reporting ledger event hash is invalid.');
  }
  return restored;
}

export function parseReportingLedgerRecord(
  value: unknown,
): Readonly<ReportingLedgerRecord> {
  if (!isRecord(value)) {
    throw new Error('Stored reporting ledger record must be an object.');
  }
  rejectUnknownFields(
    value,
    new Set(['schemaVersion', 'revision', 'moderation', 'lastEventSha256']),
    'Stored reporting ledger record',
  );
  if (
    value.schemaVersion !== REPORTING_LEDGER_RECORD_SCHEMA_VERSION ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    typeof value.lastEventSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.lastEventSha256)
  ) {
    throw new Error('Stored reporting ledger record contract is invalid.');
  }
  const moderation = parseIssueModerationRecord(value.moderation);
  if (value.revision !== moderation.history.length) {
    throw new Error('Stored reporting ledger revision is invalid.');
  }
  return freezeRecord(
    Number(value.revision),
    moderation,
    value.lastEventSha256,
  );
}

export function parseReportingLedgerBundle(
  recordValue: unknown,
  eventValues: unknown,
) {
  const record = parseReportingLedgerRecord(recordValue);
  if (!Array.isArray(eventValues)) {
    throw new Error('Stored reporting ledger events must be an array.');
  }
  const events = Object.freeze(eventValues.map(parseReportingLedgerEvent));
  if (!verifyReportingLedgerChain(record, events)) {
    throw new Error('Stored reporting ledger chain is invalid.');
  }
  return Object.freeze({ record, events });
}
