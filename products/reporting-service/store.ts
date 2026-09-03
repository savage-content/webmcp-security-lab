import { createHash } from 'node:crypto';

import {
  ISSUE_MODERATION_STATES,
  parsePublicIssueFeedRecord,
  projectPublicIssueRecord,
  type IssueModerationState,
  type PublicIssueFeedRecord,
} from '../connector/issue-publication';
import {
  parseReportingLedgerBundle,
  parseReportingLedgerEvent,
  verifyReportingLedgerChain,
  type ReportingLedgerEvent,
  type ReportingLedgerRecord,
} from './ledger';
import {
  createReportingDeletionTombstone,
  parseReportingDeletionTombstone,
  REPORTING_DELETION_REASONS,
  type ReportingDeletionReason,
  type ReportingDeletionTombstone,
} from './deletion-core';
import {
  parseReportingRetentionEvent,
  parseReportingRetentionState,
  type ReportingRetentionEvent,
  type ReportingRetentionState,
} from './retention-core';
import {
  createReportingPublicCorrection,
  parseReportingPublicCorrection,
  REPORTING_PUBLIC_CORRECTION_ACTIONS,
  REPORTING_PUBLIC_CORRECTION_REASONS,
  type ReportingPublicCorrection,
  type ReportingPublicCorrectionAction,
  type ReportingPublicCorrectionReason,
} from './correction-core';

export const REPORTING_STORE_SCHEMA_VERSION = 5 as const;

export class ReportingStoreConflictError extends Error {
  override readonly name = 'ReportingStoreConflictError';
}

export class ReportingStoreIntegrityError extends Error {
  override readonly name = 'ReportingStoreIntegrityError';
}

export class ReportingStoreQuotaError extends Error {
  override readonly name = 'ReportingStoreQuotaError';
}

export interface ReportingLedgerBundle {
  record: Readonly<ReportingLedgerRecord>;
  events: readonly Readonly<ReportingLedgerEvent>[];
}

export interface ReportingRetentionBundle {
  state: Readonly<ReportingRetentionState>;
  events: readonly Readonly<ReportingRetentionEvent>[];
}

export interface ReportingDeletionRequest {
  reportId: string;
  expectedRetentionRevision: number;
  reason: ReportingDeletionReason;
  custodianId: string;
  requestId: string;
  requestSha256: string;
  now: number;
  tombstoneId?: () => string;
}

export interface ReportingCorrectionRequest {
  publicId: string;
  action: ReportingPublicCorrectionAction;
  reason: ReportingPublicCorrectionReason;
  custodianId: string;
  requestId: string;
  requestSha256: string;
  now: number;
  correctionId?: () => string;
}

export interface ReportingIntakeIdempotency {
  invitationId: string;
  keySha256: string;
  requestSha256: string;
}

export interface ReportingIntakeQuotaPolicy {
  invitationId: string;
  invitationLimit: number;
  globalLimit: number;
  now: number;
}

export interface ReportingPublicationRecord {
  publicId: string;
  reportId: string | null;
  publishedAt: string;
  publisherId: string;
  sourceRevision: number;
  recordSha256: string;
  record: Readonly<PublicIssueFeedRecord>;
}

export interface ReportingPublicationCursor {
  publicId: string;
  publishedAt: string;
}

export interface ReportingPublicationQuery {
  cursor?: Readonly<ReportingPublicationCursor>;
  limit?: number;
  through: string;
}

export interface ReportingPublicFeedCursor {
  entryType: 'correction' | 'publication';
  entryId: string;
  occurredAt: string;
}

export interface ReportingPublicFeedQuery {
  cursor?: Readonly<ReportingPublicFeedCursor>;
  limit?: number;
  through: string;
}

export type ReportingPublicFeedEntry =
  | Readonly<{
      entryType: 'publication';
      entryId: string;
      occurredAt: string;
      publication: Readonly<ReportingPublicationRecord>;
    }>
  | Readonly<{
      entryType: 'correction';
      entryId: string;
      occurredAt: string;
      correction: Readonly<ReportingPublicCorrection>;
    }>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INVITATION_ID_PATTERN =
  /^invitation\.[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;
const ACTOR_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;

export const REPORTING_STORE_SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS leftout_report_records (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    state TEXT NOT NULL CHECK (state IN ('quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')),
    received_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sha256 TEXT NOT NULL CHECK (length(last_event_sha256) = 64),
    record_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    report_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    revision INTEGER NOT NULL CHECK (revision = sequence),
    at TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('intake','reviewer','publisher','system')),
    request_id TEXT NOT NULL,
    from_state TEXT NOT NULL CHECK (from_state IN ('received','quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')),
    to_state TEXT NOT NULL CHECK (to_state IN ('quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')),
    payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
    previous_event_sha256 TEXT CHECK (previous_event_sha256 IS NULL OR length(previous_event_sha256) = 64),
    event_sha256 TEXT NOT NULL CHECK (length(event_sha256) = 64),
    event_json TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES leftout_report_records(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_intake_idempotency (
    invitation_id TEXT NOT NULL,
    key_sha256 TEXT NOT NULL CHECK (length(key_sha256) = 64),
    request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
    report_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES leftout_report_records(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_intake_quotas (
    bucket_key TEXT PRIMARY KEY NOT NULL CHECK (length(bucket_key) = 64),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('global','invitation')),
    scope_id_sha256 TEXT NOT NULL CHECK (length(scope_id_sha256) = 64),
    window_started_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 1 AND count <= max_count),
    max_count INTEGER NOT NULL CHECK (max_count >= 1)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_publications (
    public_id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    published_at TEXT NOT NULL,
    publisher_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL CHECK (source_revision >= 2),
    record_sha256 TEXT NOT NULL CHECK (length(record_sha256) = 64),
    record_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_publication_links (
    report_id TEXT PRIMARY KEY NOT NULL,
    public_id TEXT NOT NULL UNIQUE,
    FOREIGN KEY (report_id) REFERENCES leftout_report_records(id),
    FOREIGN KEY (public_id) REFERENCES leftout_report_publications(public_id)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_publication_corrections (
    correction_id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    public_id TEXT NOT NULL,
    corrected_at TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('withdraw')),
    reason TEXT NOT NULL CHECK (reason IN ('consent_withdrawn','duplicate','erroneous_publication','evidence_invalidated')),
    publication_record_sha256 TEXT NOT NULL CHECK (length(publication_record_sha256) = 64),
    custodian_id TEXT NOT NULL CHECK (length(custodian_id) BETWEEN 3 AND 64),
    request_id TEXT NOT NULL,
    request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
    correction_sha256 TEXT NOT NULL CHECK (length(correction_sha256) = 64),
    correction_json TEXT NOT NULL,
    FOREIGN KEY (public_id) REFERENCES leftout_report_publications(public_id)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_retention_states (
    report_id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    updated_at TEXT NOT NULL,
    legal_hold INTEGER NOT NULL CHECK (legal_hold IN (0, 1)),
    retain_until TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    last_event_sha256 TEXT NOT NULL CHECK (length(last_event_sha256) = 64),
    state_json TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES leftout_report_records(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_retention_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    report_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    at TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('custodian','system')),
    request_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('policy_assigned','legal_hold_set','legal_hold_cleared')),
    legal_hold INTEGER NOT NULL CHECK (legal_hold IN (0, 1)),
    retain_until TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    previous_event_sha256 TEXT CHECK (previous_event_sha256 IS NULL OR length(previous_event_sha256) = 64),
    event_sha256 TEXT NOT NULL CHECK (length(event_sha256) = 64),
    event_json TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES leftout_report_records(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_deletion_authorizations (
    report_id TEXT PRIMARY KEY NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
    custodian_id TEXT NOT NULL CHECK (length(custodian_id) BETWEEN 3 AND 64),
    expected_retention_revision INTEGER NOT NULL CHECK (expected_retention_revision >= 1),
    authorized_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leftout_report_deletion_tombstones (
    tombstone_id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('retention_expired','data_subject_request')),
    policy_version TEXT NOT NULL,
    public_id TEXT,
    publication_survives INTEGER NOT NULL CHECK (publication_survives IN (0, 1)),
    moderation_event_count INTEGER NOT NULL CHECK (moderation_event_count >= 1),
    retention_event_count INTEGER NOT NULL CHECK (retention_event_count >= 1),
    last_moderation_event_sha256 TEXT NOT NULL CHECK (length(last_moderation_event_sha256) = 64),
    last_retention_event_sha256 TEXT NOT NULL CHECK (length(last_retention_event_sha256) = 64),
    custodian_id TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
    tombstone_sha256 TEXT NOT NULL CHECK (length(tombstone_sha256) = 64),
    tombstone_json TEXT NOT NULL,
    CHECK ((publication_survives = 0 AND public_id IS NULL) OR (publication_survives = 1 AND public_id IS NOT NULL))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_records_state_updated ON leftout_report_records(state, updated_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_events_report_sequence ON leftout_report_events(report_id, sequence)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_events_report_request ON leftout_report_events(report_id, request_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_intake_idempotency_key ON leftout_report_intake_idempotency(invitation_id, key_sha256)',
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_intake_quotas_expiry ON leftout_report_intake_quotas(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_publications_published ON leftout_report_publications(published_at, public_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_publication_links_public ON leftout_report_publication_links(public_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_publication_corrections_request ON leftout_report_publication_corrections(request_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_publication_corrections_action ON leftout_report_publication_corrections(public_id, action)',
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_publication_corrections_time ON leftout_report_publication_corrections(corrected_at, correction_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_retention_events_report_revision ON leftout_report_retention_events(report_id, revision)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_retention_events_report_request ON leftout_report_retention_events(report_id, request_id)',
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_retention_states_due ON leftout_report_retention_states(legal_hold, retain_until)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_deletion_authorizations_request ON leftout_report_deletion_authorizations(request_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_deletion_tombstones_request ON leftout_report_deletion_tombstones(request_id)',
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_deletion_tombstones_deleted ON leftout_report_deletion_tombstones(deleted_at, tombstone_id)',
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_event_snapshot
    BEFORE INSERT ON leftout_report_events
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_records
      WHERE id = NEW.report_id
        AND revision = NEW.revision
        AND last_event_sha256 = NEW.event_sha256
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_event_snapshot_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_event_chain
    BEFORE INSERT ON leftout_report_events
    WHEN (NEW.sequence = 1 AND NEW.previous_event_sha256 IS NOT NULL)
      OR (NEW.sequence > 1 AND NOT EXISTS (
        SELECT 1 FROM leftout_report_events
        WHERE report_id = NEW.report_id
          AND sequence = NEW.sequence - 1
          AND event_sha256 = NEW.previous_event_sha256
      ))
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_event_chain_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_events_no_update
    BEFORE UPDATE ON leftout_report_events
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_events_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_events_no_delete
    BEFORE DELETE ON leftout_report_events
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_deletion_authorizations
      WHERE report_id = OLD.report_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_events_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_idempotency_no_update
    BEFORE UPDATE ON leftout_report_intake_idempotency
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_idempotency_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_idempotency_no_delete
    BEFORE DELETE ON leftout_report_intake_idempotency
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_deletion_authorizations
      WHERE report_id = OLD.report_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_idempotency_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_records_no_delete
    BEFORE DELETE ON leftout_report_records
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_deletion_authorizations
      WHERE report_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_records_require_retention_workflow');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_intake_quota_integrity
    BEFORE UPDATE ON leftout_report_intake_quotas
    WHEN NEW.bucket_key != OLD.bucket_key
      OR NEW.scope_type != OLD.scope_type
      OR NEW.scope_id_sha256 != OLD.scope_id_sha256
      OR NEW.window_started_at != OLD.window_started_at
      OR NEW.expires_at != OLD.expires_at
      OR NEW.max_count > OLD.max_count
      OR NEW.count != OLD.count + 1
    BEGIN
      SELECT RAISE(ABORT, 'leftout_reporting_quota_integrity');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_intake_quota_exhausted
    BEFORE UPDATE ON leftout_report_intake_quotas
    WHEN NEW.count > NEW.max_count
    BEGIN
      SELECT RAISE(ABORT, 'leftout_reporting_quota_exhausted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publication_link_snapshot
    BEFORE INSERT ON leftout_report_publication_links
    WHEN NOT EXISTS (
      SELECT 1
      FROM leftout_report_records AS record
      JOIN leftout_report_events AS event
        ON event.report_id = record.id
       AND event.revision = record.revision
      JOIN leftout_report_publications AS publication
        ON publication.public_id = NEW.public_id
      WHERE record.id = NEW.report_id
        AND record.state = 'published'
        AND record.revision = publication.source_revision
        AND event.to_state = 'published'
        AND event.actor_role = 'publisher'
        AND event.actor_id = publication.publisher_id
        AND event.event_id = publication.public_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publication_link_snapshot_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publications_no_update
    BEFORE UPDATE ON leftout_report_publications
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publications_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publications_no_delete
    BEFORE DELETE ON leftout_report_publications
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publications_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publication_links_no_update
    BEFORE UPDATE ON leftout_report_publication_links
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publication_links_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publication_links_no_delete
    BEFORE DELETE ON leftout_report_publication_links
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_deletion_authorizations
      WHERE report_id = OLD.report_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publication_links_require_retention_workflow');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publication_correction_snapshot
    BEFORE INSERT ON leftout_report_publication_corrections
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_publications
      WHERE public_id = NEW.public_id
        AND record_sha256 = NEW.publication_record_sha256
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publication_correction_snapshot_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publication_corrections_no_update
    BEFORE UPDATE ON leftout_report_publication_corrections
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publication_corrections_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_publication_corrections_no_delete
    BEFORE DELETE ON leftout_report_publication_corrections
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_publication_corrections_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_retention_event_snapshot
    BEFORE INSERT ON leftout_report_retention_events
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_retention_states
      WHERE report_id = NEW.report_id
        AND revision = NEW.revision
        AND last_event_sha256 = NEW.event_sha256
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_retention_event_snapshot_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_retention_event_chain
    BEFORE INSERT ON leftout_report_retention_events
    WHEN (NEW.revision = 1 AND NEW.previous_event_sha256 IS NOT NULL)
      OR (NEW.revision > 1 AND NOT EXISTS (
        SELECT 1 FROM leftout_report_retention_events
        WHERE report_id = NEW.report_id
          AND revision = NEW.revision - 1
          AND event_sha256 = NEW.previous_event_sha256
      ))
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_retention_event_chain_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_retention_events_no_update
    BEFORE UPDATE ON leftout_report_retention_events
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_retention_events_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_retention_events_no_delete
    BEFORE DELETE ON leftout_report_retention_events
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_deletion_authorizations
      WHERE report_id = OLD.report_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_retention_events_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_retention_state_integrity
    BEFORE UPDATE ON leftout_report_retention_states
    WHEN NEW.report_id != OLD.report_id
      OR NEW.schema_version != OLD.schema_version
      OR NEW.revision != OLD.revision + 1
      OR NEW.updated_at < OLD.updated_at
      OR NEW.legal_hold = OLD.legal_hold
      OR NEW.retain_until != OLD.retain_until
      OR NEW.policy_version != OLD.policy_version
      OR NEW.last_event_sha256 = OLD.last_event_sha256
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_retention_state_integrity');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_retention_states_no_delete
    BEFORE DELETE ON leftout_report_retention_states
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_deletion_authorizations
      WHERE report_id = OLD.report_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_retention_states_require_retention_workflow');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_deletion_authorization_snapshot
    BEFORE INSERT ON leftout_report_deletion_authorizations
    WHEN NOT EXISTS (
      SELECT 1 FROM leftout_report_retention_states
      WHERE report_id = NEW.report_id
        AND revision = NEW.expected_retention_revision
        AND legal_hold = 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_deletion_authorization_snapshot_mismatch');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_deletion_authorizations_no_update
    BEFORE UPDATE ON leftout_report_deletion_authorizations
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_deletion_authorizations_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_deletion_tombstones_no_update
    BEFORE UPDATE ON leftout_report_deletion_tombstones
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_deletion_tombstones_immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_deletion_tombstones_no_delete
    BEFORE DELETE ON leftout_report_deletion_tombstones
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_deletion_tombstones_immutable');
    END`,
]);

const schemaReady = new WeakMap<D1Database, Promise<void>>();

function digest(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new ReportingStoreIntegrityError(
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function reportingDeletionRequestSha256(input: {
  reportId: string;
  expectedRetentionRevision: number;
  reason: ReportingDeletionReason;
}) {
  return sha256(
    JSON.stringify({
      reportId: input.reportId,
      expectedRetentionRevision: input.expectedRetentionRevision,
      reason: input.reason,
    }),
  );
}

export function reportingCorrectionRequestSha256(input: {
  publicId: string;
  action: ReportingPublicCorrectionAction;
  reason: ReportingPublicCorrectionReason;
}) {
  return sha256(
    JSON.stringify({
      publicId: input.publicId,
      action: input.action,
      reason: input.reason,
    }),
  );
}

function intakeIdempotency(
  value: Readonly<ReportingIntakeIdempotency>,
): Readonly<ReportingIntakeIdempotency> {
  if (
    typeof value.invitationId !== 'string' ||
    !INVITATION_ID_PATTERN.test(value.invitationId)
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting invitation ID must be normalized and opaque.',
    );
  }
  return Object.freeze({
    invitationId: value.invitationId,
    keySha256: digest(value.keySha256, 'Reporting idempotency key digest'),
    requestSha256: digest(value.requestSha256, 'Reporting request digest'),
  });
}

function quotaPolicy(
  value: Readonly<ReportingIntakeQuotaPolicy>,
): Readonly<ReportingIntakeQuotaPolicy> {
  if (
    typeof value.invitationId !== 'string' ||
    !INVITATION_ID_PATTERN.test(value.invitationId) ||
    !Number.isSafeInteger(value.invitationLimit) ||
    value.invitationLimit < 1 ||
    value.invitationLimit > 1_000 ||
    !Number.isSafeInteger(value.globalLimit) ||
    value.globalLimit < value.invitationLimit ||
    value.globalLimit > 10_000 ||
    !Number.isSafeInteger(value.now) ||
    value.now < 0
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting intake quota policy is invalid.',
    );
  }
  return Object.freeze({ ...value });
}

function quotaStatements(
  database: D1Database,
  value: Readonly<ReportingIntakeQuotaPolicy>,
) {
  const policy = quotaPolicy(value);
  const hour = 60 * 60 * 1_000;
  const windowStartedAt = new Date(
    Math.floor(policy.now / hour) * hour,
  ).toISOString();
  const expiresAt = new Date(Date.parse(windowStartedAt) + hour).toISOString();
  const scopes = [
    {
      scopeType: 'global',
      scopeIdSha256: sha256('leftout.reporting-intake.global'),
      maxCount: policy.globalLimit,
    },
    {
      scopeType: 'invitation',
      scopeIdSha256: sha256(policy.invitationId),
      maxCount: policy.invitationLimit,
    },
  ] as const;

  return scopes.map((scope) => {
    const bucketKey = sha256(
      JSON.stringify({
        scopeType: scope.scopeType,
        scopeIdSha256: scope.scopeIdSha256,
        windowStartedAt,
      }),
    );
    return database
      .prepare(
        `INSERT INTO leftout_report_intake_quotas (
          bucket_key, scope_type, scope_id_sha256, window_started_at,
          expires_at, count, max_count
        ) VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(bucket_key) DO UPDATE SET
          count = count + 1,
          max_count = min(max_count, excluded.max_count)`,
      )
      .bind(
        bucketKey,
        scope.scopeType,
        scope.scopeIdSha256,
        windowStartedAt,
        expiresAt,
        scope.maxCount,
      );
  });
}

export function ensureReportingStoreSchema(database: D1Database) {
  const existing = schemaReady.get(database);
  if (existing) return existing;
  const pending = database
    .batch(
      REPORTING_STORE_SCHEMA_STATEMENTS.map((statement) =>
        database.prepare(statement),
      ),
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaReady.delete(database);
      throw new ReportingStoreIntegrityError(
        `Reporting store schema could not be prepared: ${error instanceof Error ? error.name : 'unknown error'}.`,
      );
    });
  schemaReady.set(database, pending);
  return pending;
}

function recordStatement(
  database: D1Database,
  record: Readonly<ReportingLedgerRecord>,
) {
  return database
    .prepare(
      `INSERT INTO leftout_report_records (
        id, schema_version, revision, state, received_at, updated_at,
        last_event_sha256, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.moderation.id,
      record.schemaVersion,
      record.revision,
      record.moderation.state,
      record.moderation.receivedAt,
      record.moderation.updatedAt,
      record.lastEventSha256,
      JSON.stringify(record),
    );
}

function eventStatement(
  database: D1Database,
  event: Readonly<ReportingLedgerEvent>,
) {
  return database
    .prepare(
      `INSERT INTO leftout_report_events (
        event_id, report_id, sequence, revision, at, actor_id, actor_role,
        request_id, from_state, to_state, payload_sha256,
        previous_event_sha256, event_sha256, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.eventId,
      event.reportId,
      event.sequence,
      event.revision,
      event.at,
      event.actor.id,
      event.actor.role,
      event.requestId,
      event.from,
      event.to,
      event.payloadSha256,
      event.previousEventSha256,
      event.eventSha256,
      JSON.stringify(event),
    );
}

function retentionStateStatement(
  database: D1Database,
  state: Readonly<ReportingRetentionState>,
) {
  return database
    .prepare(
      `INSERT INTO leftout_report_retention_states (
        report_id, schema_version, revision, updated_at, legal_hold,
        retain_until, policy_version, last_event_sha256, state_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      state.reportId,
      state.schemaVersion,
      state.revision,
      state.updatedAt,
      state.legalHold ? 1 : 0,
      state.retainUntil,
      state.policyVersion,
      state.lastEventSha256,
      JSON.stringify(state),
    );
}

function retentionEventStatement(
  database: D1Database,
  event: Readonly<ReportingRetentionEvent>,
) {
  return database
    .prepare(
      `INSERT INTO leftout_report_retention_events (
        event_id, report_id, revision, at, actor_id, actor_role, request_id,
        action, legal_hold, retain_until, policy_version,
        previous_event_sha256, event_sha256, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.eventId,
      event.reportId,
      event.revision,
      event.at,
      event.actor.id,
      event.actor.role,
      event.requestId,
      event.action,
      event.legalHold ? 1 : 0,
      event.retainUntil,
      event.policyVersion,
      event.previousEventSha256,
      event.eventSha256,
      JSON.stringify(event),
    );
}

function initialRetentionBundle(
  value: Readonly<{
    state: Readonly<ReportingRetentionState>;
    event: Readonly<ReportingRetentionEvent>;
  }>,
) {
  try {
    const state = parseReportingRetentionState(value.state);
    const event = parseReportingRetentionEvent(value.event);
    if (
      state.reportId !== event.reportId ||
      state.revision !== 1 ||
      event.revision !== 1 ||
      event.action !== 'policy_assigned' ||
      event.actor.role !== 'system' ||
      event.legalHold ||
      event.previousEventSha256 !== null ||
      state.updatedAt !== event.at ||
      state.legalHold !== event.legalHold ||
      state.retainUntil !== event.retainUntil ||
      state.policyVersion !== event.policyVersion ||
      state.lastEventSha256 !== event.eventSha256
    ) {
      throw new Error('initial retention mismatch');
    }
    return Object.freeze({ state, event });
  } catch {
    throw new ReportingStoreIntegrityError(
      'Reporting intake retention bundle failed integrity validation.',
    );
  }
}

function publicationRecord(
  record: Readonly<ReportingLedgerRecord>,
  event: Readonly<ReportingLedgerEvent>,
): Readonly<ReportingPublicationRecord> | null {
  if (record.moderation.state !== 'published') return null;
  const projected = projectPublicIssueRecord({
    context: record.moderation.draft.context,
    category: record.moderation.draft.category,
    severity: record.moderation.draft.severity,
    stage: record.moderation.draft.stage,
    moderationState: record.moderation.state,
    publication: record.moderation.publication,
  });
  if (
    !projected ||
    event.to !== 'published' ||
    event.actor.role !== 'publisher'
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting publication bundle failed integrity validation.',
    );
  }
  const recordJson = JSON.stringify(projected);
  return Object.freeze({
    publicId: event.eventId,
    reportId: record.moderation.id,
    publishedAt: event.at,
    publisherId: event.actor.id,
    sourceRevision: record.revision,
    recordSha256: sha256(recordJson),
    record: projected,
  });
}

interface ReportingPublicationRow {
  publicId: string;
  reportId: string | null;
  schemaVersion: string;
  publishedAt: string;
  publisherId: string;
  sourceRevision: number;
  recordSha256: string;
  recordJson: string;
}

function exactTime(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new ReportingStoreIntegrityError(`${label} is invalid.`);
  }
  return value;
}

function parsePublicationRow(
  row: Readonly<ReportingPublicationRow>,
): Readonly<ReportingPublicationRecord> {
  try {
    const record = parsePublicIssueFeedRecord(
      JSON.parse(row.recordJson) as unknown,
    );
    if (
      !UUID_PATTERN.test(row.publicId) ||
      (row.reportId !== null && !UUID_PATTERN.test(row.reportId)) ||
      row.schemaVersion !== record.schemaVersion ||
      !Number.isSafeInteger(row.sourceRevision) ||
      row.sourceRevision < 2 ||
      !SHA256_PATTERN.test(row.recordSha256) ||
      row.recordSha256 !== sha256(JSON.stringify(record)) ||
      typeof row.publisherId !== 'string' ||
      row.publisherId.length < 3 ||
      exactTime(row.publishedAt, 'Reporting publication time') !==
        row.publishedAt
    ) {
      throw new Error('publication metadata mismatch');
    }
    return Object.freeze({
      publicId: row.publicId,
      reportId: row.reportId,
      publishedAt: row.publishedAt,
      publisherId: row.publisherId,
      sourceRevision: row.sourceRevision,
      recordSha256: row.recordSha256,
      record,
    });
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting publication failed integrity validation.',
    );
  }
}

interface ReportingCorrectionRow {
  correctionId: string;
  schemaVersion: string;
  publicId: string;
  correctedAt: string;
  action: string;
  reason: string;
  publicationRecordSha256: string;
  custodianId: string;
  requestId: string;
  requestSha256: string;
  correctionSha256: string;
  correctionJson: string;
}

function parseCorrectionRow(row: Readonly<ReportingCorrectionRow>) {
  try {
    const correction = parseReportingPublicCorrection(
      JSON.parse(row.correctionJson) as unknown,
    );
    if (
      correction.correctionId !== row.correctionId ||
      correction.schemaVersion !== row.schemaVersion ||
      correction.publicId !== row.publicId ||
      correction.correctedAt !== row.correctedAt ||
      correction.action !== row.action ||
      correction.reason !== row.reason ||
      correction.publicationRecordSha256 !== row.publicationRecordSha256 ||
      correction.correctionSha256 !== row.correctionSha256 ||
      !ACTOR_ID_PATTERN.test(row.custodianId) ||
      !UUID_PATTERN.test(row.requestId) ||
      !SHA256_PATTERN.test(row.requestSha256)
    ) {
      throw new Error('correction metadata mismatch');
    }
    return Object.freeze({
      correction,
      custodianId: row.custodianId,
      requestId: row.requestId,
      requestSha256: row.requestSha256,
    });
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting correction failed integrity validation.',
    );
  }
}

function publicationStatements(
  database: D1Database,
  publication: Readonly<ReportingPublicationRecord>,
) {
  if (!publication.reportId) {
    throw new ReportingStoreIntegrityError(
      'A new reporting publication requires a private source link.',
    );
  }
  return [
    database
      .prepare(
        `INSERT INTO leftout_report_publications (
        public_id, schema_version, published_at, publisher_id,
        source_revision, record_sha256, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        publication.publicId,
        publication.record.schemaVersion,
        publication.publishedAt,
        publication.publisherId,
        publication.sourceRevision,
        publication.recordSha256,
        JSON.stringify(publication.record),
      ),
    database
      .prepare(
        `INSERT INTO leftout_report_publication_links (report_id, public_id)
         VALUES (?, ?)`,
      )
      .bind(publication.reportId, publication.publicId),
  ];
}

interface ReportingDeletionTombstoneRow {
  tombstoneJson: string;
  tombstoneId: string;
  schemaVersion: string;
  deletedAt: string;
  reason: string;
  policyVersion: string;
  publicId: string | null;
  publicationSurvives: number;
  moderationEventCount: number;
  retentionEventCount: number;
  lastModerationEventSha256: string;
  lastRetentionEventSha256: string;
  custodianId: string;
  requestId: string;
  requestSha256: string;
  tombstoneSha256: string;
}

function parseDeletionTombstoneRow(
  row: Readonly<ReportingDeletionTombstoneRow>,
) {
  try {
    const tombstone = parseReportingDeletionTombstone(
      JSON.parse(row.tombstoneJson) as unknown,
    );
    if (
      tombstone.tombstoneId !== row.tombstoneId ||
      tombstone.schemaVersion !== row.schemaVersion ||
      tombstone.deletedAt !== row.deletedAt ||
      tombstone.reason !== row.reason ||
      tombstone.policyVersion !== row.policyVersion ||
      tombstone.publicId !== row.publicId ||
      ![0, 1].includes(row.publicationSurvives) ||
      tombstone.publicationSurvives !== (row.publicationSurvives === 1) ||
      tombstone.moderationEventCount !== row.moderationEventCount ||
      tombstone.retentionEventCount !== row.retentionEventCount ||
      tombstone.lastModerationEventSha256 !== row.lastModerationEventSha256 ||
      tombstone.lastRetentionEventSha256 !== row.lastRetentionEventSha256 ||
      tombstone.custodianId !== row.custodianId ||
      tombstone.requestId !== row.requestId ||
      tombstone.requestSha256 !== row.requestSha256 ||
      tombstone.tombstoneSha256 !== row.tombstoneSha256
    ) {
      throw new Error('deletion tombstone metadata mismatch');
    }
    return tombstone;
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting deletion tombstone failed integrity validation.',
    );
  }
}

function deletionTombstoneStatement(
  database: D1Database,
  tombstone: Readonly<ReportingDeletionTombstone>,
) {
  return database
    .prepare(
      `INSERT INTO leftout_report_deletion_tombstones (
        tombstone_id, schema_version, deleted_at, reason, policy_version,
        public_id, publication_survives, moderation_event_count,
        retention_event_count, last_moderation_event_sha256,
        last_retention_event_sha256, custodian_id, request_id,
        request_sha256, tombstone_sha256, tombstone_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      tombstone.tombstoneId,
      tombstone.schemaVersion,
      tombstone.deletedAt,
      tombstone.reason,
      tombstone.policyVersion,
      tombstone.publicId,
      tombstone.publicationSurvives ? 1 : 0,
      tombstone.moderationEventCount,
      tombstone.retentionEventCount,
      tombstone.lastModerationEventSha256,
      tombstone.lastRetentionEventSha256,
      tombstone.custodianId,
      tombstone.requestId,
      tombstone.requestSha256,
      tombstone.tombstoneSha256,
      JSON.stringify(tombstone),
    );
}

export async function loadReportingPublication(
  database: D1Database,
  reportId: string,
): Promise<Readonly<ReportingPublicationRecord> | null> {
  await ensureReportingStoreSchema(database);
  const row = await database
    .prepare(
      `SELECT publication.public_id AS publicId,
              link.report_id AS reportId,
              publication.schema_version AS schemaVersion,
              publication.published_at AS publishedAt,
              publication.publisher_id AS publisherId,
              publication.source_revision AS sourceRevision,
              publication.record_sha256 AS recordSha256,
              publication.record_json AS recordJson
       FROM leftout_report_publications AS publication
       JOIN leftout_report_publication_links AS link
         ON link.public_id = publication.public_id
       WHERE link.report_id = ?`,
    )
    .bind(reportId)
    .first<ReportingPublicationRow>();
  if (!row) return null;
  const publication = parsePublicationRow(row);
  if (publication.reportId !== reportId) {
    throw new ReportingStoreIntegrityError(
      'Stored reporting publication identifier did not match.',
    );
  }
  return publication;
}

export async function loadReportingPublicationByPublicId(
  database: D1Database,
  publicId: string,
): Promise<Readonly<ReportingPublicationRecord> | null> {
  await ensureReportingStoreSchema(database);
  if (!UUID_PATTERN.test(publicId)) {
    throw new ReportingStoreIntegrityError(
      'Reporting public identifier is invalid.',
    );
  }
  const row = await database
    .prepare(
      `SELECT publication.public_id AS publicId,
              NULL AS reportId,
              publication.schema_version AS schemaVersion,
              publication.published_at AS publishedAt,
              publication.publisher_id AS publisherId,
              publication.source_revision AS sourceRevision,
              publication.record_sha256 AS recordSha256,
              publication.record_json AS recordJson
       FROM leftout_report_publications AS publication
       WHERE publication.public_id = ?`,
    )
    .bind(publicId)
    .first<ReportingPublicationRow>();
  if (!row) return null;
  const publication = parsePublicationRow(row);
  if (publication.publicId !== publicId || publication.reportId !== null) {
    throw new ReportingStoreIntegrityError(
      'Stored public reporting publication identifier did not match.',
    );
  }
  return publication;
}

export async function loadReportingCorrectionByRequestId(
  database: D1Database,
  requestId: string,
) {
  await ensureReportingStoreSchema(database);
  if (!UUID_PATTERN.test(requestId)) {
    throw new ReportingStoreIntegrityError(
      'Reporting correction request identifier is invalid.',
    );
  }
  const row = await database
    .prepare(
      `SELECT correction_id AS correctionId, schema_version AS schemaVersion,
              public_id AS publicId, corrected_at AS correctedAt,
              action, reason,
              publication_record_sha256 AS publicationRecordSha256,
              custodian_id AS custodianId, request_id AS requestId,
              request_sha256 AS requestSha256,
              correction_sha256 AS correctionSha256,
              correction_json AS correctionJson
       FROM leftout_report_publication_corrections WHERE request_id = ?`,
    )
    .bind(requestId)
    .first<ReportingCorrectionRow>();
  return row ? parseCorrectionRow(row) : null;
}

function correctionRequest(
  value: Readonly<ReportingCorrectionRequest>,
): Readonly<ReportingCorrectionRequest> {
  if (
    !UUID_PATTERN.test(value.publicId) ||
    !UUID_PATTERN.test(value.requestId) ||
    !REPORTING_PUBLIC_CORRECTION_ACTIONS.includes(value.action) ||
    !REPORTING_PUBLIC_CORRECTION_REASONS.includes(value.reason) ||
    typeof value.custodianId !== 'string' ||
    value.custodianId.length < 3 ||
    value.custodianId.length > 64 ||
    !ACTOR_ID_PATTERN.test(value.custodianId) ||
    !Number.isSafeInteger(value.now) ||
    value.now < 0 ||
    !Number.isFinite(new Date(value.now).valueOf()) ||
    digest(value.requestSha256, 'Reporting correction request digest') !==
      reportingCorrectionRequestSha256(value) ||
    (value.correctionId !== undefined &&
      typeof value.correctionId !== 'function')
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting correction request failed integrity validation.',
    );
  }
  return Object.freeze({ ...value });
}

function sameCorrectionRequest(
  stored: Readonly<{
    correction: Readonly<ReportingPublicCorrection>;
    custodianId: string;
    requestId: string;
    requestSha256: string;
  }>,
  request: Readonly<ReportingCorrectionRequest>,
) {
  return (
    stored.requestId === request.requestId &&
    stored.requestSha256 === request.requestSha256 &&
    stored.custodianId === request.custodianId &&
    stored.correction.publicId === request.publicId &&
    stored.correction.action === request.action &&
    stored.correction.reason === request.reason
  );
}

export async function saveReportingCorrection(
  database: D1Database,
  requestValue: Readonly<ReportingCorrectionRequest>,
) {
  const request = correctionRequest(requestValue);
  await ensureReportingStoreSchema(database);
  const existing = await loadReportingCorrectionByRequestId(
    database,
    request.requestId,
  );
  if (existing) {
    if (!sameCorrectionRequest(existing, request)) {
      throw new ReportingStoreConflictError(
        'Reporting correction request ID was reused for a different correction.',
      );
    }
    return Object.freeze({
      disposition: 'existing' as const,
      correction: existing.correction,
    });
  }

  const publication = await loadReportingPublicationByPublicId(
    database,
    request.publicId,
  );
  if (!publication) {
    throw new ReportingStoreConflictError(
      'Reporting publication was not found.',
    );
  }
  const correctedAt = new Date(request.now).toISOString();
  if (Date.parse(correctedAt) < Date.parse(publication.publishedAt)) {
    throw new ReportingStoreIntegrityError(
      'Reporting correction time precedes its publication.',
    );
  }
  const correction = createReportingPublicCorrection(
    {
      publicId: publication.publicId,
      correctedAt,
      action: request.action,
      reason: request.reason,
      publicationRecordSha256: publication.recordSha256,
    },
    { correctionId: request.correctionId },
  );

  try {
    await database
      .prepare(
        `INSERT INTO leftout_report_publication_corrections (
          correction_id, schema_version, public_id, corrected_at,
          action, reason, publication_record_sha256, custodian_id,
          request_id, request_sha256, correction_sha256, correction_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        correction.correctionId,
        correction.schemaVersion,
        correction.publicId,
        correction.correctedAt,
        correction.action,
        correction.reason,
        correction.publicationRecordSha256,
        request.custodianId,
        request.requestId,
        request.requestSha256,
        correction.correctionSha256,
        JSON.stringify(correction),
      )
      .run();
  } catch {
    const raced = await loadReportingCorrectionByRequestId(
      database,
      request.requestId,
    );
    if (raced && sameCorrectionRequest(raced, request)) {
      return Object.freeze({
        disposition: 'existing' as const,
        correction: raced.correction,
      });
    }
    throw new ReportingStoreConflictError(
      'Reporting correction could not be committed.',
    );
  }
  const retained = await loadReportingCorrectionByRequestId(
    database,
    request.requestId,
  );
  if (
    !retained ||
    retained.correction.correctionSha256 !== correction.correctionSha256
  ) {
    throw new ReportingStoreIntegrityError(
      'Committed reporting correction failed postcondition verification.',
    );
  }
  return Object.freeze({
    disposition: 'created' as const,
    correction: retained.correction,
  });
}

export async function listReportingPublications(
  database: D1Database,
  query: Readonly<ReportingPublicationQuery>,
) {
  await ensureReportingStoreSchema(database);
  const limit = query.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ReportingStoreIntegrityError(
      'Reporting publication limit must be between 1 and 100.',
    );
  }
  const through = exactTime(query.through, 'Reporting publication boundary');
  let cursor: Readonly<ReportingPublicationCursor> | undefined;
  if (query.cursor) {
    cursor = Object.freeze({
      publicId: query.cursor.publicId,
      publishedAt: exactTime(
        query.cursor.publishedAt,
        'Reporting publication cursor time',
      ),
    });
    if (
      !UUID_PATTERN.test(cursor.publicId) ||
      Date.parse(cursor.publishedAt) > Date.parse(through)
    ) {
      throw new ReportingStoreIntegrityError(
        'Reporting publication cursor is invalid.',
      );
    }
  }
  const rows = await database
    .prepare(
      `SELECT publication.public_id AS publicId,
              NULL AS reportId,
              publication.schema_version AS schemaVersion,
              publication.published_at AS publishedAt,
              publication.publisher_id AS publisherId,
              publication.source_revision AS sourceRevision,
              publication.record_sha256 AS recordSha256,
              publication.record_json AS recordJson
       FROM leftout_report_publications AS publication
       WHERE publication.published_at <= ?
         AND (
           ? IS NULL
           OR publication.published_at > ?
           OR (
             publication.published_at = ?
             AND publication.public_id > ?
           )
         )
       ORDER BY publication.published_at ASC, publication.public_id ASC
       LIMIT ?`,
    )
    .bind(
      through,
      cursor?.publishedAt ?? null,
      cursor?.publishedAt ?? '',
      cursor?.publishedAt ?? '',
      cursor?.publicId ?? '',
      limit + 1,
    )
    .all<ReportingPublicationRow>();
  const selected = rows.results.slice(0, limit);
  const publications = Object.freeze(selected.map(parsePublicationRow));
  const last = selected.at(-1);
  return Object.freeze({
    publications,
    nextCursor:
      rows.results.length > limit && last
        ? Object.freeze({
            publicId: last.publicId,
            publishedAt: last.publishedAt,
          })
        : null,
  });
}

interface ReportingPublicFeedRow {
  entryType: string;
  entryId: string;
  occurredAt: string;
  publicId: string;
  schemaVersion: string;
  publisherId: string | null;
  sourceRevision: number | null;
  recordSha256: string;
  payloadSha256: string;
  payloadJson: string;
}

function parsePublicFeedRow(
  row: Readonly<ReportingPublicFeedRow>,
): Readonly<ReportingPublicFeedEntry> {
  if (
    !UUID_PATTERN.test(row.entryId) ||
    !UUID_PATTERN.test(row.publicId) ||
    exactTime(row.occurredAt, 'Reporting public feed entry time') !==
      row.occurredAt ||
    !SHA256_PATTERN.test(row.payloadSha256)
  ) {
    throw new ReportingStoreIntegrityError(
      'Stored reporting public feed entry failed integrity validation.',
    );
  }
  if (row.entryType === 'publication') {
    if (
      row.entryId !== row.publicId ||
      row.publisherId === null ||
      row.sourceRevision === null ||
      row.payloadSha256 !== row.recordSha256
    ) {
      throw new ReportingStoreIntegrityError(
        'Stored reporting publication feed entry failed integrity validation.',
      );
    }
    const publication = parsePublicationRow({
      publicId: row.publicId,
      reportId: null,
      schemaVersion: row.schemaVersion,
      publishedAt: row.occurredAt,
      publisherId: row.publisherId,
      sourceRevision: row.sourceRevision,
      recordSha256: row.recordSha256,
      recordJson: row.payloadJson,
    });
    return Object.freeze({
      entryType: 'publication' as const,
      entryId: row.entryId,
      occurredAt: row.occurredAt,
      publication,
    });
  }
  if (row.entryType === 'correction') {
    try {
      const correction = parseReportingPublicCorrection(
        JSON.parse(row.payloadJson) as unknown,
      );
      if (
        row.publisherId !== null ||
        row.sourceRevision !== null ||
        correction.correctionId !== row.entryId ||
        correction.publicId !== row.publicId ||
        correction.correctedAt !== row.occurredAt ||
        correction.schemaVersion !== row.schemaVersion ||
        correction.publicationRecordSha256 !== row.recordSha256 ||
        correction.correctionSha256 !== row.payloadSha256
      ) {
        throw new Error('correction feed metadata mismatch');
      }
      return Object.freeze({
        entryType: 'correction' as const,
        entryId: row.entryId,
        occurredAt: row.occurredAt,
        correction,
      });
    } catch {
      throw new ReportingStoreIntegrityError(
        'Stored reporting correction feed entry failed integrity validation.',
      );
    }
  }
  throw new ReportingStoreIntegrityError(
    'Stored reporting public feed entry type is invalid.',
  );
}

export async function listReportingPublicFeedEntries(
  database: D1Database,
  query: Readonly<ReportingPublicFeedQuery>,
) {
  await ensureReportingStoreSchema(database);
  const limit = query.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ReportingStoreIntegrityError(
      'Reporting public feed limit must be between 1 and 100.',
    );
  }
  const through = exactTime(query.through, 'Reporting public feed boundary');
  let cursor: Readonly<ReportingPublicFeedCursor> | undefined;
  if (query.cursor) {
    cursor = Object.freeze({
      entryType: query.cursor.entryType,
      entryId: query.cursor.entryId,
      occurredAt: exactTime(
        query.cursor.occurredAt,
        'Reporting public feed cursor time',
      ),
    });
    if (
      !['correction', 'publication'].includes(cursor.entryType) ||
      !UUID_PATTERN.test(cursor.entryId) ||
      Date.parse(cursor.occurredAt) > Date.parse(through)
    ) {
      throw new ReportingStoreIntegrityError(
        'Reporting public feed cursor is invalid.',
      );
    }
  }
  const cursorRank = cursor?.entryType === 'correction' ? 1 : 0;
  const rows = await database
    .prepare(
      `SELECT entry_type AS entryType, entry_id AS entryId,
              occurred_at AS occurredAt, public_id AS publicId,
              schema_version AS schemaVersion, publisher_id AS publisherId,
              source_revision AS sourceRevision,
              record_sha256 AS recordSha256,
              payload_sha256 AS payloadSha256, payload_json AS payloadJson
       FROM (
         SELECT 0 AS entry_rank, 'publication' AS entry_type,
                public_id AS entry_id,
                published_at AS occurred_at, public_id, schema_version,
                publisher_id, source_revision, record_sha256,
                record_sha256 AS payload_sha256, record_json AS payload_json
         FROM leftout_report_publications
         UNION ALL
         SELECT 1 AS entry_rank, 'correction' AS entry_type,
                correction_id AS entry_id,
                corrected_at AS occurred_at, public_id, schema_version,
                NULL AS publisher_id, NULL AS source_revision,
                publication_record_sha256 AS record_sha256,
                correction_sha256 AS payload_sha256,
                correction_json AS payload_json
         FROM leftout_report_publication_corrections
       ) AS entry
       WHERE occurred_at <= ?
         AND (
           ? IS NULL
           OR occurred_at > ?
           OR (
             occurred_at = ?
             AND (
               entry_rank > ?
               OR (entry_rank = ? AND entry_id > ?)
             )
           )
         )
       ORDER BY occurred_at ASC, entry_rank ASC, entry_id ASC
       LIMIT ?`,
    )
    .bind(
      through,
      cursor?.occurredAt ?? null,
      cursor?.occurredAt ?? '',
      cursor?.occurredAt ?? '',
      cursorRank,
      cursorRank,
      cursor?.entryId ?? '',
      limit + 1,
    )
    .all<ReportingPublicFeedRow>();
  const selected = rows.results.slice(0, limit);
  const entries = Object.freeze(selected.map(parsePublicFeedRow));
  const last = selected.at(-1);
  return Object.freeze({
    entries,
    nextCursor:
      rows.results.length > limit && last
        ? Object.freeze({
            entryType: last.entryType as 'correction' | 'publication',
            entryId: last.entryId,
            occurredAt: last.occurredAt,
          })
        : null,
  });
}

async function findIntake(
  database: D1Database,
  value: Readonly<ReportingIntakeIdempotency>,
) {
  return database
    .prepare(
      `SELECT request_sha256 AS requestSha256, report_id AS reportId
       FROM leftout_report_intake_idempotency
       WHERE invitation_id = ? AND key_sha256 = ?`,
    )
    .bind(value.invitationId, value.keySha256)
    .first<{ requestSha256: string; reportId: string }>();
}

function sameRecord(
  left: Readonly<ReportingLedgerRecord>,
  right: Readonly<ReportingLedgerRecord>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function loadReportingLedger(
  database: D1Database,
  reportId: string,
): Promise<Readonly<ReportingLedgerBundle> | null> {
  await ensureReportingStoreSchema(database);
  const recordRow = await database
    .prepare(
      `SELECT record_json AS recordJson, revision, state,
              last_event_sha256 AS lastEventSha256
       FROM leftout_report_records WHERE id = ?`,
    )
    .bind(reportId)
    .first<{
      recordJson: string;
      revision: number;
      state: string;
      lastEventSha256: string;
    }>();
  if (!recordRow) return null;
  const eventRows = await database
    .prepare(
      `SELECT event_json AS eventJson, sequence, event_sha256 AS eventSha256
       FROM leftout_report_events
       WHERE report_id = ? ORDER BY sequence ASC`,
    )
    .bind(reportId)
    .all<{ eventJson: string; sequence: number; eventSha256: string }>();

  try {
    const parsed = parseReportingLedgerBundle(
      JSON.parse(recordRow.recordJson) as unknown,
      eventRows.results.map((row) => JSON.parse(row.eventJson) as unknown),
    );
    if (
      parsed.record.revision !== recordRow.revision ||
      parsed.record.moderation.state !== recordRow.state ||
      parsed.record.lastEventSha256 !== recordRow.lastEventSha256 ||
      eventRows.results.some(
        (row, index) =>
          row.sequence !== index + 1 ||
          row.eventSha256 !== parsed.events[index]?.eventSha256,
      )
    ) {
      throw new Error('row metadata mismatch');
    }
    return parsed;
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting ledger failed integrity validation.',
    );
  }
}

interface ReportingRetentionStateRow {
  stateJson: string;
  revision: number;
  updatedAt: string;
  legalHold: number;
  retainUntil: string;
  policyVersion: string;
  lastEventSha256: string;
}

interface ReportingRetentionEventRow {
  eventJson: string;
  eventId: string;
  revision: number;
  at: string;
  actorId: string;
  actorRole: string;
  requestId: string;
  action: string;
  legalHold: number;
  retainUntil: string;
  policyVersion: string;
  previousEventSha256: string | null;
  eventSha256: string;
}

export async function loadReportingRetention(
  database: D1Database,
  reportId: string,
): Promise<Readonly<ReportingRetentionBundle> | null> {
  await ensureReportingStoreSchema(database);
  if (!UUID_PATTERN.test(reportId)) {
    throw new ReportingStoreIntegrityError(
      'Reporting retention identifier is invalid.',
    );
  }
  const stateRow = await database
    .prepare(
      `SELECT state_json AS stateJson, revision, updated_at AS updatedAt,
              legal_hold AS legalHold, retain_until AS retainUntil,
              policy_version AS policyVersion,
              last_event_sha256 AS lastEventSha256
       FROM leftout_report_retention_states WHERE report_id = ?`,
    )
    .bind(reportId)
    .first<ReportingRetentionStateRow>();
  if (!stateRow) {
    const orphaned = await database
      .prepare(
        'SELECT count(*) AS count FROM leftout_report_retention_events WHERE report_id = ?',
      )
      .bind(reportId)
      .first<{ count: number }>();
    if ((orphaned?.count ?? 0) !== 0) {
      throw new ReportingStoreIntegrityError(
        'Stored reporting retention events have no state snapshot.',
      );
    }
    return null;
  }
  const eventRows = await database
    .prepare(
      `SELECT event_json AS eventJson, event_id AS eventId, revision, at,
              actor_id AS actorId, actor_role AS actorRole,
              request_id AS requestId, action, legal_hold AS legalHold,
              retain_until AS retainUntil, policy_version AS policyVersion,
              previous_event_sha256 AS previousEventSha256,
              event_sha256 AS eventSha256
       FROM leftout_report_retention_events
       WHERE report_id = ? ORDER BY revision ASC`,
    )
    .bind(reportId)
    .all<ReportingRetentionEventRow>();

  try {
    const state = parseReportingRetentionState(
      JSON.parse(stateRow.stateJson) as unknown,
    );
    const events = Object.freeze(
      eventRows.results.map((row) =>
        parseReportingRetentionEvent(JSON.parse(row.eventJson) as unknown),
      ),
    );
    if (
      state.reportId !== reportId ||
      state.revision !== stateRow.revision ||
      state.updatedAt !== stateRow.updatedAt ||
      ![0, 1].includes(stateRow.legalHold) ||
      state.legalHold !== (stateRow.legalHold === 1) ||
      state.retainUntil !== stateRow.retainUntil ||
      state.policyVersion !== stateRow.policyVersion ||
      state.lastEventSha256 !== stateRow.lastEventSha256 ||
      events.length !== state.revision
    ) {
      throw new Error('retention state metadata mismatch');
    }
    for (const [index, event] of events.entries()) {
      const row = eventRows.results[index];
      const previous = events[index - 1];
      if (
        !row ||
        event.eventId !== row.eventId ||
        event.reportId !== reportId ||
        event.revision !== index + 1 ||
        event.revision !== row.revision ||
        event.at !== row.at ||
        event.actor.id !== row.actorId ||
        event.actor.role !== row.actorRole ||
        event.requestId !== row.requestId ||
        event.action !== row.action ||
        ![0, 1].includes(row.legalHold) ||
        event.legalHold !== (row.legalHold === 1) ||
        event.retainUntil !== row.retainUntil ||
        event.policyVersion !== row.policyVersion ||
        event.previousEventSha256 !== row.previousEventSha256 ||
        event.previousEventSha256 !==
          (previous ? previous.eventSha256 : null) ||
        event.eventSha256 !== row.eventSha256 ||
        event.retainUntil !== state.retainUntil ||
        event.policyVersion !== state.policyVersion ||
        (index === 0 &&
          (event.action !== 'policy_assigned' ||
            event.actor.role !== 'system' ||
            event.legalHold)) ||
        (index > 0 &&
          (event.actor.role !== 'custodian' ||
            event.action !==
              (event.legalHold ? 'legal_hold_set' : 'legal_hold_cleared') ||
            event.legalHold === previous?.legalHold))
      ) {
        throw new Error('retention event metadata mismatch');
      }
    }
    const last = events.at(-1);
    if (
      !last ||
      state.updatedAt !== last.at ||
      state.legalHold !== last.legalHold ||
      state.lastEventSha256 !== last.eventSha256
    ) {
      throw new Error('retention chain did not match state');
    }
    return Object.freeze({ state, events });
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting retention failed integrity validation.',
    );
  }
}

export async function loadReportingDeletionTombstone(
  database: D1Database,
  requestId: string,
) {
  await ensureReportingStoreSchema(database);
  if (!UUID_PATTERN.test(requestId)) {
    throw new ReportingStoreIntegrityError(
      'Reporting deletion request identifier is invalid.',
    );
  }
  const row = await database
    .prepare(
      `SELECT tombstone_json AS tombstoneJson,
              tombstone_id AS tombstoneId, schema_version AS schemaVersion,
              deleted_at AS deletedAt, reason, policy_version AS policyVersion,
              public_id AS publicId, publication_survives AS publicationSurvives,
              moderation_event_count AS moderationEventCount,
              retention_event_count AS retentionEventCount,
              last_moderation_event_sha256 AS lastModerationEventSha256,
              last_retention_event_sha256 AS lastRetentionEventSha256,
              custodian_id AS custodianId, request_id AS requestId,
              request_sha256 AS requestSha256,
              tombstone_sha256 AS tombstoneSha256
       FROM leftout_report_deletion_tombstones WHERE request_id = ?`,
    )
    .bind(requestId)
    .first<ReportingDeletionTombstoneRow>();
  return row ? parseDeletionTombstoneRow(row) : null;
}

function deletionRequest(
  value: Readonly<ReportingDeletionRequest>,
): Readonly<ReportingDeletionRequest> {
  if (
    !UUID_PATTERN.test(value.reportId) ||
    !UUID_PATTERN.test(value.requestId) ||
    !Number.isSafeInteger(value.expectedRetentionRevision) ||
    value.expectedRetentionRevision < 1 ||
    !REPORTING_DELETION_REASONS.includes(value.reason) ||
    typeof value.custodianId !== 'string' ||
    value.custodianId.length < 3 ||
    value.custodianId.length > 64 ||
    !ACTOR_ID_PATTERN.test(value.custodianId) ||
    !Number.isSafeInteger(value.now) ||
    value.now < 0 ||
    !Number.isFinite(new Date(value.now).valueOf()) ||
    digest(value.requestSha256, 'Reporting deletion request digest') !==
      reportingDeletionRequestSha256(value) ||
    (value.tombstoneId !== undefined && typeof value.tombstoneId !== 'function')
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting deletion request failed integrity validation.',
    );
  }
  return Object.freeze({ ...value });
}

function sameDeletionRequest(
  tombstone: Readonly<ReportingDeletionTombstone>,
  request: Readonly<ReportingDeletionRequest>,
) {
  return (
    tombstone.requestId === request.requestId &&
    tombstone.requestSha256 === request.requestSha256 &&
    tombstone.custodianId === request.custodianId &&
    tombstone.reason === request.reason
  );
}

export async function deleteReportingRecord(
  database: D1Database,
  requestValue: Readonly<ReportingDeletionRequest>,
) {
  const request = deletionRequest(requestValue);
  await ensureReportingStoreSchema(database);
  const existing = await loadReportingDeletionTombstone(
    database,
    request.requestId,
  );
  if (existing) {
    if (!sameDeletionRequest(existing, request)) {
      throw new ReportingStoreConflictError(
        'Reporting deletion request ID was reused for a different deletion.',
      );
    }
    return Object.freeze({
      disposition: 'existing' as const,
      tombstone: existing,
    });
  }

  const [ledger, retention, publication] = await Promise.all([
    loadReportingLedger(database, request.reportId),
    loadReportingRetention(database, request.reportId),
    loadReportingPublication(database, request.reportId),
  ]);
  if (!ledger || !retention) {
    throw new ReportingStoreConflictError(
      'Reporting record or retention state was not found.',
    );
  }
  if (
    (ledger.record.moderation.state === 'published') !==
    Boolean(publication)
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting publication link did not match private state.',
    );
  }
  if (retention.state.legalHold) {
    throw new ReportingStoreConflictError(
      'Reporting record is protected by legal hold.',
    );
  }
  if (retention.state.revision !== request.expectedRetentionRevision) {
    throw new ReportingStoreConflictError(
      'Reporting retention revision is stale.',
    );
  }
  const deletedAt = new Date(request.now).toISOString();
  if (
    request.reason === 'retention_expired' &&
    Date.parse(deletedAt) < Date.parse(retention.state.retainUntil)
  ) {
    throw new ReportingStoreConflictError(
      'Reporting retention deadline has not elapsed.',
    );
  }
  const tombstone = createReportingDeletionTombstone(
    {
      deletedAt,
      reason: request.reason,
      policyVersion: retention.state.policyVersion,
      publicId: publication?.publicId ?? null,
      publicationSurvives: Boolean(publication),
      moderationEventCount: ledger.events.length,
      retentionEventCount: retention.events.length,
      lastModerationEventSha256: ledger.record.lastEventSha256,
      lastRetentionEventSha256: retention.state.lastEventSha256,
      custodianId: request.custodianId,
      requestId: request.requestId,
      requestSha256: request.requestSha256,
    },
    { tombstoneId: request.tombstoneId },
  );

  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO leftout_report_deletion_authorizations (
            report_id, request_id, request_sha256, custodian_id,
            expected_retention_revision, authorized_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          request.reportId,
          request.requestId,
          request.requestSha256,
          request.custodianId,
          request.expectedRetentionRevision,
          deletedAt,
        ),
      deletionTombstoneStatement(database, tombstone),
      database
        .prepare(
          'DELETE FROM leftout_report_publication_links WHERE report_id = ?',
        )
        .bind(request.reportId),
      database
        .prepare(
          'DELETE FROM leftout_report_intake_idempotency WHERE report_id = ?',
        )
        .bind(request.reportId),
      database
        .prepare('DELETE FROM leftout_report_events WHERE report_id = ?')
        .bind(request.reportId),
      database
        .prepare(
          'DELETE FROM leftout_report_retention_events WHERE report_id = ?',
        )
        .bind(request.reportId),
      database
        .prepare(
          'DELETE FROM leftout_report_retention_states WHERE report_id = ?',
        )
        .bind(request.reportId),
      database
        .prepare('DELETE FROM leftout_report_records WHERE id = ?')
        .bind(request.reportId),
      database
        .prepare(
          'DELETE FROM leftout_report_deletion_authorizations WHERE report_id = ?',
        )
        .bind(request.reportId),
    ]);
  } catch {
    const raced = await loadReportingDeletionTombstone(
      database,
      request.requestId,
    );
    if (raced && sameDeletionRequest(raced, request)) {
      return Object.freeze({
        disposition: 'existing' as const,
        tombstone: raced,
      });
    }
    throw new ReportingStoreConflictError(
      'Reporting deletion could not be committed.',
    );
  }

  const [retainedLedger, retainedLifecycle, retainedLink, retainedTombstone] =
    await Promise.all([
      loadReportingLedger(database, request.reportId),
      loadReportingRetention(database, request.reportId),
      loadReportingPublication(database, request.reportId),
      loadReportingDeletionTombstone(database, request.requestId),
    ]);
  const authorization = await database
    .prepare(
      'SELECT count(*) AS count FROM leftout_report_deletion_authorizations WHERE report_id = ?',
    )
    .bind(request.reportId)
    .first<{ count: number }>();
  const publicProjection = tombstone.publicId
    ? await database
        .prepare(
          'SELECT count(*) AS count FROM leftout_report_publications WHERE public_id = ?',
        )
        .bind(tombstone.publicId)
        .first<{ count: number }>()
    : null;
  if (
    retainedLedger ||
    retainedLifecycle ||
    retainedLink ||
    !retainedTombstone ||
    retainedTombstone.tombstoneSha256 !== tombstone.tombstoneSha256 ||
    (authorization?.count ?? 0) !== 0 ||
    (tombstone.publicationSurvives && publicProjection?.count !== 1)
  ) {
    throw new ReportingStoreIntegrityError(
      'Committed reporting deletion failed postcondition verification.',
    );
  }
  return Object.freeze({
    disposition: 'deleted' as const,
    tombstone: retainedTombstone,
  });
}

export interface ReportingReviewCursor {
  updatedAt: string;
  reportId: string;
}

export interface ReportingReviewQuery {
  limit?: number;
  state?: IssueModerationState;
  cursor?: Readonly<ReportingReviewCursor>;
}

function exactCursor(value: Readonly<ReportingReviewCursor>) {
  if (
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    new Date(value.updatedAt).toISOString() !== value.updatedAt ||
    typeof value.reportId !== 'string' ||
    !UUID_PATTERN.test(value.reportId)
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting review cursor is invalid.',
    );
  }
  return value;
}

export async function listReportingLedgers(
  database: D1Database,
  query: Readonly<ReportingReviewQuery> = {},
) {
  await ensureReportingStoreSchema(database);
  const limit = query.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new ReportingStoreIntegrityError(
      'Reporting review limit must be between 1 and 50.',
    );
  }
  if (
    query.state !== undefined &&
    !ISSUE_MODERATION_STATES.includes(query.state)
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting review state is invalid.',
    );
  }
  const cursor = query.cursor ? exactCursor(query.cursor) : undefined;
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (query.state) {
    clauses.push('state = ?');
    bindings.push(query.state);
  }
  if (cursor) {
    clauses.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
    bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.reportId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await database
    .prepare(
      `SELECT id, updated_at AS updatedAt
       FROM leftout_report_records
       ${where}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(...bindings, limit + 1)
    .all<{ id: string; updatedAt: string }>();
  const selected = rows.results.slice(0, limit);
  const ledgers = await Promise.all(
    selected.map(async (row) => {
      const ledger = await loadReportingLedger(database, row.id);
      if (!ledger) {
        throw new ReportingStoreIntegrityError(
          'Reporting review row disappeared during pagination.',
        );
      }
      return ledger;
    }),
  );
  const last = selected.at(-1);
  return Object.freeze({
    ledgers: Object.freeze(ledgers),
    nextCursor:
      rows.results.length > limit && last
        ? Object.freeze({ updatedAt: last.updatedAt, reportId: last.id })
        : null,
  });
}

async function resolveExistingIntake(
  database: D1Database,
  value: Readonly<ReportingIntakeIdempotency>,
) {
  const existing = await findIntake(database, value);
  if (!existing) return null;
  if (existing.requestSha256 !== value.requestSha256) {
    throw new ReportingStoreConflictError(
      'Reporting idempotency key was reused for a different request.',
    );
  }
  const ledger = await loadReportingLedger(database, existing.reportId);
  if (!ledger) {
    throw new ReportingStoreIntegrityError(
      'Reporting idempotency record points to a missing report.',
    );
  }
  return Object.freeze({ disposition: 'existing' as const, ledger });
}

async function verifyExistingRetention(
  database: D1Database,
  expected: Readonly<{
    state: Readonly<ReportingRetentionState>;
    event: Readonly<ReportingRetentionEvent>;
  }>,
) {
  const retained = await loadReportingRetention(
    database,
    expected.state.reportId,
  );
  if (
    !retained ||
    retained.state.retainUntil !== expected.state.retainUntil ||
    retained.state.policyVersion !== expected.state.policyVersion ||
    JSON.stringify(retained.events[0]) !== JSON.stringify(expected.event)
  ) {
    throw new ReportingStoreIntegrityError(
      'Existing reporting intake is missing its original retention assignment.',
    );
  }
}

export async function saveReportingIntake(
  database: D1Database,
  bundle: Readonly<{
    record: Readonly<ReportingLedgerRecord>;
    event: Readonly<ReportingLedgerEvent>;
  }>,
  idempotencyValue: Readonly<ReportingIntakeIdempotency>,
  intakeQuotaPolicy?: Readonly<ReportingIntakeQuotaPolicy>,
  retentionValue?: Readonly<{
    state: Readonly<ReportingRetentionState>;
    event: Readonly<ReportingRetentionEvent>;
  }>,
) {
  const idempotency = intakeIdempotency(idempotencyValue);
  const retention = retentionValue
    ? initialRetentionBundle(retentionValue)
    : undefined;
  if (
    bundle.record.revision !== 1 ||
    bundle.event.sequence !== 1 ||
    bundle.event.actor.role !== 'intake' ||
    bundle.event.actor.id !== idempotency.invitationId ||
    !verifyReportingLedgerChain(bundle.record, [bundle.event]) ||
    (retention !== undefined &&
      (retention.state.reportId !== bundle.record.moderation.id ||
        retention.event.requestId !== bundle.event.requestId ||
        retention.event.at !== bundle.record.moderation.receivedAt))
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting intake bundle failed integrity validation.',
    );
  }
  await ensureReportingStoreSchema(database);
  const existing = await resolveExistingIntake(database, idempotency);
  if (existing) {
    if (retention) await verifyExistingRetention(database, retention);
    return existing;
  }

  try {
    await database.batch([
      ...(intakeQuotaPolicy
        ? quotaStatements(database, intakeQuotaPolicy)
        : []),
      recordStatement(database, bundle.record),
      eventStatement(database, bundle.event),
      ...(retention
        ? [
            retentionStateStatement(database, retention.state),
            retentionEventStatement(database, retention.event),
          ]
        : []),
      database
        .prepare(
          `INSERT INTO leftout_report_intake_idempotency (
            invitation_id, key_sha256, request_sha256, report_id, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          idempotency.invitationId,
          idempotency.keySha256,
          idempotency.requestSha256,
          bundle.record.moderation.id,
          bundle.record.moderation.receivedAt,
        ),
    ]);
  } catch (error) {
    const raced = await resolveExistingIntake(database, idempotency);
    if (raced) return raced;
    if (String(error).includes('leftout_reporting_quota_exhausted')) {
      throw new ReportingStoreQuotaError(
        'Reporting intake quota is exhausted.',
      );
    }
    throw new ReportingStoreConflictError(
      'Reporting intake could not be committed.',
    );
  }
  const ledger = await loadReportingLedger(
    database,
    bundle.record.moderation.id,
  );
  if (!ledger || !sameRecord(ledger.record, bundle.record)) {
    throw new ReportingStoreIntegrityError(
      'Committed reporting intake did not match its source record.',
    );
  }
  if (retention) await verifyExistingRetention(database, retention);
  return Object.freeze({ disposition: 'created' as const, ledger });
}

export async function loadReportingRequestEvent(
  database: D1Database,
  reportId: string,
  requestId: string,
) {
  const row = await database
    .prepare(
      `SELECT event_json AS eventJson FROM leftout_report_events
       WHERE report_id = ? AND request_id = ?`,
    )
    .bind(reportId, requestId)
    .first<{ eventJson: string }>();
  if (!row) return null;
  try {
    return parseReportingLedgerEvent(JSON.parse(row.eventJson) as unknown);
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting request event failed integrity validation.',
    );
  }
}

export async function loadReportingRetentionRequestEvent(
  database: D1Database,
  reportId: string,
  requestId: string,
) {
  await ensureReportingStoreSchema(database);
  const row = await database
    .prepare(
      `SELECT event_json AS eventJson FROM leftout_report_retention_events
       WHERE report_id = ? AND request_id = ?`,
    )
    .bind(reportId, requestId)
    .first<{ eventJson: string }>();
  if (!row) return null;
  try {
    return parseReportingRetentionEvent(JSON.parse(row.eventJson) as unknown);
  } catch {
    throw new ReportingStoreIntegrityError(
      'Stored reporting retention request event failed integrity validation.',
    );
  }
}

function sameRetentionTransitionRequest(
  left: Readonly<ReportingRetentionEvent>,
  right: Readonly<ReportingRetentionEvent>,
) {
  return (
    left.reportId === right.reportId &&
    left.revision === right.revision &&
    left.actor.id === right.actor.id &&
    left.actor.role === right.actor.role &&
    left.requestId === right.requestId &&
    left.action === right.action &&
    left.legalHold === right.legalHold &&
    left.retainUntil === right.retainUntil &&
    left.policyVersion === right.policyVersion &&
    left.previousEventSha256 === right.previousEventSha256
  );
}

export async function saveReportingRetentionTransition(
  database: D1Database,
  nextValue: Readonly<{
    state: Readonly<ReportingRetentionState>;
    event: Readonly<ReportingRetentionEvent>;
  }>,
) {
  let next;
  try {
    next = Object.freeze({
      state: parseReportingRetentionState(nextValue.state),
      event: parseReportingRetentionEvent(nextValue.event),
    });
  } catch {
    throw new ReportingStoreIntegrityError(
      'Reporting retention transition failed integrity validation.',
    );
  }
  await ensureReportingStoreSchema(database);
  const current = await loadReportingRetention(database, next.event.reportId);
  if (!current) {
    throw new ReportingStoreConflictError(
      'Reporting retention state was not found.',
    );
  }
  const existingRequest = await loadReportingRetentionRequestEvent(
    database,
    next.event.reportId,
    next.event.requestId,
  );
  if (existingRequest) {
    if (!sameRetentionTransitionRequest(existingRequest, next.event)) {
      throw new ReportingStoreConflictError(
        'Reporting lifecycle request ID was reused for a different transition.',
      );
    }
    return Object.freeze({
      disposition: 'existing' as const,
      retention: current,
    });
  }
  if (
    next.state.reportId !== current.state.reportId ||
    next.state.revision !== current.state.revision + 1 ||
    next.event.reportId !== current.state.reportId ||
    next.event.revision !== next.state.revision ||
    next.event.actor.role !== 'custodian' ||
    next.event.previousEventSha256 !== current.state.lastEventSha256 ||
    next.event.legalHold === current.state.legalHold ||
    next.event.action !==
      (next.event.legalHold ? 'legal_hold_set' : 'legal_hold_cleared') ||
    next.event.retainUntil !== current.state.retainUntil ||
    next.event.policyVersion !== current.state.policyVersion ||
    next.state.updatedAt !== next.event.at ||
    next.state.legalHold !== next.event.legalHold ||
    next.state.retainUntil !== next.event.retainUntil ||
    next.state.policyVersion !== next.event.policyVersion ||
    next.state.lastEventSha256 !== next.event.eventSha256
  ) {
    throw new ReportingStoreConflictError(
      'Reporting lifecycle transition does not extend the current revision.',
    );
  }

  try {
    await database.batch([
      database
        .prepare(
          `UPDATE leftout_report_retention_states
           SET revision = ?, updated_at = ?, legal_hold = ?,
               last_event_sha256 = ?, state_json = ?
           WHERE report_id = ? AND revision = ? AND last_event_sha256 = ?`,
        )
        .bind(
          next.state.revision,
          next.state.updatedAt,
          next.state.legalHold ? 1 : 0,
          next.state.lastEventSha256,
          JSON.stringify(next.state),
          next.state.reportId,
          current.state.revision,
          current.state.lastEventSha256,
        ),
      retentionEventStatement(database, next.event),
    ]);
  } catch {
    const raced = await loadReportingRetentionRequestEvent(
      database,
      next.event.reportId,
      next.event.requestId,
    );
    if (raced && sameRetentionTransitionRequest(raced, next.event)) {
      const retained = await loadReportingRetention(
        database,
        next.event.reportId,
      );
      if (retained) {
        return Object.freeze({
          disposition: 'existing' as const,
          retention: retained,
        });
      }
    }
    throw new ReportingStoreConflictError(
      'Reporting lifecycle transition lost its optimistic revision race.',
    );
  }
  const retained = await loadReportingRetention(database, next.event.reportId);
  if (
    !retained ||
    JSON.stringify(retained.state) !== JSON.stringify(next.state) ||
    JSON.stringify(retained.events.at(-1)) !== JSON.stringify(next.event)
  ) {
    throw new ReportingStoreIntegrityError(
      'Committed reporting lifecycle transition did not match its source.',
    );
  }
  return Object.freeze({
    disposition: 'updated' as const,
    retention: retained,
  });
}

function sameTransitionRequest(
  left: Readonly<ReportingLedgerEvent>,
  right: Readonly<ReportingLedgerEvent>,
) {
  return (
    left.reportId === right.reportId &&
    left.revision === right.revision &&
    left.from === right.from &&
    left.to === right.to &&
    left.payloadSha256 === right.payloadSha256 &&
    left.previousEventSha256 === right.previousEventSha256 &&
    left.actor.id === right.actor.id &&
    left.actor.role === right.actor.role &&
    left.requestId === right.requestId
  );
}

export async function saveReportingTransition(
  database: D1Database,
  next: Readonly<{
    record: Readonly<ReportingLedgerRecord>;
    event: Readonly<ReportingLedgerEvent>;
  }>,
) {
  await ensureReportingStoreSchema(database);
  const current = await loadReportingLedger(database, next.event.reportId);
  if (!current) {
    throw new ReportingStoreConflictError('Reporting record was not found.');
  }
  const existingRequest = await loadReportingRequestEvent(
    database,
    next.event.reportId,
    next.event.requestId,
  );
  if (existingRequest) {
    if (!sameTransitionRequest(existingRequest, next.event)) {
      throw new ReportingStoreConflictError(
        'Reporting request ID was reused for a different transition.',
      );
    }
    if (
      existingRequest.to === 'published' &&
      !(await loadReportingPublication(database, next.event.reportId))
    ) {
      throw new ReportingStoreIntegrityError(
        'Reporting publication record is missing.',
      );
    }
    return Object.freeze({ disposition: 'existing' as const, ledger: current });
  }
  if (
    next.record.revision !== current.record.revision + 1 ||
    next.event.sequence !== next.record.revision ||
    next.event.previousEventSha256 !== current.record.lastEventSha256 ||
    !verifyReportingLedgerChain(next.record, [...current.events, next.event])
  ) {
    throw new ReportingStoreConflictError(
      'Reporting transition does not extend the current ledger revision.',
    );
  }
  const publication = publicationRecord(next.record, next.event);

  try {
    await database.batch([
      database
        .prepare(
          `UPDATE leftout_report_records
           SET schema_version = ?, revision = ?, state = ?, updated_at = ?,
               last_event_sha256 = ?, record_json = ?
           WHERE id = ? AND revision = ? AND last_event_sha256 = ?`,
        )
        .bind(
          next.record.schemaVersion,
          next.record.revision,
          next.record.moderation.state,
          next.record.moderation.updatedAt,
          next.record.lastEventSha256,
          JSON.stringify(next.record),
          next.record.moderation.id,
          current.record.revision,
          current.record.lastEventSha256,
        ),
      eventStatement(database, next.event),
      ...(publication ? publicationStatements(database, publication) : []),
    ]);
  } catch {
    const racedRequest = await loadReportingRequestEvent(
      database,
      next.event.reportId,
      next.event.requestId,
    );
    if (racedRequest && sameTransitionRequest(racedRequest, next.event)) {
      const ledger = await loadReportingLedger(database, next.event.reportId);
      const retainedPublication =
        racedRequest.to === 'published'
          ? await loadReportingPublication(database, next.event.reportId)
          : null;
      if (ledger && (racedRequest.to !== 'published' || retainedPublication)) {
        return Object.freeze({ disposition: 'existing' as const, ledger });
      }
    }
    throw new ReportingStoreConflictError(
      'Reporting transition lost its optimistic revision race.',
    );
  }
  const ledger = await loadReportingLedger(database, next.event.reportId);
  if (!ledger || !sameRecord(ledger.record, next.record)) {
    throw new ReportingStoreIntegrityError(
      'Committed reporting transition did not match its source record.',
    );
  }
  if (publication) {
    const retained = await loadReportingPublication(
      database,
      next.event.reportId,
    );
    if (
      !retained ||
      retained.recordSha256 !== publication.recordSha256 ||
      retained.publisherId !== publication.publisherId ||
      retained.sourceRevision !== publication.sourceRevision
    ) {
      throw new ReportingStoreIntegrityError(
        'Committed reporting publication did not match its source record.',
      );
    }
  }
  return Object.freeze({ disposition: 'updated' as const, ledger });
}
