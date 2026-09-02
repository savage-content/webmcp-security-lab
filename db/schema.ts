import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const evidenceRuns = sqliteTable(
  'evidence_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    scenarioId: text('scenario_id').notNull(),
    scenarioVersion: text('scenario_version').notNull(),
    timestamp: text('timestamp').notNull(),
    origin: text('origin').notNull(),
    invocationChannel: text('invocation_channel').notNull(),
    verdict: text('verdict').notNull(),
    receiptJson: text('receipt_json').notNull(),
  },
  (table) => [
    index('idx_evidence_runs_timestamp').on(table.timestamp),
    index('idx_evidence_runs_session_timestamp').on(
      table.sessionId,
      table.timestamp,
    ),
    index('idx_evidence_runs_scenario_timestamp').on(
      table.scenarioId,
      table.timestamp,
    ),
  ],
);

export const reportRecords = sqliteTable(
  'leftout_report_records',
  {
    id: text('id').primaryKey(),
    schemaVersion: text('schema_version').notNull(),
    revision: integer('revision').notNull(),
    state: text('state').notNull(),
    receivedAt: text('received_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastEventSha256: text('last_event_sha256').notNull(),
    recordJson: text('record_json').notNull(),
  },
  (table) => [
    check('chk_leftout_report_records_revision', sql`${table.revision} >= 1`),
    check(
      'chk_leftout_report_records_state',
      sql`${table.state} IN ('quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')`,
    ),
    check(
      'chk_leftout_report_records_last_event_sha256',
      sql`length(${table.lastEventSha256}) = 64`,
    ),
    index('idx_leftout_report_records_state_updated').on(
      table.state,
      table.updatedAt,
    ),
  ],
);

export const reportEvents = sqliteTable(
  'leftout_report_events',
  {
    eventId: text('event_id').primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => reportRecords.id),
    sequence: integer('sequence').notNull(),
    revision: integer('revision').notNull(),
    at: text('at').notNull(),
    actorId: text('actor_id').notNull(),
    actorRole: text('actor_role').notNull(),
    requestId: text('request_id').notNull(),
    fromState: text('from_state').notNull(),
    toState: text('to_state').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    previousEventSha256: text('previous_event_sha256'),
    eventSha256: text('event_sha256').notNull(),
    eventJson: text('event_json').notNull(),
  },
  (table) => [
    check('chk_leftout_report_events_sequence', sql`${table.sequence} >= 1`),
    check(
      'chk_leftout_report_events_revision',
      sql`${table.revision} = ${table.sequence}`,
    ),
    check(
      'chk_leftout_report_events_actor_role',
      sql`${table.actorRole} IN ('intake','reviewer','publisher','system')`,
    ),
    check(
      'chk_leftout_report_events_from_state',
      sql`${table.fromState} IN ('received','quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')`,
    ),
    check(
      'chk_leftout_report_events_to_state',
      sql`${table.toState} IN ('quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')`,
    ),
    check(
      'chk_leftout_report_events_payload_sha256',
      sql`length(${table.payloadSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_events_previous_event_sha256',
      sql`${table.previousEventSha256} IS NULL OR length(${table.previousEventSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_events_event_sha256',
      sql`length(${table.eventSha256}) = 64`,
    ),
    uniqueIndex('idx_leftout_report_events_report_sequence').on(
      table.reportId,
      table.sequence,
    ),
    uniqueIndex('idx_leftout_report_events_report_request').on(
      table.reportId,
      table.requestId,
    ),
  ],
);

export const reportIntakeIdempotency = sqliteTable(
  'leftout_report_intake_idempotency',
  {
    invitationId: text('invitation_id').notNull(),
    keySha256: text('key_sha256').notNull(),
    requestSha256: text('request_sha256').notNull(),
    reportId: text('report_id')
      .notNull()
      .references(() => reportRecords.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_intake_key_sha256',
      sql`length(${table.keySha256}) = 64`,
    ),
    check(
      'chk_leftout_report_intake_request_sha256',
      sql`length(${table.requestSha256}) = 64`,
    ),
    uniqueIndex('idx_leftout_report_intake_idempotency_key').on(
      table.invitationId,
      table.keySha256,
    ),
  ],
);
