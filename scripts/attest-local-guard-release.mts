import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLocalGuardPackage } from './package-local-guard.mts';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export const LOCAL_GUARD_ATTESTATION_SCHEMA_VERSION =
  'leftout.local-guard-release-attestation/1' as const;

export interface LocalGuardReleaseAttestation {
  schemaVersion: typeof LOCAL_GUARD_ATTESTATION_SCHEMA_VERSION;
  algorithm: 'Ed25519';
  scope: 'release-integrity-attestation';
  releaseManifest: Readonly<{
    file: string;
    sha256: string;
  }>;
  archive: Readonly<{
    file: string;
    sha256: string;
    size: number;
  }>;
  signer: Readonly<{
    publicKeySpkiBase64: string;
    publicKeySpkiSha256: string;
  }>;
  signatureBase64: string;
  claims: Readonly<{
    archiveIntegrity: true;
    chromePublisherIdentity: false;
    chromeWebStoreSigned: false;
  }>;
}

interface ParsedReleaseManifest {
  archive: {
    file: string;
    sha256: string;
    size: number;
  };
}

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Reflect.ownKeys(value);
  if (
    actual.some((key) => typeof key !== 'string') ||
    actual.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} fields do not match the release contract.`);
  }
}

function safeFilename(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 160 ||
    basename(value) !== value ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(`${label} must be a bounded filename.`);
  }
  return value;
}

function digest(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function positiveSize(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function parseReleaseManifest(value: unknown): ParsedReleaseManifest {
  if (!isRecord(value)) {
    throw new Error('Local Guard release manifest must be an object.');
  }
  if (value.schemaVersion !== 'leftout.local-guard-release/1') {
    throw new Error('Unsupported Local Guard release manifest schema.');
  }
  if (!isRecord(value.archive)) {
    throw new Error('Local Guard release archive metadata is required.');
  }
  exactKeys(value.archive, ['file', 'sha256', 'size'], 'Archive metadata');
  return {
    archive: {
      file: safeFilename(value.archive.file, 'Archive file'),
      sha256: digest(value.archive.sha256, 'Archive digest'),
      size: positiveSize(value.archive.size, 'Archive size'),
    },
  };
}

function parseAttestation(value: unknown): LocalGuardReleaseAttestation {
  if (!isRecord(value)) {
    throw new Error('Local Guard release attestation must be an object.');
  }
  exactKeys(
    value,
    [
      'schemaVersion',
      'algorithm',
      'scope',
      'releaseManifest',
      'archive',
      'signer',
      'signatureBase64',
      'claims',
    ],
    'Release attestation',
  );
  if (
    value.schemaVersion !== LOCAL_GUARD_ATTESTATION_SCHEMA_VERSION ||
    value.algorithm !== 'Ed25519' ||
    value.scope !== 'release-integrity-attestation'
  ) {
    throw new Error('Unsupported Local Guard release attestation contract.');
  }
  if (
    !isRecord(value.releaseManifest) ||
    !isRecord(value.archive) ||
    !isRecord(value.signer) ||
    !isRecord(value.claims)
  ) {
    throw new Error('Local Guard release attestation metadata is incomplete.');
  }
  exactKeys(
    value.releaseManifest,
    ['file', 'sha256'],
    'Release manifest attestation',
  );
  exactKeys(value.archive, ['file', 'sha256', 'size'], 'Archive attestation');
  exactKeys(
    value.signer,
    ['publicKeySpkiBase64', 'publicKeySpkiSha256'],
    'Signer attestation',
  );
  exactKeys(
    value.claims,
    ['archiveIntegrity', 'chromePublisherIdentity', 'chromeWebStoreSigned'],
    'Attestation claims',
  );
  if (
    value.claims.archiveIntegrity !== true ||
    value.claims.chromePublisherIdentity !== false ||
    value.claims.chromeWebStoreSigned !== false
  ) {
    throw new Error(
      'Local Guard release attestation overstates its authority.',
    );
  }
  if (
    typeof value.signer.publicKeySpkiBase64 !== 'string' ||
    !BASE64_PATTERN.test(value.signer.publicKeySpkiBase64) ||
    typeof value.signatureBase64 !== 'string' ||
    !BASE64_PATTERN.test(value.signatureBase64)
  ) {
    throw new Error('Attestation key or signature encoding is invalid.');
  }
  return value as unknown as LocalGuardReleaseAttestation;
}

function signaturePayload(
  releaseManifestSha256: string,
  archiveSha256: string,
  archiveSize: number,
) {
  return Buffer.from(
    [
      LOCAL_GUARD_ATTESTATION_SCHEMA_VERSION,
      `release-manifest-sha256:${releaseManifestSha256}`,
      `archive-sha256:${archiveSha256}`,
      `archive-size:${archiveSize}`,
      '',
    ].join('\n'),
    'utf8',
  );
}

export async function attestLocalGuardRelease(options: {
  archivePath: string;
  extensionDirectory?: string;
  privateKeyPem: string | Buffer;
  releaseManifestPath: string;
  outputPath?: string;
}) {
  const archivePath = resolve(options.archivePath);
  const releaseManifestPath = resolve(options.releaseManifestPath);
  const [archiveBytes, releaseManifestBytes] = await Promise.all([
    readFile(archivePath),
    readFile(releaseManifestPath),
  ]);
  const releaseManifest = parseReleaseManifest(
    JSON.parse(Buffer.from(releaseManifestBytes).toString('utf8')) as unknown,
  );
  if (basename(archivePath) !== releaseManifest.archive.file) {
    throw new Error('Selected archive does not match the release manifest.');
  }
  const archiveSha256 = sha256(archiveBytes);
  if (
    archiveSha256 !== releaseManifest.archive.sha256 ||
    archiveBytes.length !== releaseManifest.archive.size
  ) {
    throw new Error('Local Guard archive integrity verification failed.');
  }

  const reproductionDirectory = await mkdtemp(
    join(tmpdir(), 'leftout-guard-signing-reproduction-'),
  );
  try {
    const reproduced = await createLocalGuardPackage({
      extensionDirectory: resolve(
        options.extensionDirectory ?? 'products/extension',
      ),
      outputDirectory: reproductionDirectory,
    });
    const [reproducedArchive, reproducedManifest] = await Promise.all([
      readFile(reproduced.archivePath),
      readFile(reproduced.releasePath),
    ]);
    if (
      !Buffer.from(reproducedArchive).equals(Buffer.from(archiveBytes)) ||
      !Buffer.from(reproducedManifest).equals(Buffer.from(releaseManifestBytes))
    ) {
      throw new Error(
        'Local Guard release does not reproduce from the reviewed extension source.',
      );
    }
  } finally {
    await rm(reproductionDirectory, { recursive: true, force: true });
  }

  const privateKey = createPrivateKey(options.privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Local Guard release attestations require an Ed25519 key.');
  }
  const publicKey = createPublicKey(privateKey);
  const publicKeyDer = Buffer.from(
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const releaseManifestSha256 = sha256(releaseManifestBytes);
  const payload = signaturePayload(
    releaseManifestSha256,
    archiveSha256,
    archiveBytes.length,
  );
  const signature = sign(null, payload, privateKey);
  const attestation: LocalGuardReleaseAttestation = Object.freeze({
    schemaVersion: LOCAL_GUARD_ATTESTATION_SCHEMA_VERSION,
    algorithm: 'Ed25519' as const,
    scope: 'release-integrity-attestation' as const,
    releaseManifest: Object.freeze({
      file: basename(releaseManifestPath),
      sha256: releaseManifestSha256,
    }),
    archive: Object.freeze({
      file: basename(archivePath),
      sha256: archiveSha256,
      size: archiveBytes.length,
    }),
    signer: Object.freeze({
      publicKeySpkiBase64: publicKeyDer.toString('base64'),
      publicKeySpkiSha256: sha256(publicKeyDer),
    }),
    signatureBase64: Buffer.from(signature).toString('base64'),
    claims: Object.freeze({
      archiveIntegrity: true as const,
      chromePublisherIdentity: false as const,
      chromeWebStoreSigned: false as const,
    }),
  });
  const outputPath = resolve(
    options.outputPath ??
      join(
        dirname(releaseManifestPath),
        `${basename(releaseManifestPath, '.release.json')}.attestation.json`,
      ),
  );
  await writeFile(outputPath, `${JSON.stringify(attestation, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return { attestation, outputPath };
}

export async function verifyLocalGuardReleaseAttestation(options: {
  archivePath: string;
  attestationPath: string;
  releaseManifestPath: string;
  trustedPublicKeyPem: string | Buffer;
}) {
  const [archiveBytes, releaseManifestBytes, attestationBytes] =
    await Promise.all([
      readFile(resolve(options.archivePath)),
      readFile(resolve(options.releaseManifestPath)),
      readFile(resolve(options.attestationPath)),
    ]);
  const releaseManifest = parseReleaseManifest(
    JSON.parse(Buffer.from(releaseManifestBytes).toString('utf8')) as unknown,
  );
  const attestation = parseAttestation(
    JSON.parse(Buffer.from(attestationBytes).toString('utf8')) as unknown,
  );
  const trustedPublicKey = createPublicKey(options.trustedPublicKeyPem);
  if (trustedPublicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Trusted Local Guard release key must use Ed25519.');
  }
  const trustedKeyDer = Buffer.from(
    trustedPublicKey.export({ type: 'spki', format: 'der' }),
  );
  const trustedKeySha256 = sha256(trustedKeyDer);
  const releaseManifestSha256 = sha256(releaseManifestBytes);
  const archiveSha256 = sha256(archiveBytes);

  if (
    attestation.signer.publicKeySpkiSha256 !== trustedKeySha256 ||
    attestation.signer.publicKeySpkiBase64 !== trustedKeyDer.toString('base64')
  ) {
    throw new Error(
      'Attestation signer does not match the trusted release key.',
    );
  }
  if (
    attestation.releaseManifest.file !==
      basename(options.releaseManifestPath) ||
    attestation.releaseManifest.sha256 !== releaseManifestSha256 ||
    attestation.archive.file !== basename(options.archivePath) ||
    attestation.archive.file !== releaseManifest.archive.file ||
    attestation.archive.sha256 !== archiveSha256 ||
    attestation.archive.sha256 !== releaseManifest.archive.sha256 ||
    attestation.archive.size !== archiveBytes.length ||
    attestation.archive.size !== releaseManifest.archive.size
  ) {
    throw new Error('Attested Local Guard release bytes do not match.');
  }
  const payload = signaturePayload(
    releaseManifestSha256,
    archiveSha256,
    archiveBytes.length,
  );
  if (
    !verify(
      null,
      payload,
      trustedPublicKey,
      Buffer.from(attestation.signatureBase64, 'base64'),
    )
  ) {
    throw new Error('Local Guard release signature verification failed.');
  }
  return Object.freeze({
    verified: true as const,
    archiveSha256,
    releaseManifestSha256,
    trustedPublicKeySpkiSha256: trustedKeySha256,
  });
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Required argument missing: ${name}`);
  }
  return process.argv[index + 1];
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const mode = process.argv[2];
  if (mode === 'sign') {
    const result = await attestLocalGuardRelease({
      archivePath: argument('--archive'),
      releaseManifestPath: argument('--release'),
      privateKeyPem: await readFile(resolve(argument('--private-key'))),
      ...(process.argv.includes('--extension')
        ? { extensionDirectory: argument('--extension') }
        : {}),
      ...(process.argv.includes('--output')
        ? { outputPath: argument('--output') }
        : {}),
    });
    console.log(`Release attestation: ${result.outputPath}`);
    console.log(
      `Release key fingerprint: ${result.attestation.signer.publicKeySpkiSha256}`,
    );
  } else if (mode === 'verify') {
    const result = await verifyLocalGuardReleaseAttestation({
      archivePath: argument('--archive'),
      releaseManifestPath: argument('--release'),
      attestationPath: argument('--attestation'),
      trustedPublicKeyPem: await readFile(
        resolve(argument('--trusted-public-key')),
      ),
    });
    console.log(`Verified archive SHA-256: ${result.archiveSha256}`);
    console.log(
      `Trusted release key fingerprint: ${result.trustedPublicKeySpkiSha256}`,
    );
  } else {
    throw new Error('Use the sign or verify command.');
  }
}
