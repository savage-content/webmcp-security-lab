import { createHash, randomUUID } from 'node:crypto';

export const REPORTING_PUBLIC_CORRECTION_SCHEMA_VERSION =
  'leftout.public-issue-correction/1' as const;

export const REPORTING_PUBLIC_CORRECTION_ACTIONS = ['withdraw'] as const;
export const REPORTING_PUBLIC_CORRECTION_REASONS = [
  'consent_withdrawn',
  'duplicate',
  'erroneous_publication',
  'evidence_invalidated',
] as const;

export type ReportingPublicCorrectionAction =
  (typeof REPORTING_PUBLIC_CORRECTION_ACTIONS)[number];
export type ReportingPublicCorrectionReason =
  (typeof REPORTING_PUBLIC_CORRECTION_REASONS)[number];

export interface ReportingPublicCorrection {
  schemaVersion: typeof REPORTING_PUBLIC_CORRECTION_SCHEMA_VERSION;
  correctionId: string;
  publicId: string;
  correctedAt: string;
  action: ReportingPublicCorrectionAction;
  reason: ReportingPublicCorrectionReason;
  publicationRecordSha256: string;
  correctionSha256: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CORRECTION_FIELDS = Object.freeze([
  'schemaVersion',
  'correctionId',
  'publicId',
  'correctedAt',
  'action',
  'reason',
  'publicationRecordSha256',
  'correctionSha256',
]);

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
    throw new Error('Correction time must be an exact ISO-8601 UTC timestamp.');
  }
  return value;
}

function digest(value: unknown) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(
      'Correction publication digest must be a lowercase SHA-256 digest.',
    );
  }
  return value;
}

function correctionHash(
  value: Omit<Readonly<ReportingPublicCorrection>, 'correctionSha256'>,
) {
  return sha256(JSON.stringify(value));
}

function makeCorrection(input: {
  correctionId: string;
  publicId: string;
  correctedAt: string;
  action: ReportingPublicCorrectionAction;
  reason: ReportingPublicCorrectionReason;
  publicationRecordSha256: string;
}) {
  if (!REPORTING_PUBLIC_CORRECTION_ACTIONS.includes(input.action)) {
    throw new Error('Correction action is invalid.');
  }
  if (!REPORTING_PUBLIC_CORRECTION_REASONS.includes(input.reason)) {
    throw new Error('Correction reason is invalid.');
  }
  const value = Object.freeze({
    schemaVersion: REPORTING_PUBLIC_CORRECTION_SCHEMA_VERSION,
    correctionId: uuid(input.correctionId, 'Correction ID'),
    publicId: uuid(input.publicId, 'Correction public ID'),
    correctedAt: exactTime(input.correctedAt),
    action: input.action,
    reason: input.reason,
    publicationRecordSha256: digest(input.publicationRecordSha256),
  });
  return Object.freeze({
    ...value,
    correctionSha256: correctionHash(value),
  });
}

export function createReportingPublicCorrection(
  input: Omit<
    ReportingPublicCorrection,
    'schemaVersion' | 'correctionId' | 'correctionSha256'
  >,
  options: { correctionId?: () => string } = {},
) {
  return makeCorrection({
    ...input,
    correctionId: (options.correctionId ?? randomUUID)(),
  });
}

export function parseReportingPublicCorrection(
  value: unknown,
): Readonly<ReportingPublicCorrection> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stored reporting correction is invalid.');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(candidate);
  if (
    keys.length !== CORRECTION_FIELDS.length ||
    keys.some((key) => typeof key !== 'string') ||
    CORRECTION_FIELDS.some((key) => !Object.hasOwn(candidate, key)) ||
    candidate.schemaVersion !== REPORTING_PUBLIC_CORRECTION_SCHEMA_VERSION ||
    typeof candidate.action !== 'string' ||
    !REPORTING_PUBLIC_CORRECTION_ACTIONS.includes(
      candidate.action as ReportingPublicCorrectionAction,
    ) ||
    typeof candidate.reason !== 'string' ||
    !REPORTING_PUBLIC_CORRECTION_REASONS.includes(
      candidate.reason as ReportingPublicCorrectionReason,
    ) ||
    typeof candidate.correctionSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.correctionSha256)
  ) {
    throw new Error('Stored reporting correction is invalid.');
  }
  const parsed = makeCorrection({
    correctionId: candidate.correctionId as string,
    publicId: candidate.publicId as string,
    correctedAt: candidate.correctedAt as string,
    action: candidate.action as ReportingPublicCorrectionAction,
    reason: candidate.reason as ReportingPublicCorrectionReason,
    publicationRecordSha256: candidate.publicationRecordSha256 as string,
  });
  if (parsed.correctionSha256 !== candidate.correctionSha256) {
    throw new Error('Stored reporting correction hash is invalid.');
  }
  return parsed;
}
