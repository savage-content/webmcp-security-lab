import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import sharpImport from 'sharp';

export interface SharpPipeline {
  composite(
    inputs: readonly { input: Uint8Array; left: number; top: number }[],
  ): SharpPipeline;
  ensureAlpha(): SharpPipeline;
  extract(options: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): SharpPipeline;
  flatten(options: { background: string }): SharpPipeline;
  metadata(): Promise<{
    format?: string;
    width?: number;
    height?: number;
    hasAlpha?: boolean;
  }>;
  png(options: {
    adaptiveFiltering: boolean;
    compressionLevel: number;
    force: boolean;
    palette: boolean;
  }): SharpPipeline;
  raw(): SharpPipeline;
  removeAlpha(): SharpPipeline;
  resize(
    width: number,
    height: number,
    options: {
      fit: 'cover' | 'fill';
      kernel?: string;
      position?: 'centre';
    },
  ): SharpPipeline;
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Buffer;
    info: { channels: number };
  }>;
  toFile(path: string): Promise<{
    width: number;
    height: number;
    format: string;
  }>;
}

export interface SharpFactory {
  (input: string | Uint8Array, options?: { density: number }): SharpPipeline;
  kernel: { lanczos3: string };
}

const sharp = sharpImport as unknown as SharpFactory;

export const LOCAL_GUARD_ICON_SIZES = Object.freeze([16, 32, 48, 128]);

export const LOCAL_GUARD_STORE_ASSETS = Object.freeze({
  iconSource: 'products/extension/release/assets-src/local-guard-icon.svg',
  promoSource: 'products/extension/release/assets-src/small-promo-440x280.svg',
  promoOutput: 'products/extension/release/assets/small-promo-440x280.png',
  screenshotLabSource:
    'products/extension/release/assets-src/captures/lab-release-candidate.jpg',
  screenshotPopupSource:
    'products/extension/release/assets-src/captures/popup-protected.png',
  screenshotOutput:
    'products/extension/release/assets/store-screenshot-1280x800.png',
});

async function renderPng(
  sourcePath: string,
  outputPath: string,
  width: number,
  height: number,
  background?: string,
) {
  await mkdir(dirname(outputPath), { recursive: true });
  let pipeline = sharp(sourcePath, { density: 384 }).resize(width, height, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  });
  if (background) {
    pipeline = pipeline.flatten({ background });
  }
  const result = await pipeline
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      force: true,
      palette: false,
    })
    .toFile(outputPath);
  if (
    result.width !== width ||
    result.height !== height ||
    result.format !== 'png'
  ) {
    throw new Error(`Unexpected rendered asset dimensions: ${outputPath}.`);
  }
  return result;
}

export async function renderLocalGuardStoreAssets(
  rootDirectory = process.cwd(),
) {
  const iconSource = resolve(
    rootDirectory,
    LOCAL_GUARD_STORE_ASSETS.iconSource,
  );
  const iconOutputs = await Promise.all(
    LOCAL_GUARD_ICON_SIZES.map(async (size) => {
      const path = resolve(
        rootDirectory,
        `products/extension/icons/icon-${size}.png`,
      );
      await renderPng(iconSource, path, size, size);
      return path;
    }),
  );
  const promoOutput = resolve(
    rootDirectory,
    LOCAL_GUARD_STORE_ASSETS.promoOutput,
  );
  await renderPng(
    resolve(rootDirectory, LOCAL_GUARD_STORE_ASSETS.promoSource),
    promoOutput,
    440,
    280,
    '#101722',
  );

  const screenshotOutput = resolve(
    rootDirectory,
    LOCAL_GUARD_STORE_ASSETS.screenshotOutput,
  );
  await mkdir(dirname(screenshotOutput), { recursive: true });
  const background = await sharp(
    resolve(rootDirectory, LOCAL_GUARD_STORE_ASSETS.screenshotLabSource),
  )
    .resize(1280, 800, { fit: 'cover', position: 'centre' })
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      force: true,
      palette: false,
    })
    .toBuffer();
  const popup = await sharp(
    resolve(rootDirectory, LOCAL_GUARD_STORE_ASSETS.screenshotPopupSource),
  )
    .extract({ left: 0, top: 0, width: 360, height: 800 })
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      force: true,
      palette: false,
    })
    .toBuffer();
  const screenshotResult = await sharp(background)
    .composite([{ input: popup, left: 896, top: 0 }])
    .flatten({ background: '#101722' })
    .removeAlpha()
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      force: true,
      palette: false,
    })
    .toFile(screenshotOutput);
  if (
    screenshotResult.width !== 1280 ||
    screenshotResult.height !== 800 ||
    screenshotResult.format !== 'png'
  ) {
    throw new Error('Unexpected Local Guard store screenshot dimensions.');
  }
  return { iconOutputs, promoOutput, screenshotOutput };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const result = await renderLocalGuardStoreAssets();
  console.log(`Rendered ${result.iconOutputs.length} extension icons.`);
  console.log(`Rendered store promo: ${result.promoOutput}`);
  console.log(`Rendered store screenshot: ${result.screenshotOutput}`);
}
