import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import sharpImport from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  LOCAL_GUARD_ICON_SIZES,
  LOCAL_GUARD_STORE_ASSETS,
  type SharpFactory,
} from '../scripts/render-local-guard-store-assets.mts';

const repositoryRoot = new URL('../', import.meta.url);
const sharp = sharpImport as unknown as SharpFactory;

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

describe('Local Guard store assets', () => {
  it('ships exact PNG icon sizes with a transparent safety margin', async () => {
    for (const size of LOCAL_GUARD_ICON_SIZES) {
      const path = new URL(
        `products/extension/icons/icon-${size}.png`,
        repositoryRoot,
      );
      const buffer = await readFile(path);
      const metadata = await sharp(buffer).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(size);
      expect(metadata.height).toBe(size);
      expect(metadata.hasAlpha).toBe(true);

      const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(4);
      expect(data[3]).toBe(0);
      const centerAlpha =
        data[(Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3];
      expect(centerAlpha).toBe(255);
    }
  });

  it('ships the exact, full-bleed small promotional tile', async () => {
    const path = new URL(LOCAL_GUARD_STORE_ASSETS.promoOutput, repositoryRoot);
    const buffer = await readFile(path);
    const metadata = await sharp(buffer).metadata();
    expect(metadata).toMatchObject({
      format: 'png',
      width: 440,
      height: 280,
      hasAlpha: false,
    });
  });

  it('ships an exact full-bleed screenshot from documented capture inputs', async () => {
    const path = new URL(
      LOCAL_GUARD_STORE_ASSETS.screenshotOutput,
      repositoryRoot,
    );
    const buffer = await readFile(path);
    const metadata = await sharp(buffer).metadata();
    expect(metadata).toMatchObject({
      format: 'png',
      width: 1280,
      height: 800,
      hasAlpha: false,
    });

    const provenance = JSON.parse(
      await readFile(
        new URL(
          'products/extension/release/assets/store-screenshot.provenance.json',
          repositoryRoot,
        ),
        'utf8',
      ),
    );
    expect(provenance).toMatchObject({
      schemaVersion: 'leftout.local-guard-store-capture/1',
      siteToolInvocation: false,
      sources: {
        lab: { path: LOCAL_GUARD_STORE_ASSETS.screenshotLabSource },
        popup: { path: LOCAL_GUARD_STORE_ASSETS.screenshotPopupSource },
      },
      output: { path: LOCAL_GUARD_STORE_ASSETS.screenshotOutput },
    });
    expect(sha256(buffer)).toBe(provenance.output.sha256);
    for (const source of Object.values(provenance.sources) as {
      path: string;
      sha256: string;
    }[]) {
      expect(sha256(await readFile(new URL(source.path, repositoryRoot)))).toBe(
        source.sha256,
      );
    }
  });
});
