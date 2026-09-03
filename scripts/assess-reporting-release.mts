import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

const REQUIRED_GATE_IDS = [
  'standalone_route_isolation',
  'd1_binding_and_migration_rehearsal',
  'privacy_approval',
  'production_identity_role_separation',
  'abuse_monitoring_and_support',
  'retention_backup_and_deletion_operations',
  'feed_key_custody_and_trust_distribution',
  'incident_ownership_and_rehearsal',
  'separate_service_hostname',
  'operator_novice_and_accessibility',
  'invited_cohort_enablement',
] as const;

const gateSchema = z
  .object({
    id: z.enum(REQUIRED_GATE_IDS),
    status: z.enum(['missing', 'source_ready', 'verified']),
    evidence: z.array(z.string().min(1).max(240)),
  })
  .strict();

const releaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal('leftout.reporting-release-evidence/1'),
    evidenceDate: z.iso.date(),
    releaseChannel: z.enum(['disabled_source_preview', 'production_candidate']),
    gates: z.array(gateSchema),
  })
  .strict();

const disabledWranglerSchema = z
  .object({
    $schema: z.literal('../../node_modules/wrangler/config-schema.json'),
    name: z.literal('leftout-reporting-disabled-preview'),
    main: z.literal('worker.ts'),
    compatibility_date: z.iso.date(),
    compatibility_flags: z.tuple([z.literal('nodejs_compat')]),
    workers_dev: z.literal(false),
    vars: z.object({ LEFTOUT_REPORTING_MODE: z.literal('disabled') }).strict(),
    d1_databases: z.tuple([
      z
        .object({
          binding: z.literal('DB'),
          database_name: z.literal('leftout-reporting-placeholder'),
          database_id: z.literal('00000000-0000-4000-8000-000000000000'),
          migrations_dir: z.literal('../../drizzle'),
        })
        .strict(),
    ]),
    observability: z.object({ enabled: z.literal(true) }).strict(),
    send_metrics: z.literal(false),
  })
  .strict();

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate values.`);
  }
}

function repositoryPath(value: string) {
  if (
    value.includes('..') ||
    value.startsWith('/') ||
    /^[a-z]:/iu.test(value) ||
    value.includes('\\')
  ) {
    throw new Error(`Reporting evidence path is unsafe: ${value}`);
  }
  return resolve(value);
}

async function regularFile(path: string) {
  try {
    const details = await lstat(path);
    return details.isFile() && !details.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function assessReportingRelease(
  options: {
    configPath?: string;
    evidencePath?: string;
    outputPath?: string | null;
  } = {},
) {
  const configPath = resolve(
    options.configPath ??
      'products/reporting-worker/wrangler.disabled.example.json',
  );
  const evidencePath = resolve(
    options.evidencePath ?? 'products/reporting-worker/release-evidence.json',
  );
  const [configBytes, evidenceBytes] = await Promise.all([
    readFile(configPath),
    readFile(evidencePath),
  ]);
  const config = disabledWranglerSchema.parse(
    JSON.parse(Buffer.from(configBytes).toString('utf8')),
  );
  const evidence = releaseEvidenceSchema.parse(
    JSON.parse(Buffer.from(evidenceBytes).toString('utf8')),
  );

  const ids = evidence.gates.map((gate) => gate.id);
  unique(ids, 'Reporting release gates');
  if (
    ids.length !== REQUIRED_GATE_IDS.length ||
    ids.some((id, index) => id !== REQUIRED_GATE_IDS[index])
  ) {
    throw new Error('Reporting release gates do not match the required set.');
  }

  for (const gate of evidence.gates) {
    if (gate.status === 'missing' && gate.evidence.length !== 0) {
      throw new Error(
        `Missing reporting gate ${gate.id} may not cite completion evidence.`,
      );
    }
    if (gate.status !== 'missing' && gate.evidence.length === 0) {
      throw new Error(
        `Reporting gate ${gate.id} requires inspectable evidence.`,
      );
    }
    for (const path of gate.evidence) {
      if (!(await regularFile(repositoryPath(path)))) {
        throw new Error(`Reporting gate evidence is missing: ${path}`);
      }
    }
  }

  const blockers = evidence.gates
    .filter((gate) => gate.status !== 'verified')
    .map((gate) => gate.id);
  const sourceReady =
    evidence.releaseChannel === 'disabled_source_preview' &&
    config.vars.LEFTOUT_REPORTING_MODE === 'disabled' &&
    config.workers_dev === false &&
    blockers.length > 0;
  const operationalReleaseReady =
    evidence.releaseChannel === 'production_candidate' && blockers.length === 0;

  const sourcePaths = [
    configPath,
    evidencePath,
    ...evidence.gates.flatMap((gate) =>
      gate.evidence.map((path) => repositoryPath(path)),
    ),
  ];
  const deduplicated = [...new Set(sourcePaths)];
  const sourceDigests = await Promise.all(
    deduplicated.map(async (path) => ({
      file: relative(process.cwd(), path).replaceAll('\\', '/'),
      sha256: sha256(await readFile(path)),
    })),
  );
  const report = Object.freeze({
    schemaVersion: 'leftout.reporting-readiness-report/1' as const,
    evidenceDate: evidence.evidenceDate,
    releaseChannel: evidence.releaseChannel,
    sourceReady,
    operationalReleaseReady,
    blockers: Object.freeze(blockers),
    gates: Object.freeze(evidence.gates),
    sourceDigests: Object.freeze(sourceDigests),
    claims: Object.freeze({
      standaloneWorkerSource: true as const,
      browserAssetsServed: false as const,
      reportingMode: 'disabled' as const,
      productionDatabaseBound: false as const,
      publicHostnameConfigured: false as const,
      externalIntakeEnabled: false as const,
    }),
  });

  const outputPath =
    options.outputPath === undefined
      ? resolve('outputs/reporting-worker/readiness.json')
      : options.outputPath === null
        ? null
        : resolve(options.outputPath);
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return { report, outputPath };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const result = await assessReportingRelease();
  console.log(`Reporting source ready: ${result.report.sourceReady}`);
  console.log(
    `Operational release ready: ${result.report.operationalReleaseReady}`,
  );
  console.log(`Open gates: ${result.report.blockers.join(', ') || 'none'}`);
  if (result.outputPath) console.log(`Readiness report: ${result.outputPath}`);
  if (
    process.argv.includes('--require-operational-release') &&
    !result.report.operationalReleaseReady
  ) {
    throw new Error('Reporting operational release gate is not satisfied.');
  }
}
