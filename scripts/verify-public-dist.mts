import { timingSafeEqual } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, extname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_FILE_COUNT = 2_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

const ALLOWED_ROOTS = new Set(['.openai', 'client', 'server']);
const CLIENT_EXTENSIONS = new Set([
  '.avif',
  '.css',
  '.ico',
  '.js',
  '.json',
  '.png',
  '.svg',
  '.txt',
  '.webmanifest',
  '.webp',
  '.woff2',
  '.xml',
]);
const CLIENT_SPECIAL_FILES = new Set(['.assetsignore', '_headers']);
const SERVER_EXTENSIONS = new Set(['.css', '.js', '.json', '.mjs']);
const SERVER_SPECIAL_FILES = new Set(['BUILD_ID']);
const ALLOWED_WRANGLER_KEYS = new Set([
  'agent_memory',
  'ai_search',
  'ai_search_namespaces',
  'analytics_engine_datasets',
  'artifacts',
  'assets',
  'build',
  'cloudchamber',
  'compatibility_date',
  'compatibility_flags',
  'connect',
  'd1_databases',
  'define',
  'dev',
  'dispatch_namespaces',
  'durable_objects',
  'exports',
  'flagship',
  'hyperdrive',
  'jsx_factory',
  'jsx_fragment',
  'kv_namespaces',
  'logfwdr',
  'main',
  'migrations',
  'mtls_certificates',
  'name',
  'no_bundle',
  'observability',
  'pipelines',
  'python_modules',
  'queues',
  'r2_buckets',
  'ratelimits',
  'rules',
  'secrets_store_secrets',
  'send_email',
  'services',
  'topLevelName',
  'triggers',
  'unsafe_hello_world',
  'vars',
  'vectorize',
  'vpc_networks',
  'vpc_services',
  'worker_loaders',
  'workflows',
]);
const FORBIDDEN_PATH_SEGMENTS = new Set([
  '.env',
  '.git',
  'docs',
  'fixtures',
  'node_modules',
  'products',
  'scripts',
  'tests',
]);
const REQUIRED_ASSET_IGNORES = new Set(['.dev.vars', '.vite', 'wrangler.json']);

const SECRET_PATTERNS = [
  {
    label: 'private key material',
    pattern: /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/u,
  },
  {
    label: 'OpenAI API key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    label: 'GitHub access token',
    pattern: /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
  },
  {
    label: 'AWS access key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/u,
  },
  {
    label: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/u,
  },
] as const;

const RETIRED_PUBLIC_SURFACE_PATTERNS = [
  {
    label: 'retired public receipt API',
    pattern: /\/api\/evidence\b/u,
  },
  {
    label: 'retired public receipt writer',
    pattern: /appendEvidenceReceipt/u,
  },
] as const;

type FileRecord = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

export type PublicDistVerification = {
  fileCount: number;
  totalBytes: number;
  migrationFileCount: number;
  roots: string[];
  assertions: string[];
};

function slashPath(value: string) {
  return value.split(sep).join('/');
}

function fail(message: string): never {
  throw new Error(`Public dist verification failed: ${message}`);
}

async function requireDirectory(path: string, label: string) {
  let details;
  try {
    details = await lstat(path);
  } catch {
    fail(`${label} is missing.`);
  }
  if (!details.isDirectory() || details.isSymbolicLink()) {
    fail(`${label} must be a real directory, not a link.`);
  }
}

async function collectFiles(root: string): Promise<FileRecord[]> {
  await requireDirectory(root, slashPath(root));
  const files: FileRecord[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const details = await lstat(absolutePath);
      const relativePath = slashPath(relative(root, absolutePath));
      if (details.isSymbolicLink()) {
        fail(`symbolic links are forbidden (${relativePath}).`);
      }
      if (details.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!details.isFile()) {
        fail(`non-file artifact is forbidden (${relativePath}).`);
      }
      files.push({ absolutePath, relativePath, size: details.size });
    }
  }

  await visit(root);
  return files;
}

function forbiddenRepositoryName(path: string) {
  const name = basename(path);
  return (
    /^AGENTS\.md$/iu.test(name) ||
    /^README(?:\..+)?$/iu.test(name) ||
    /^SECURITY\.md$/iu.test(name) ||
    /^package(?:-lock)?\.json$/iu.test(name) ||
    /^pnpm-lock\.yaml$/iu.test(name) ||
    /^yarn\.lock$/iu.test(name) ||
    /^tsconfig(?:\..+)?\.json$/iu.test(name)
  );
}

function isTextArtifact(path: string) {
  return (
    [
      '.css',
      '.js',
      '.json',
      '.mjs',
      '.sql',
      '.svg',
      '.txt',
      '.webmanifest',
      '.xml',
    ].includes(extname(path).toLowerCase()) ||
    CLIENT_SPECIAL_FILES.has(basename(path)) ||
    SERVER_SPECIAL_FILES.has(basename(path))
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

async function verifyCopiedTree(options: {
  distRoot: string;
  sourceRoot: string;
  distPrefix: string;
  sourceDirectory: string;
}) {
  const sourceDirectory = resolve(options.sourceRoot, options.sourceDirectory);
  const deployedDirectory = resolve(options.distRoot, options.distPrefix);
  const [sourceFiles, deployedFiles] = await Promise.all([
    collectFiles(sourceDirectory),
    collectFiles(deployedDirectory),
  ]);
  const sourcePaths = sourceFiles.map((file) => file.relativePath);
  const deployedPaths = deployedFiles.map((file) => file.relativePath);
  if (JSON.stringify(sourcePaths) !== JSON.stringify(deployedPaths)) {
    fail(
      `${options.distPrefix} does not exactly mirror ${options.sourceDirectory}.`,
    );
  }
  await Promise.all(
    sourceFiles.map(async (sourceFile, index) => {
      const deployedFile = deployedFiles[index];
      const [sourceBytes, deployedBytes] = await Promise.all([
        readFile(sourceFile.absolutePath),
        readFile(deployedFile.absolutePath),
      ]);
      if (!equalBytes(sourceBytes, deployedBytes)) {
        fail(
          `${options.distPrefix}/${sourceFile.relativePath} differs from its reviewed source.`,
        );
      }
    }),
  );
  return deployedFiles.length;
}

function assertEmptyArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value !== undefined && (!Array.isArray(value) || value.length !== 0)) {
    fail(`server/wrangler.json grants unexpected ${key} authority.`);
  }
}

function assertEmptyObject(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (
    value !== undefined &&
    (!value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 0)
  ) {
    fail(`server/wrangler.json grants unexpected ${key} authority.`);
  }
}

function assertEmptyObjectArray(
  record: Record<string, unknown>,
  key: string,
  nestedKeys: readonly string[],
) {
  const value = record[key];
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`server/wrangler.json has malformed ${key} configuration.`);
  }
  const nested = value as Record<string, unknown>;
  if (
    Object.keys(nested).some((nestedKey) => !nestedKeys.includes(nestedKey)) ||
    Object.values(nested).some(
      (nestedValue) => !Array.isArray(nestedValue) || nestedValue.length !== 0,
    )
  ) {
    fail(`server/wrangler.json grants unexpected ${key} authority.`);
  }
}

async function verifyWranglerConfig(path: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail('server/wrangler.json is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('server/wrangler.json must be a JSON object.');
  }
  const config = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(config).filter(
    (key) => !ALLOWED_WRANGLER_KEYS.has(key),
  );
  if (unknownKeys.length > 0) {
    fail(
      `server/wrangler.json contains unreviewed keys: ${unknownKeys.sort().join(', ')}.`,
    );
  }
  if (config.main !== 'index.js') {
    fail('server/wrangler.json must use index.js as its entry point.');
  }
  const assets = config.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    fail(
      'server/wrangler.json must declare the generated client assets directory.',
    );
  }
  const assetConfig = assets as Record<string, unknown>;
  if (
    assetConfig.directory !== '../client' ||
    Object.keys(assetConfig).some((key) => key !== 'directory')
  ) {
    fail('server/wrangler.json may serve only ../client assets.');
  }
  if (
    !config.vars ||
    typeof config.vars !== 'object' ||
    Array.isArray(config.vars) ||
    Object.keys(config.vars).length !== 0
  ) {
    fail('server/wrangler.json must not embed environment variables.');
  }
  for (const key of [
    'agent_memory',
    'ai_search',
    'ai_search_namespaces',
    'analytics_engine_datasets',
    'artifacts',
    'connect',
    'dispatch_namespaces',
    'flagship',
    'hyperdrive',
    'kv_namespaces',
    'mtls_certificates',
    'migrations',
    'pipelines',
    'r2_buckets',
    'ratelimits',
    'secrets_store_secrets',
    'send_email',
    'services',
    'unsafe_hello_world',
    'vectorize',
    'vpc_networks',
    'vpc_services',
    'worker_loaders',
    'workflows',
  ]) {
    assertEmptyArray(config, key);
  }
  for (const key of ['cloudchamber', 'define', 'exports', 'triggers']) {
    assertEmptyObject(config, key);
  }
  assertEmptyObjectArray(config, 'durable_objects', ['bindings']);
  assertEmptyObjectArray(config, 'logfwdr', ['bindings']);
  assertEmptyObjectArray(config, 'queues', ['consumers', 'producers']);
  const databases = config.d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1) {
    fail('server/wrangler.json must declare exactly the generated DB binding.');
  }
  const database = databases[0] as Record<string, unknown>;
  if (
    !database ||
    typeof database !== 'object' ||
    database.binding !== 'DB' ||
    database.database_name !== 'site-creator-d1' ||
    database.database_id !== '00000000-0000-4000-8000-000000000000' ||
    database.migrations_dir !== '../../migrations' ||
    Object.keys(database).some(
      (key) =>
        !['binding', 'database_id', 'database_name', 'migrations_dir'].includes(
          key,
        ),
    )
  ) {
    fail(
      'server/wrangler.json contains an unexpected D1 binding or deploy-time identifier.',
    );
  }
  if (config.name !== undefined && config.name !== 'webmcp-security-lab') {
    fail('server/wrangler.json contains an unexpected Worker name.');
  }
  if (
    config.compatibility_flags !== undefined &&
    JSON.stringify(config.compatibility_flags) !==
      JSON.stringify(['nodejs_compat'])
  ) {
    fail('server/wrangler.json contains unreviewed compatibility flags.');
  }
  for (const forbiddenKey of [
    'account_id',
    'route',
    'routes',
    'token',
    'zone_id',
  ]) {
    if (forbiddenKey in config) {
      fail(`server/wrangler.json must not contain ${forbiddenKey}.`);
    }
  }
}

export async function verifyPublicDist(
  options: { distRoot?: string; sourceRoot?: string } = {},
): Promise<PublicDistVerification> {
  const sourceRoot = resolve(options.sourceRoot ?? '.');
  const distRoot = resolve(options.distRoot ?? resolve(sourceRoot, 'dist'));
  const files = await collectFiles(distRoot);
  if (files.length === 0) fail('dist is empty.');
  if (files.length > MAX_FILE_COUNT)
    fail(`dist contains ${files.length} files; limit is ${MAX_FILE_COUNT}.`);

  const roots = [
    ...new Set(files.map((file) => file.relativePath.split('/')[0])),
  ].sort();
  if (
    roots.some((root) => !ALLOWED_ROOTS.has(root)) ||
    roots.length !== ALLOWED_ROOTS.size
  ) {
    fail(
      `dist roots must be exactly ${[...ALLOWED_ROOTS].join(', ')}; found ${roots.join(', ')}.`,
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > MAX_FILE_BYTES) {
      fail(
        `${file.relativePath} is ${file.size} bytes; per-file limit is ${MAX_FILE_BYTES}.`,
      );
    }
    const segments = file.relativePath.split('/');
    if (
      segments.some((segment) =>
        FORBIDDEN_PATH_SEGMENTS.has(segment.toLowerCase()),
      )
    ) {
      fail(`repository-only path is forbidden (${file.relativePath}).`);
    }
    if (forbiddenRepositoryName(file.relativePath)) {
      fail(`repository-only file is forbidden (${file.relativePath}).`);
    }
    if (
      /\.map$/iu.test(file.relativePath) ||
      /\.(?:mts|ts|tsx)$/iu.test(file.relativePath)
    ) {
      fail(
        `source or source-map artifact is forbidden (${file.relativePath}).`,
      );
    }

    const root = segments[0];
    const name = basename(file.relativePath);
    const extension = extname(name).toLowerCase();
    if (
      root === 'client' &&
      !CLIENT_SPECIAL_FILES.has(name) &&
      !CLIENT_EXTENSIONS.has(extension)
    ) {
      fail(`client artifact type is not allowlisted (${file.relativePath}).`);
    }
    if (
      root === 'server' &&
      !SERVER_SPECIAL_FILES.has(name) &&
      !SERVER_EXTENSIONS.has(extension)
    ) {
      fail(`server artifact type is not allowlisted (${file.relativePath}).`);
    }
    if (isTextArtifact(file.relativePath)) {
      const contents = await readFile(file.absolutePath, 'utf8');
      for (const candidate of SECRET_PATTERNS) {
        if (candidate.pattern.test(contents)) {
          fail(`${candidate.label} appears in ${file.relativePath}.`);
        }
      }
      for (const candidate of RETIRED_PUBLIC_SURFACE_PATTERNS) {
        if (candidate.pattern.test(contents)) {
          fail(`${candidate.label} appears in ${file.relativePath}.`);
        }
      }
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    fail(`dist is ${totalBytes} bytes; total limit is ${MAX_TOTAL_BYTES}.`);
  }

  for (const required of [
    'client/.assetsignore',
    'client/vinext-client-entry-manifest.json',
    'server/BUILD_ID',
    'server/index.js',
    'server/wrangler.json',
  ]) {
    if (!files.some((file) => file.relativePath === required)) {
      fail(`${required} is missing.`);
    }
  }

  const assetIgnore = (
    await readFile(resolve(distRoot, 'client/.assetsignore'), 'utf8')
  )
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    assetIgnore.some((line) => line.startsWith('!')) ||
    [...REQUIRED_ASSET_IGNORES].some(
      (required) => !assetIgnore.includes(required),
    )
  ) {
    fail(
      'client/.assetsignore must exclude .vite, .dev.vars, and wrangler.json without negations.',
    );
  }

  const [sourceHosting, deployedHosting] = await Promise.all([
    readFile(resolve(sourceRoot, '.openai/hosting.json')),
    readFile(resolve(distRoot, '.openai/hosting.json')),
  ]);
  if (!equalBytes(sourceHosting, deployedHosting)) {
    fail('.openai/hosting.json differs from its reviewed source.');
  }
  const migrationFileCount = await verifyCopiedTree({
    sourceRoot,
    distRoot,
    sourceDirectory: 'drizzle',
    distPrefix: '.openai/drizzle',
  });
  const openAiFiles = files
    .filter((file) => file.relativePath.startsWith('.openai/'))
    .map((file) => file.relativePath);
  if (openAiFiles.length !== migrationFileCount + 1) {
    fail(
      '.openai contains files other than hosting.json and the reviewed migration tree.',
    );
  }

  await verifyWranglerConfig(resolve(distRoot, 'server/wrangler.json'));

  return {
    fileCount: files.length,
    totalBytes,
    migrationFileCount,
    roots,
    assertions: [
      'generated roots only',
      'source and source maps excluded',
      'repository-only material excluded',
      'known credential forms absent',
      'retired receipt upload surface absent',
      'internal client manifests ignored',
      'reviewed hosting and migration inputs matched byte-for-byte',
      'server assets and bindings constrained',
    ],
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (invokedPath === import.meta.url) {
  const result = await verifyPublicDist();
  console.log(
    `Public dist allowlist PASS: ${result.fileCount} files, ${result.totalBytes} bytes, ` +
      `${result.migrationFileCount} migration artifacts.`,
  );
}
