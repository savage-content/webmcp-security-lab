import { generateKeyPairSync } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  attestLocalGuardRelease,
  verifyLocalGuardReleaseAttestation,
} from '../scripts/attest-local-guard-release.mts';
import { createLocalGuardPackage } from '../scripts/package-local-guard.mts';

function releaseKeys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

describe('Local Guard release attestation', () => {
  it('binds the exact archive and manifest to an explicitly trusted key', async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), 'leftout-guard-attestation-'),
    );
    const packaged = await createLocalGuardPackage({ outputDirectory });
    const keys = releaseKeys();
    const signed = await attestLocalGuardRelease({
      archivePath: packaged.archivePath,
      releaseManifestPath: packaged.releasePath,
      privateKeyPem: keys.privateKey,
    });
    const verified = await verifyLocalGuardReleaseAttestation({
      archivePath: packaged.archivePath,
      releaseManifestPath: packaged.releasePath,
      attestationPath: signed.outputPath,
      trustedPublicKeyPem: keys.publicKey,
    });

    expect(verified).toMatchObject({
      verified: true,
      archiveSha256: packaged.release.archive.sha256,
    });
    expect(signed.attestation.claims).toEqual({
      archiveIntegrity: true,
      chromePublisherIdentity: false,
      chromeWebStoreSigned: false,
    });
    expect(signed.attestation.signer.publicKeySpkiSha256).toHaveLength(64);
  });

  it('rejects an untrusted signer and changed release bytes', async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), 'leftout-guard-attestation-tamper-'),
    );
    const packaged = await createLocalGuardPackage({ outputDirectory });
    const signer = releaseKeys();
    const stranger = releaseKeys();
    const signed = await attestLocalGuardRelease({
      archivePath: packaged.archivePath,
      releaseManifestPath: packaged.releasePath,
      privateKeyPem: signer.privateKey,
    });

    await expect(
      verifyLocalGuardReleaseAttestation({
        archivePath: packaged.archivePath,
        releaseManifestPath: packaged.releasePath,
        attestationPath: signed.outputPath,
        trustedPublicKeyPem: stranger.publicKey,
      }),
    ).rejects.toThrow('trusted release key');

    const original = await readFile(packaged.archivePath);
    await writeFile(
      packaged.archivePath,
      Buffer.concat([original, Buffer.from('changed')]),
    );
    await expect(
      verifyLocalGuardReleaseAttestation({
        archivePath: packaged.archivePath,
        releaseManifestPath: packaged.releasePath,
        attestationPath: signed.outputPath,
        trustedPublicKeyPem: signer.publicKey,
      }),
    ).rejects.toThrow('do not match');
  });

  it('refuses to overwrite an existing attestation', async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), 'leftout-guard-attestation-existing-'),
    );
    const packaged = await createLocalGuardPackage({ outputDirectory });
    const keys = releaseKeys();
    await attestLocalGuardRelease({
      archivePath: packaged.archivePath,
      releaseManifestPath: packaged.releasePath,
      privateKeyPem: keys.privateKey,
    });
    await expect(
      attestLocalGuardRelease({
        archivePath: packaged.archivePath,
        releaseManifestPath: packaged.releasePath,
        privateKeyPem: keys.privateKey,
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('refuses to attest an archive that no longer matches reviewed source', async () => {
    const workspace = await mkdtemp(
      join(tmpdir(), 'leftout-guard-attestation-source-drift-'),
    );
    const extensionDirectory = join(workspace, 'extension');
    const outputDirectory = join(workspace, 'output');
    await cp('products/extension', extensionDirectory, { recursive: true });
    const packaged = await createLocalGuardPackage({
      extensionDirectory,
      outputDirectory,
    });
    await writeFile(
      join(extensionDirectory, 'background.js'),
      `${await readFile(join(extensionDirectory, 'background.js'), 'utf8')}\n// drift\n`,
    );

    await expect(
      attestLocalGuardRelease({
        archivePath: packaged.archivePath,
        extensionDirectory,
        releaseManifestPath: packaged.releasePath,
        privateKeyPem: releaseKeys().privateKey,
      }),
    ).rejects.toThrow('does not reproduce from the reviewed extension source');
  });
});
