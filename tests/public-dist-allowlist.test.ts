import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyPublicDist } from '../scripts/verify-public-dist.mts';

const temporaryRoots: string[] = [];

async function write(path: string, contents: string | Uint8Array) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, contents);
}

async function fixture() {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'leftout-public-dist-'));
  temporaryRoots.push(sourceRoot);
  const distRoot = resolve(sourceRoot, 'dist');
  const hosting = '{"project_id":"test-project","d1":"DB","r2":null}\n';
  const migration = 'CREATE TABLE synthetic_receipts (id TEXT PRIMARY KEY);\n';
  const journal = '{"version":"7","entries":[]}\n';
  const wrangler = {
    main: 'index.js',
    vars: {},
    assets: { directory: '../client' },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'site-creator-d1',
        database_id: '00000000-0000-4000-8000-000000000000',
        migrations_dir: '../../migrations',
      },
    ],
    queues: { producers: [], consumers: [] },
    services: [],
    r2_buckets: [],
    kv_namespaces: [],
  };

  await Promise.all([
    write(resolve(sourceRoot, '.openai/hosting.json'), hosting),
    write(resolve(sourceRoot, 'drizzle/0000_synthetic.sql'), migration),
    write(resolve(sourceRoot, 'drizzle/meta/_journal.json'), journal),
    write(resolve(distRoot, '.openai/hosting.json'), hosting),
    write(resolve(distRoot, '.openai/drizzle/0000_synthetic.sql'), migration),
    write(resolve(distRoot, '.openai/drizzle/meta/_journal.json'), journal),
    write(
      resolve(distRoot, 'client/.assetsignore'),
      'wrangler.json\n.dev.vars\n.vite\n',
    ),
    write(resolve(distRoot, 'client/_headers'), '/_next/static/*\n'),
    write(
      resolve(distRoot, 'client/favicon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
    ),
    write(
      resolve(distRoot, 'client/vinext-client-entry-manifest.json'),
      '{}\n',
    ),
    write(resolve(distRoot, 'server/BUILD_ID'), 'synthetic-build\n'),
    write(
      resolve(distRoot, 'server/index.js'),
      'export default { fetch() {} };\n',
    ),
    write(
      resolve(distRoot, 'server/wrangler.json'),
      `${JSON.stringify(wrangler)}\n`,
    ),
  ]);
  return { sourceRoot, distRoot };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('public dist allowlist', () => {
  it('accepts only the generated public bundle and reviewed deployment inputs', async () => {
    const paths = await fixture();
    await expect(verifyPublicDist(paths)).resolves.toMatchObject({
      fileCount: 10,
      migrationFileCount: 2,
      roots: ['.openai', 'client', 'server'],
    });
  });

  it('rejects repository-only paths and source artifacts', async () => {
    const paths = await fixture();
    await write(
      resolve(paths.distRoot, 'docs/README.md'),
      'private repository material\n',
    );
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /roots must be exactly|repository-only/u,
    );

    await rm(resolve(paths.distRoot, 'docs'), { force: true, recursive: true });
    await write(
      resolve(paths.distRoot, 'client/source.ts'),
      'export const privateSource = true;\n',
    );
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /source or source-map/u,
    );
  });

  it('rejects migration drift and extra deployment metadata', async () => {
    const paths = await fixture();
    await write(
      resolve(paths.distRoot, '.openai/drizzle/0000_synthetic.sql'),
      'SELECT 1;\n',
    );
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /differs from its reviewed source/u,
    );

    await write(
      resolve(paths.distRoot, '.openai/drizzle/0000_synthetic.sql'),
      'CREATE TABLE synthetic_receipts (id TEXT PRIMARY KEY);\n',
    );
    await write(resolve(paths.distRoot, '.openai/unreviewed.json'), '{}\n');
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /files other than hosting\.json/u,
    );
  });

  it('rejects embedded credential material', async () => {
    const paths = await fixture();
    await write(
      resolve(paths.distRoot, 'server/index.js'),
      'const key = "-----BEGIN PRIVATE KEY-----";\n',
    );
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /private key material/u,
    );
  });

  it('rejects a generated build that restores the retired receipt upload surface', async () => {
    const paths = await fixture();
    await write(
      resolve(paths.distRoot, 'server/index.js'),
      'const retiredRoute = "/api/evidence";\n',
    );
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /retired public receipt API/u,
    );
  });

  it('requires internal build metadata to stay outside the public asset surface', async () => {
    const paths = await fixture();
    await write(
      resolve(paths.distRoot, 'client/.assetsignore'),
      'wrangler.json\n',
    );
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /must exclude \.vite/u,
    );

    await write(
      resolve(paths.distRoot, 'client/.assetsignore'),
      'wrangler.json\n.dev.vars\n.vite\n',
    );
    const wranglerPath = resolve(paths.distRoot, 'server/wrangler.json');
    const wrangler = JSON.parse(await readFile(wranglerPath, 'utf8')) as Record<
      string,
      unknown
    >;
    wrangler.services = [{ binding: 'UNREVIEWED', service: 'external-worker' }];
    await write(wranglerPath, `${JSON.stringify(wrangler)}\n`);
    await expect(verifyPublicDist(paths)).rejects.toThrow(
      /unexpected services authority/u,
    );
  });
});
