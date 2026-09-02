import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOCAL_GUARD_RUNTIME_FILES = Object.freeze([
  'background.js',
  'content-script.js',
  'hud-model.js',
  'lesson-policy.js',
  'manifest.json',
  'policy-validation.js',
  'popup.css',
  'popup.html',
  'popup.js',
  'validation.js',
]);

const EXPECTED_PERMISSIONS = ['activeTab', 'scripting', 'storage'];
const EXPECTED_HOST_PERMISSIONS = [
  'http://127.0.0.1:8788/*',
  'http://localhost:8788/*',
  'http://127.0.0.1:48788/*',
  'http://localhost:48788/*',
];
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_VERSION = 20;
const ZIP_UNIX_VERSION = 0x0314;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;

export interface LocalGuardReleaseManifest {
  schemaVersion: 'leftout.local-guard-release/1';
  name: string;
  version: string;
  archive: Readonly<{ file: string; sha256: string; size: number }>;
  files: readonly Readonly<{
    path: string;
    sha256: string;
    size: number;
  }>[];
  security: Readonly<{
    manifestVersion: 3;
    permissions: readonly string[];
    hostPermissions: readonly string[];
    remoteCode: false;
  }>;
}

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function crc32(value: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sameStrings(left: unknown, right: readonly string[]) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validateManifest(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Local Guard manifest must be an object.');
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.manifest_version !== 3) {
    throw new Error('Local Guard packaging requires Manifest V3.');
  }
  if (!sameStrings(manifest.permissions, EXPECTED_PERMISSIONS)) {
    throw new Error(
      'Local Guard permissions differ from the release allowlist.',
    );
  }
  if (!sameStrings(manifest.host_permissions, EXPECTED_HOST_PERMISSIONS)) {
    throw new Error(
      'Local Guard host permissions differ from the exact loopback allowlist.',
    );
  }
  const background = manifest.background as Record<string, unknown> | undefined;
  if (
    background?.service_worker !== 'background.js' ||
    background.type !== 'module'
  ) {
    throw new Error('Local Guard must use the reviewed module service worker.');
  }
  const action = manifest.action as Record<string, unknown> | undefined;
  if (action?.default_popup !== 'popup.html') {
    throw new Error('Local Guard must use the reviewed local popup.');
  }
  if (
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/u.test(manifest.version)
  ) {
    throw new Error(
      'Local Guard name and semantic extension version are required.',
    );
  }
  return {
    name: manifest.name,
    version: manifest.version,
  };
}

function validateLocalPopupReferences(html: string) {
  const references = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/giu),
  ].map((match) => match[1]);
  if (
    references.length !== 2 ||
    !references.includes('popup.css') ||
    !references.includes('popup.js') ||
    references.some((value) => /^(?:[a-z]+:|\/\/|\/)/iu.test(value))
  ) {
    throw new Error(
      'Local Guard popup may reference only its local CSS and module.',
    );
  }
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/iu.test(html)) {
    throw new Error('Local Guard popup must not contain inline script.');
  }
}

function deterministicZip(
  files: readonly Readonly<{ path: string; bytes: Buffer }>[],
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const checksum = crc32(file.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(ZIP_VERSION, 4);
    local.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.bytes.length, 18);
    local.writeUInt32LE(file.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(ZIP_UNIX_VERSION, 4);
    central.writeUInt16LE(ZIP_VERSION, 6);
    central.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.bytes.length, 20);
    central.writeUInt32LE(file.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + file.bytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function createLocalGuardPackage(
  options: {
    extensionDirectory?: string;
    outputDirectory?: string;
  } = {},
) {
  const extensionDirectory = resolve(
    options.extensionDirectory ?? 'products/extension',
  );
  const outputDirectory = resolve(
    options.outputDirectory ?? 'outputs/local-guard',
  );
  const files = await Promise.all(
    LOCAL_GUARD_RUNTIME_FILES.map(async (path) => {
      const sourcePath = join(extensionDirectory, path);
      const details = await lstat(sourcePath);
      if (!details.isFile() || details.isSymbolicLink()) {
        throw new Error(
          `Local Guard release input must be a regular file: ${path}.`,
        );
      }
      return { path, bytes: await readFile(sourcePath) };
    }),
  );
  files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );

  const manifestFile = files.find((file) => file.path === 'manifest.json');
  const popupFile = files.find((file) => file.path === 'popup.html');
  if (!manifestFile || !popupFile) {
    throw new Error('Local Guard release inputs are incomplete.');
  }
  const identity = validateManifest(
    JSON.parse(Buffer.from(manifestFile.bytes).toString('utf8')) as unknown,
  );
  validateLocalPopupReferences(Buffer.from(popupFile.bytes).toString('utf8'));
  for (const file of files.filter((item) => item.path.endsWith('.js'))) {
    if (
      /\beval\s*\(|\bnew\s+Function\b|\bimportScripts\s*\(/u.test(
        Buffer.from(file.bytes).toString('utf8'),
      )
    ) {
      throw new Error(
        `Local Guard release input uses disallowed dynamic code: ${file.path}.`,
      );
    }
  }

  const archive = deterministicZip(files);
  const archiveName = `leftout-local-guard-${identity.version}.zip`;
  const releaseName = `leftout-local-guard-${identity.version}.release.json`;
  const release: LocalGuardReleaseManifest = Object.freeze({
    schemaVersion: 'leftout.local-guard-release/1',
    name: identity.name,
    version: identity.version,
    archive: Object.freeze({
      file: archiveName,
      sha256: sha256(archive),
      size: archive.length,
    }),
    files: Object.freeze(
      files.map((file) =>
        Object.freeze({
          path: file.path,
          sha256: sha256(file.bytes),
          size: file.bytes.length,
        }),
      ),
    ),
    security: Object.freeze({
      manifestVersion: 3 as const,
      permissions: Object.freeze([...EXPECTED_PERMISSIONS]),
      hostPermissions: Object.freeze([...EXPECTED_HOST_PERMISSIONS]),
      remoteCode: false as const,
    }),
  });

  await mkdir(outputDirectory, { recursive: true });
  const archivePath = join(outputDirectory, archiveName);
  const releasePath = join(outputDirectory, releaseName);
  const sumsPath = join(outputDirectory, 'SHA256SUMS.txt');
  await Promise.all([
    writeFile(archivePath, archive),
    writeFile(releasePath, `${JSON.stringify(release, null, 2)}\n`, 'utf8'),
    writeFile(
      sumsPath,
      `${release.archive.sha256}  ${basename(archivePath)}\n`,
      'utf8',
    ),
  ]);
  return { archivePath, releasePath, sumsPath, release };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const result = await createLocalGuardPackage();
  console.log(`Local Guard package: ${result.archivePath}`);
  console.log(`Release manifest: ${result.releasePath}`);
  console.log(`SHA-256: ${result.release.archive.sha256}`);
}
