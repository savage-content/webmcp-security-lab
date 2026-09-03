import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createLocalGuardPackage,
  LOCAL_GUARD_RUNTIME_FILES,
} from '../scripts/package-local-guard.mts';

describe('Local Guard release packaging', () => {
  it('creates a deterministic, allowlisted MV3 release with integrity metadata', async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), 'leftout-guard-a-'));
    const secondDirectory = await mkdtemp(join(tmpdir(), 'leftout-guard-b-'));
    const first = await createLocalGuardPackage({
      outputDirectory: firstDirectory,
    });
    const second = await createLocalGuardPackage({
      outputDirectory: secondDirectory,
    });

    expect(first.release.files.map((file) => file.path)).toEqual(
      [...LOCAL_GUARD_RUNTIME_FILES].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    expect(first.release.security).toEqual({
      manifestVersion: 3,
      permissions: ['activeTab', 'scripting', 'storage'],
      hostPermissions: [
        'http://127.0.0.1:8788/*',
        'http://localhost:8788/*',
        'http://127.0.0.1:48788/*',
        'http://localhost:48788/*',
      ],
      remoteCode: false,
    });
    expect(first.release.archive.sha256).toBe(second.release.archive.sha256);
    expect(await readFile(first.archivePath)).toEqual(
      await readFile(second.archivePath),
    );
    expect(Buffer.from(await readFile(first.archivePath)).readUInt32LE(0)).toBe(
      0x04034b50,
    );
    expect(await readFile(first.sumsPath, 'utf8')).toBe(
      `${first.release.archive.sha256}  leftout-local-guard-${first.release.version}.zip\n`,
    );
  });

  it('builds a separate native candidate with no loopback host authority', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-guard-native-'));
    const candidate = await createLocalGuardPackage({
      outputDirectory: directory,
      profile: 'native-candidate',
    });
    expect(candidate.release).toMatchObject({
      name: 'Left Out WebMCP Safety',
      version: '0.4.0',
      security: {
        manifestVersion: 3,
        permissions: ['activeTab', 'scripting', 'storage', 'nativeMessaging'],
        hostPermissions: [],
        remoteCode: false,
      },
    });
    expect(candidate.release.archive.file).toBe(
      'leftout-local-guard-native-candidate-0.4.0.zip',
    );
    expect(candidate.release.files.map((file) => file.path)).toContain(
      'native-transport.js',
    );
    expect(candidate.release.files.map((file) => file.path)).not.toContain(
      'manifest.native-candidate.json',
    );
  });
});
