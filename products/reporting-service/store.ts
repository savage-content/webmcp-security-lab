import { createHash } from 'node:crypto';

import {
  parseReportingLedgerBundle,
  parseReportingLedgerEvent,
  verifyReportingLedgerChain,
  type ReportingLedgerEvent,
  type ReportingLedgerRecord,
} from './ledger';

export const REPORTING_STORE_SCHEMA_VERSION = 2 as const;

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

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const INVITATION_ID_PATTERN =
  /^invitation\.[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;

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
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_records_state_updated ON leftout_report_records(state, updated_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_events_report_sequence ON leftout_report_events(report_id, sequence)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_events_report_request ON leftout_report_events(report_id, request_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leftout_report_intake_idempotency_key ON leftout_report_intake_idempotency(invitation_id, key_sha256)',
  'CREATE INDEX IF NOT EXISTS idx_leftout_report_intake_quotas_expiry ON leftout_report_intake_quotas(expires_at)',
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
    BEGIN
      SELECT RAISE(ABORT, 'leftout_report_idempotency_append_only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_leftout_report_records_no_delete
    BEFORE DELETE ON leftout_report_records
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

export async function saveReportingIntake(
  database: D1Database,
  bundle: Readonly<{
    record: Readonly<ReportingLedgerRecord>;
    event: Readonly<ReportingLedgerEvent>;
  }>,
  idempotencyValue: Readonly<ReportingIntakeIdempotency>,
  intakeQuotaPolicy?: Readonly<ReportingIntakeQuotaPolicy>,
) {
  const idempotency = intakeIdempotency(idempotencyValue);
  if (
    bundle.record.revision !== 1 ||
    bundle.event.sequence !== 1 ||
    bundle.event.actor.role !== 'intake' ||
    bundle.event.actor.id !== idempotency.invitationId ||
    !verifyReportingLedgerChain(bundle.record, [bundle.event])
  ) {
    throw new ReportingStoreIntegrityError(
      'Reporting intake bundle failed integrity validation.',
    );
  }
  await ensureReportingStoreSchema(database);
  const existing = await resolveExistingIntake(database, idempotency);
  if (existing) return existing;

  try {
    await database.batch([
      ...(intakeQuotaPolicy
        ? quotaStatements(database, intakeQuotaPolicy)
        : []),
      recordStatement(database, bundle.record),
      eventStatement(database, bundle.event),
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
  return Object.freeze({ disposition: 'created' as const, ledger });
}

async function findRequestEvent(
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
  const existingRequest = await findRequestEvent(
    database,
    next.event.reportId,
    next.event.requestId,
  );
  if (existingRequest) {
    if (existingRequest.eventSha256 !== next.event.eventSha256) {
      throw new ReportingStoreConflictError(
        'Reporting request ID was reused for a different transition.',
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
    ]);
  } catch {
    const racedRequest = await findRequestEvent(
      database,
      next.event.reportId,
      next.event.requestId,
    );
    if (racedRequest?.eventSha256 === next.event.eventSha256) {
      const ledger = await loadReportingLedger(database, next.event.reportId);
      if (ledger) {
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
  return Object.freeze({ disposition: 'updated' as const, ledger });
}
