import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { createRoutableDisabledReportingCandidate } from '../products/reporting-worker/candidate';

const MAX_INPUT_BYTES = 32 * 1024;

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}

function parseInputPath(arguments_: readonly string[]) {
  if (arguments_.length !== 2 || arguments_[0] !== '--input') {
    throw new Error(
      'Usage: npm run reporting:candidate -- --input <nonsecret-handoff.json>',
    );
  }
  return resolve(arguments_[1]);
}

async function readRegularFile(path: string, maximumBytes?: number) {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(
      `Candidate input must be a regular non-symlink file: ${path}`,
    );
  }
  if (maximumBytes !== undefined && details.size > maximumBytes) {
    throw new Error('Reporting candidate input exceeds its byte boundary.');
  }
  return readFile(path);
}

const inputPath = parseInputPath(process.argv.slice(2));
const [inputBytes, releaseEvidenceBytes, workerSourceBytes, migrationNames] =
  await Promise.all([
    readRegularFile(inputPath, MAX_INPUT_BYTES),
    readRegularFile(resolve('products/reporting-worker/release-evidence.json')),
    readRegularFile(resolve('products/reporting-worker/worker.ts')),
    readdir(resolve('drizzle')),
  ]);

let input: unknown;
try {
  input = JSON.parse(Buffer.from(inputBytes).toString('utf8')) as unknown;
} catch {
  throw new Error('Reporting candidate input must be valid JSON.');
}

const migrationFiles = migrationNames
  .filter((name) => name.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right));
if (migrationFiles.length === 0) {
  throw new Error('Reporting candidate requires at least one D1 migration.');
}
const migrationDigests = await Promise.all(
  migrationFiles.map(async (name) => ({
    name,
    sha256: sha256(await readRegularFile(resolve('drizzle', name))),
  })),
);
const migrationSetSha256 = sha256(
  `${migrationDigests.map((entry) => `${entry.name}:${entry.sha256}`).join('\n')}\n`,
);
const candidate = createRoutableDisabledReportingCandidate(input, {
  releaseEvidenceSha256: sha256(releaseEvidenceBytes),
  workerSourceSha256: sha256(workerSourceBytes),
  migrationSetSha256,
});
const directoryName = `${candidate.manifest.candidateDate}-${candidate.manifest.workerName}`;
const candidateRoot = resolve(
  'outputs/reporting-worker/routable-disabled-candidates',
);
const outputDirectory = resolve(candidateRoot, directoryName);
await mkdir(candidateRoot, { recursive: true });
await mkdir(outputDirectory, { recursive: false });
await Promise.all([
  writeFile(
    join(outputDirectory, 'wrangler.json'),
    candidate.configurationBytes,
    { encoding: 'utf8', flag: 'wx' },
  ),
  writeFile(
    join(outputDirectory, 'candidate-manifest.json'),
    candidate.manifestBytes,
    { encoding: 'utf8', flag: 'wx' },
  ),
  writeFile(
    join(outputDirectory, 'migration-digests.json'),
    `${JSON.stringify(migrationDigests, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  ),
]);

console.log(`Routable disabled candidate: ${outputDirectory}`);
console.log(`Input file: ${basename(inputPath)}`);
console.log('Reporting mode: disabled');
console.log('Cloudflare resources changed: none');
