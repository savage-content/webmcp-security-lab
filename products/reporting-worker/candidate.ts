import { isIP } from 'node:net';

import { z } from 'zod';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const NAME_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const DATABASE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const RESERVED_SUFFIXES = [
  '.example',
  '.invalid',
  '.local',
  '.localhost',
  '.test',
];
const ZERO_DATABASE_ID = '00000000-0000-4000-8000-000000000000';

const inputSchema = z
  .object({
    schemaVersion: z.literal('leftout.reporting-routable-candidate-input/1'),
    candidateDate: z.iso.date(),
    workerName: z.string().min(3).max(63).regex(NAME_PATTERN),
    serviceHostname: z.string().min(4).max(253),
    learningSiteHostname: z.string().min(4).max(253),
    databaseName: z.string().min(3).max(128).regex(DATABASE_NAME_PATTERN),
    databaseId: z.uuid(),
  })
  .strict();

const sourceEvidenceSchema = z
  .object({
    releaseEvidenceSha256: z.string().regex(SHA256_PATTERN),
    workerSourceSha256: z.string().regex(SHA256_PATTERN),
    migrationSetSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export type ReportingCandidateInput = z.infer<typeof inputSchema>;
export type ReportingCandidateSourceEvidence = z.infer<
  typeof sourceEvidenceSchema
>;

function normalizedPublicHostname(value: string, label: string) {
  if (value !== value.trim() || value !== value.toLowerCase()) {
    throw new Error(`${label} must be a lowercase hostname without padding.`);
  }
  if (
    value.includes(':') ||
    value.includes('/') ||
    value.includes('*') ||
    isIP(value) !== 0
  ) {
    throw new Error(
      `${label} must be a hostname without scheme, port, or wildcard.`,
    );
  }
  const labels = value.split('.');
  if (
    labels.length < 2 ||
    labels.some((part) => !HOST_LABEL_PATTERN.test(part)) ||
    /^\d+$/u.test(labels.at(-1) ?? '') ||
    RESERVED_SUFFIXES.some(
      (suffix) => value === suffix.slice(1) || value.endsWith(suffix),
    )
  ) {
    throw new Error(`${label} must be a non-reserved public hostname.`);
  }
  return value;
}

function jsonBytes(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createRoutableDisabledReportingCandidate(
  candidateInput: unknown,
  sourceEvidenceInput: unknown,
) {
  const input = inputSchema.parse(candidateInput);
  const sourceEvidence = sourceEvidenceSchema.parse(sourceEvidenceInput);
  const serviceHostname = normalizedPublicHostname(
    input.serviceHostname,
    'Reporting service hostname',
  );
  const learningSiteHostname = normalizedPublicHostname(
    input.learningSiteHostname,
    'Learning-site hostname',
  );
  if (serviceHostname === learningSiteHostname) {
    throw new Error(
      'Reporting service hostname must be separate from the public learning site.',
    );
  }
  if (input.databaseId === ZERO_DATABASE_ID) {
    throw new Error(
      'Reporting candidate requires a non-placeholder D1 database ID.',
    );
  }

  const configuration = Object.freeze({
    $schema: '../../../../node_modules/wrangler/config-schema.json',
    name: input.workerName,
    main: '../../../../products/reporting-worker/worker.ts',
    compatibility_date: input.candidateDate,
    compatibility_flags: Object.freeze(['nodejs_compat']),
    workers_dev: false,
    preview_urls: false,
    routes: Object.freeze([
      Object.freeze({ pattern: serviceHostname, custom_domain: true }),
    ]),
    vars: Object.freeze({ LEFTOUT_REPORTING_MODE: 'disabled' }),
    d1_databases: Object.freeze([
      Object.freeze({
        binding: 'DB',
        database_name: input.databaseName,
        database_id: input.databaseId,
        migrations_dir: '../../../../drizzle',
      }),
    ]),
    observability: Object.freeze({ enabled: true }),
    send_metrics: false,
  });

  const manifest = Object.freeze({
    schemaVersion: 'leftout.reporting-routable-disabled-candidate/1' as const,
    candidateDate: input.candidateDate,
    workerName: input.workerName,
    serviceHostname,
    databaseName: input.databaseName,
    databaseId: input.databaseId,
    sourceEvidence,
    claims: Object.freeze({
      mutatesCloudflare: false as const,
      deploysService: false as const,
      reportingMode: 'disabled' as const,
      externalIntakeEnabled: false as const,
      containsSecrets: false as const,
      privacyApproved: false as const,
      operationalReleaseReady: false as const,
    }),
  });

  return Object.freeze({
    configuration,
    configurationBytes: jsonBytes(configuration),
    manifest,
    manifestBytes: jsonBytes(manifest),
  });
}
