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

export const reportIntakeQuotas = sqliteTable(
  'leftout_report_intake_quotas',
  {
    bucketKey: text('bucket_key').primaryKey(),
    scopeType: text('scope_type').notNull(),
    scopeIdSha256: text('scope_id_sha256').notNull(),
    windowStartedAt: text('window_started_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    count: integer('count').notNull(),
    maxCount: integer('max_count').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_intake_quotas_bucket_key',
      sql`length(${table.bucketKey}) = 64`,
    ),
    check(
      'chk_leftout_report_intake_quotas_scope_type',
      sql`${table.scopeType} IN ('global','invitation')`,
    ),
    check(
      'chk_leftout_report_intake_quotas_scope_id_sha256',
      sql`length(${table.scopeIdSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_intake_quotas_count',
      sql`${table.count} >= 1 AND ${table.count} <= ${table.maxCount}`,
    ),
    check(
      'chk_leftout_report_intake_quotas_max_count',
      sql`${table.maxCount} >= 1`,
    ),
    index('idx_leftout_report_intake_quotas_expiry').on(table.expiresAt),
  ],
);

export const reportPublications = sqliteTable(
  'leftout_report_publications',
  {
    publicId: text('public_id').primaryKey(),
    schemaVersion: text('schema_version').notNull(),
    publishedAt: text('published_at').notNull(),
    publisherId: text('publisher_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    recordSha256: text('record_sha256').notNull(),
    recordJson: text('record_json').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_publications_source_revision',
      sql`${table.sourceRevision} >= 2`,
    ),
    check(
      'chk_leftout_report_publications_record_sha256',
      sql`length(${table.recordSha256}) = 64`,
    ),
    index('idx_leftout_report_publications_published').on(
      table.publishedAt,
      table.publicId,
    ),
  ],
);

export const reportPublicationLinks = sqliteTable(
  'leftout_report_publication_links',
  {
    reportId: text('report_id')
      .primaryKey()
      .references(() => reportRecords.id),
    publicId: text('public_id')
      .notNull()
      .references(() => reportPublications.publicId),
  },
  (table) => [
    uniqueIndex('idx_leftout_report_publication_links_public').on(
      table.publicId,
    ),
  ],
);

export const reportPublicationCorrections = sqliteTable(
  'leftout_report_publication_corrections',
  {
    correctionId: text('correction_id').primaryKey(),
    schemaVersion: text('schema_version').notNull(),
    publicId: text('public_id')
      .notNull()
      .references(() => reportPublications.publicId),
    correctedAt: text('corrected_at').notNull(),
    action: text('action').notNull(),
    reason: text('reason').notNull(),
    publicationRecordSha256: text('publication_record_sha256').notNull(),
    custodianId: text('custodian_id').notNull(),
    requestId: text('request_id').notNull(),
    requestSha256: text('request_sha256').notNull(),
    correctionSha256: text('correction_sha256').notNull(),
    correctionJson: text('correction_json').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_publication_corrections_action',
      sql`${table.action} IN ('withdraw')`,
    ),
    check(
      'chk_leftout_report_publication_corrections_reason',
      sql`${table.reason} IN ('consent_withdrawn','duplicate','erroneous_publication','evidence_invalidated')`,
    ),
    check(
      'chk_leftout_report_publication_corrections_record_sha256',
      sql`length(${table.publicationRecordSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_publication_corrections_custodian',
      sql`length(${table.custodianId}) BETWEEN 3 AND 64`,
    ),
    check(
      'chk_leftout_report_publication_corrections_request_sha256',
      sql`length(${table.requestSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_publication_corrections_correction_sha256',
      sql`length(${table.correctionSha256}) = 64`,
    ),
    uniqueIndex('idx_leftout_report_publication_corrections_request').on(
      table.requestId,
    ),
    uniqueIndex('idx_leftout_report_publication_corrections_action').on(
      table.publicId,
      table.action,
    ),
    index('idx_leftout_report_publication_corrections_time').on(
      table.correctedAt,
      table.correctionId,
    ),
  ],
);

export const reportRetentionStates = sqliteTable(
  'leftout_report_retention_states',
  {
    reportId: text('report_id')
      .primaryKey()
      .references(() => reportRecords.id),
    schemaVersion: text('schema_version').notNull(),
    revision: integer('revision').notNull(),
    updatedAt: text('updated_at').notNull(),
    legalHold: integer('legal_hold', { mode: 'boolean' }).notNull(),
    retainUntil: text('retain_until').notNull(),
    policyVersion: text('policy_version').notNull(),
    lastEventSha256: text('last_event_sha256').notNull(),
    stateJson: text('state_json').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_retention_states_revision',
      sql`${table.revision} >= 1`,
    ),
    check(
      'chk_leftout_report_retention_states_legal_hold',
      sql`${table.legalHold} IN (0, 1)`,
    ),
    check(
      'chk_leftout_report_retention_states_last_event_sha256',
      sql`length(${table.lastEventSha256}) = 64`,
    ),
    index('idx_leftout_report_retention_states_due').on(
      table.legalHold,
      table.retainUntil,
    ),
  ],
);

export const reportRetentionEvents = sqliteTable(
  'leftout_report_retention_events',
  {
    eventId: text('event_id').primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => reportRecords.id),
    revision: integer('revision').notNull(),
    at: text('at').notNull(),
    actorId: text('actor_id').notNull(),
    actorRole: text('actor_role').notNull(),
    requestId: text('request_id').notNull(),
    action: text('action').notNull(),
    legalHold: integer('legal_hold', { mode: 'boolean' }).notNull(),
    retainUntil: text('retain_until').notNull(),
    policyVersion: text('policy_version').notNull(),
    previousEventSha256: text('previous_event_sha256'),
    eventSha256: text('event_sha256').notNull(),
    eventJson: text('event_json').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_retention_events_revision',
      sql`${table.revision} >= 1`,
    ),
    check(
      'chk_leftout_report_retention_events_actor_role',
      sql`${table.actorRole} IN ('custodian','system')`,
    ),
    check(
      'chk_leftout_report_retention_events_action',
      sql`${table.action} IN ('policy_assigned','legal_hold_set','legal_hold_cleared')`,
    ),
    check(
      'chk_leftout_report_retention_events_legal_hold',
      sql`${table.legalHold} IN (0, 1)`,
    ),
    check(
      'chk_leftout_report_retention_events_previous_event_sha256',
      sql`${table.previousEventSha256} IS NULL OR length(${table.previousEventSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_retention_events_event_sha256',
      sql`length(${table.eventSha256}) = 64`,
    ),
    uniqueIndex('idx_leftout_report_retention_events_report_revision').on(
      table.reportId,
      table.revision,
    ),
    uniqueIndex('idx_leftout_report_retention_events_report_request').on(
      table.reportId,
      table.requestId,
    ),
  ],
);

export const reportDeletionAuthorizations = sqliteTable(
  'leftout_report_deletion_authorizations',
  {
    reportId: text('report_id').primaryKey(),
    requestId: text('request_id').notNull(),
    requestSha256: text('request_sha256').notNull(),
    custodianId: text('custodian_id').notNull(),
    expectedRetentionRevision: integer('expected_retention_revision').notNull(),
    authorizedAt: text('authorized_at').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_deletion_authorizations_request_sha256',
      sql`length(${table.requestSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_deletion_authorizations_revision',
      sql`${table.expectedRetentionRevision} >= 1`,
    ),
    check(
      'chk_leftout_report_deletion_authorizations_custodian',
      sql`length(${table.custodianId}) BETWEEN 3 AND 64`,
    ),
    uniqueIndex('idx_leftout_report_deletion_authorizations_request').on(
      table.requestId,
    ),
  ],
);

export const reportDeletionTombstones = sqliteTable(
  'leftout_report_deletion_tombstones',
  {
    tombstoneId: text('tombstone_id').primaryKey(),
    schemaVersion: text('schema_version').notNull(),
    deletedAt: text('deleted_at').notNull(),
    reason: text('reason').notNull(),
    policyVersion: text('policy_version').notNull(),
    publicId: text('public_id'),
    publicationSurvives: integer('publication_survives', {
      mode: 'boolean',
    }).notNull(),
    moderationEventCount: integer('moderation_event_count').notNull(),
    retentionEventCount: integer('retention_event_count').notNull(),
    lastModerationEventSha256: text('last_moderation_event_sha256').notNull(),
    lastRetentionEventSha256: text('last_retention_event_sha256').notNull(),
    custodianId: text('custodian_id').notNull(),
    requestId: text('request_id').notNull(),
    requestSha256: text('request_sha256').notNull(),
    tombstoneSha256: text('tombstone_sha256').notNull(),
    tombstoneJson: text('tombstone_json').notNull(),
  },
  (table) => [
    check(
      'chk_leftout_report_deletion_tombstones_reason',
      sql`${table.reason} IN ('retention_expired','data_subject_request')`,
    ),
    check(
      'chk_leftout_report_deletion_tombstones_publication',
      sql`(${table.publicationSurvives} = 0 AND ${table.publicId} IS NULL) OR (${table.publicationSurvives} = 1 AND ${table.publicId} IS NOT NULL)`,
    ),
    check(
      'chk_leftout_report_deletion_tombstones_counts',
      sql`${table.moderationEventCount} >= 1 AND ${table.retentionEventCount} >= 1`,
    ),
    check(
      'chk_leftout_report_deletion_tombstones_moderation_sha256',
      sql`length(${table.lastModerationEventSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_deletion_tombstones_retention_sha256',
      sql`length(${table.lastRetentionEventSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_deletion_tombstones_request_sha256',
      sql`length(${table.requestSha256}) = 64`,
    ),
    check(
      'chk_leftout_report_deletion_tombstones_tombstone_sha256',
      sql`length(${table.tombstoneSha256}) = 64`,
    ),
    uniqueIndex('idx_leftout_report_deletion_tombstones_request').on(
      table.requestId,
    ),
    index('idx_leftout_report_deletion_tombstones_deleted').on(
      table.deletedAt,
      table.tombstoneId,
    ),
  ],
);
