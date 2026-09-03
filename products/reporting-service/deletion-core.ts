import { createHash, randomUUID } from 'node:crypto';

export const REPORTING_DELETION_TOMBSTONE_SCHEMA_VERSION =
  'leftout.reporting-deletion-tombstone/1' as const;

export const REPORTING_DELETION_REASONS = [
  'retention_expired',
  'data_subject_request',
] as const;

export type ReportingDeletionReason =
  (typeof REPORTING_DELETION_REASONS)[number];

export interface ReportingDeletionTombstone {
  schemaVersion: typeof REPORTING_DELETION_TOMBSTONE_SCHEMA_VERSION;
  tombstoneId: string;
  deletedAt: string;
  reason: ReportingDeletionReason;
  policyVersion: string;
  publicId: string | null;
  publicationSurvives: boolean;
  moderationEventCount: number;
  retentionEventCount: number;
  lastModerationEventSha256: string;
  lastRetentionEventSha256: string;
  custodianId: string;
  requestId: string;
  requestSha256: string;
  tombstoneSha256: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POLICY_PATTERN = /^retention\.[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;
const ACTOR_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;
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

function exactTime(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error('Deletion time must be an exact ISO-8601 UTC timestamp.');
  }
  return value;
}

function count(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function digest(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function policy(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !POLICY_PATTERN.test(value)
  ) {
    throw new Error('Deletion retention policy is invalid.');
  }
  return value;
}

function custodian(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length < 3 ||
    value.length > 64 ||
    !ACTOR_PATTERN.test(value)
  ) {
    throw new Error('Deletion custodian is invalid.');
  }
  return value;
}

function tombstoneHash(
  value: Omit<Readonly<ReportingDeletionTombstone>, 'tombstoneSha256'>,
) {
  return sha256(JSON.stringify(value));
}

function makeTombstone(input: {
  tombstoneId: string;
  deletedAt: string;
  reason: ReportingDeletionReason;
  policyVersion: string;
  publicId: string | null;
  publicationSurvives: boolean;
  moderationEventCount: number;
  retentionEventCount: number;
  lastModerationEventSha256: string;
  lastRetentionEventSha256: string;
  custodianId: string;
  requestId: string;
  requestSha256: string;
}) {
  const value = Object.freeze({
    schemaVersion: REPORTING_DELETION_TOMBSTONE_SCHEMA_VERSION,
    tombstoneId: uuid(input.tombstoneId, 'Deletion tombstone ID'),
    deletedAt: exactTime(input.deletedAt),
    reason: input.reason,
    policyVersion: policy(input.policyVersion),
    publicId:
      input.publicId === null
        ? null
        : uuid(input.publicId, 'Deletion public ID'),
    publicationSurvives: input.publicationSurvives,
    moderationEventCount: count(
      input.moderationEventCount,
      'Moderation event count',
    ),
    retentionEventCount: count(
      input.retentionEventCount,
      'Retention event count',
    ),
    lastModerationEventSha256: digest(
      input.lastModerationEventSha256,
      'Last moderation event digest',
    ),
    lastRetentionEventSha256: digest(
      input.lastRetentionEventSha256,
      'Last retention event digest',
    ),
    custodianId: custodian(input.custodianId),
    requestId: uuid(input.requestId, 'Deletion request ID'),
    requestSha256: digest(input.requestSha256, 'Deletion request digest'),
  });
  if (
    !REPORTING_DELETION_REASONS.includes(value.reason) ||
    typeof value.publicationSurvives !== 'boolean' ||
    value.publicationSurvives !== (value.publicId !== null)
  ) {
    throw new Error('Deletion tombstone is invalid.');
  }
  return Object.freeze({
    ...value,
    tombstoneSha256: tombstoneHash(value),
  });
}

export function createReportingDeletionTombstone(
  input: Omit<
    ReportingDeletionTombstone,
    'schemaVersion' | 'tombstoneId' | 'tombstoneSha256'
  >,
  options: { tombstoneId?: () => string } = {},
) {
  return makeTombstone({
    ...input,
    tombstoneId: (options.tombstoneId ?? randomUUID)(),
  });
}

export function parseReportingDeletionTombstone(
  value: unknown,
): Readonly<ReportingDeletionTombstone> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stored reporting deletion tombstone is invalid.');
  }
  const candidate = value as Record<string, unknown>;
  const expected = [
    'schemaVersion',
    'tombstoneId',
    'deletedAt',
    'reason',
    'policyVersion',
    'publicId',
    'publicationSurvives',
    'moderationEventCount',
    'retentionEventCount',
    'lastModerationEventSha256',
    'lastRetentionEventSha256',
    'custodianId',
    'requestId',
    'requestSha256',
    'tombstoneSha256',
  ];
  const keys = Reflect.ownKeys(candidate);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string') ||
    expected.some((key) => !Object.hasOwn(candidate, key)) ||
    candidate.schemaVersion !== REPORTING_DELETION_TOMBSTONE_SCHEMA_VERSION ||
    typeof candidate.reason !== 'string' ||
    !REPORTING_DELETION_REASONS.includes(
      candidate.reason as ReportingDeletionReason,
    ) ||
    typeof candidate.publicationSurvives !== 'boolean' ||
    typeof candidate.tombstoneSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.tombstoneSha256)
  ) {
    throw new Error('Stored reporting deletion tombstone is invalid.');
  }
  const parsed = makeTombstone({
    tombstoneId: candidate.tombstoneId as string,
    deletedAt: candidate.deletedAt as string,
    reason: candidate.reason as ReportingDeletionReason,
    policyVersion: candidate.policyVersion as string,
    publicId: candidate.publicId as string | null,
    publicationSurvives: candidate.publicationSurvives,
    moderationEventCount: Number(candidate.moderationEventCount),
    retentionEventCount: Number(candidate.retentionEventCount),
    lastModerationEventSha256: candidate.lastModerationEventSha256 as string,
    lastRetentionEventSha256: candidate.lastRetentionEventSha256 as string,
    custodianId: candidate.custodianId as string,
    requestId: candidate.requestId as string,
    requestSha256: candidate.requestSha256 as string,
  });
  if (parsed.tombstoneSha256 !== candidate.tombstoneSha256) {
    throw new Error('Stored reporting deletion tombstone hash is invalid.');
  }
  return parsed;
}
