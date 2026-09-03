import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

const REQUIRED_GATE_IDS = [
  'store_graphic_assets',
  'publisher_identity',
  'chrome_web_store_review_and_signing',
  'native_messaging_identity_channel',
  'secure_local_transport',
  'install_update_rollback_removal',
  'signed_candidate_novice_accessibility',
  'public_privacy_and_support_deployment',
  'supported_platform_matrix',
  'release_incident_response',
] as const;

const PUBLIC_BASE_URL =
  'https://left-out-webmcp-security-lab.taitfor.chatgpt.site';

const permissionSchema = z
  .object({
    name: z.string().min(1).max(80),
    justification: z.string().min(20).max(500),
  })
  .strict();

const hostPermissionSchema = z
  .object({
    pattern: z.string().min(1).max(200),
    justification: z.string().min(20).max(500),
  })
  .strict();

const assetSchema = z
  .object({
    id: z.string().min(1).max(80),
    path: z.string().min(1).max(240),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

const storeSubmissionSchema = z
  .object({
    schemaVersion: z.literal('leftout.local-guard-store-submission/1'),
    extension: z
      .object({
        name: z.string().min(1).max(120),
        version: z.string().regex(/^\d+\.\d+\.\d+$/u),
        releaseChannel: z.enum(['developer_preview', 'production_candidate']),
      })
      .strict(),
    listing: z
      .object({
        language: z.literal('en'),
        category: z.string().min(1).max(80),
        singlePurpose: z.string().min(40).max(1_000),
        summary: z.string().min(40).max(132),
        description: z.string().min(100).max(16_000),
        homepageUrl: z.url().startsWith('https://'),
        privacyPolicyUrl: z.url().startsWith('https://'),
        supportUrl: z.url().startsWith('https://'),
      })
      .strict(),
    permissions: z.array(permissionSchema).min(1),
    hostPermissions: z.array(hostPermissionSchema),
    remoteCode: z
      .object({
        used: z.literal(false),
        declaration: z.string().min(30).max(500),
      })
      .strict(),
    dataUse: z
      .object({
        prominentConsentVersion: z.string().min(1).max(120),
        categories: z.array(
          z
            .object({
              name: z.enum([
                'web_history',
                'website_content',
                'authentication_information',
              ]),
              handled: z.literal(true),
              detail: z.string().min(20).max(500),
            })
            .strict(),
        ),
        destinations: z.array(z.literal('user_controlled_loopback_connector')),
        sentToDeveloper: z.literal(false),
        sold: z.literal(false),
        usedForAdvertising: z.literal(false),
        usedForCreditworthiness: z.literal(false),
        humanReviewByDeveloper: z.literal(false),
        externalTelemetry: z.literal(false),
        transport: z.enum([
          'plain_http_loopback_developer_preview',
          'chrome_native_messaging',
        ]),
        retention: z.string().min(80).max(1_000),
      })
      .strict(),
    distribution: z
      .object({
        ordinaryUserDistributionApproved: z.boolean(),
        chromeWebStoreHosted: z.boolean(),
        chromeWebStoreSigned: z.boolean(),
        publisherIdentityVerified: z.boolean(),
        storeItemId: z
          .string()
          .regex(/^[a-p]{32}$/u)
          .nullable(),
        productionReleaseKeyFingerprint: z
          .string()
          .regex(/^[0-9a-f]{64}$/u)
          .nullable(),
        nativeMessagingEnabled: z.boolean(),
        nativeHostName: z
          .string()
          .regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/u)
          .nullable(),
        nativeHostAllowedExtensionId: z
          .string()
          .regex(/^[a-p]{32}$/u)
          .nullable(),
      })
      .strict(),
    requiredAssets: z.array(assetSchema).min(3),
    policySources: z.array(z.url().startsWith('https://')).min(5),
  })
  .strict();

const releaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal('leftout.local-guard-release-evidence/1'),
    targetVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    releaseChannel: z.enum(['developer_preview', 'production_candidate']),
    evidenceDate: z.iso.date(),
    gates: z.array(
      z
        .object({
          id: z.enum(REQUIRED_GATE_IDS),
          status: z.enum(['missing', 'source_ready', 'verified']),
          evidence: z.array(z.string().min(1).max(240)),
        })
        .strict(),
    ),
  })
  .strict();

interface ChromeManifest {
  name: string;
  version: string;
  manifest_version: number;
  permissions: string[];
  host_permissions: string[];
}

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate values.`);
  }
}

function parseManifest(value: unknown): ChromeManifest {
  const schema = z.looseObject({
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    manifest_version: z.literal(3),
    permissions: z.array(z.string().min(1)),
    host_permissions: z.array(z.string().min(1)),
  });
  return schema.parse(value);
}

function pngDimensions(value: Uint8Array) {
  const bytes = Buffer.from(value);
  if (
    bytes.length < 24 ||
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new Error('Store graphic asset is not a valid PNG header.');
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function regularFile(path: string) {
  try {
    const details = await lstat(path);
    return details.isFile() && !details.isSymbolicLink();
  } catch {
    return false;
  }
}

function repositoryPath(value: string) {
  if (
    value.includes('..') ||
    value.startsWith('/') ||
    /^[a-z]:/iu.test(value) ||
    value.includes('\\')
  ) {
    throw new Error(
      `Release evidence path is not repository-relative: ${value}`,
    );
  }
  return resolve(value);
}

export async function assessLocalGuardRelease(
  options: {
    manifestPath?: string;
    storeSubmissionPath?: string;
    releaseEvidencePath?: string;
    outputPath?: string | null;
  } = {},
) {
  const manifestPath = resolve(
    options.manifestPath ?? 'products/extension/manifest.json',
  );
  const storeSubmissionPath = resolve(
    options.storeSubmissionPath ??
      'products/extension/release/store-submission.json',
  );
  const releaseEvidencePath = resolve(
    options.releaseEvidencePath ??
      'products/extension/release/release-evidence.json',
  );
  const [
    manifestBytes,
    storeBytes,
    evidenceBytes,
    popupHtml,
    popupJs,
    backgroundJs,
  ] = await Promise.all([
    readFile(manifestPath),
    readFile(storeSubmissionPath),
    readFile(releaseEvidencePath),
    readFile(resolve('products/extension/popup.html')),
    readFile(resolve('products/extension/popup.js')),
    readFile(resolve('products/extension/background.js')),
  ]);
  const manifest = parseManifest(
    JSON.parse(Buffer.from(manifestBytes).toString('utf8')),
  );
  const store = storeSubmissionSchema.parse(
    JSON.parse(Buffer.from(storeBytes).toString('utf8')),
  );
  const evidence = releaseEvidenceSchema.parse(
    JSON.parse(Buffer.from(evidenceBytes).toString('utf8')),
  );

  if (
    store.extension.name !== manifest.name ||
    store.extension.version !== manifest.version ||
    evidence.targetVersion !== manifest.version ||
    evidence.releaseChannel !== store.extension.releaseChannel
  ) {
    throw new Error('Release disclosures do not match the extension identity.');
  }
  if (
    store.listing.homepageUrl !== `${PUBLIC_BASE_URL}/local-guard` ||
    store.listing.privacyPolicyUrl !==
      `${PUBLIC_BASE_URL}/local-guard/privacy` ||
    store.listing.supportUrl !== `${PUBLIC_BASE_URL}/local-guard/support`
  ) {
    throw new Error('Release disclosure URLs do not match the public routes.');
  }
  if (
    store.policySources.some(
      (source) => new URL(source).hostname !== 'developer.chrome.com',
    )
  ) {
    throw new Error(
      'Release policy sources must use official Chrome documentation.',
    );
  }

  const permissionNames = store.permissions.map((item) => item.name);
  const hostPatterns = store.hostPermissions.map((item) => item.pattern);
  unique(permissionNames, 'Permission justifications');
  unique(hostPatterns, 'Host-permission justifications');
  if (
    !sameStrings(permissionNames, manifest.permissions) ||
    !sameStrings(hostPatterns, manifest.host_permissions)
  ) {
    throw new Error(
      'Release permission disclosures do not match the manifest.',
    );
  }

  const categoryNames = store.dataUse.categories.map((item) => item.name);
  unique(categoryNames, 'Data-use disclosures');
  if (
    !sameStrings(categoryNames, [
      'web_history',
      'website_content',
      'authentication_information',
    ])
  ) {
    throw new Error('Release data-use disclosures are incomplete.');
  }

  const popupHtmlText = Buffer.from(popupHtml).toString('utf8');
  const popupJsText = Buffer.from(popupJs).toString('utf8');
  const backgroundJsText = Buffer.from(backgroundJs).toString('utf8');
  if (
    !popupHtmlText.includes('id="data-consent"') ||
    !popupHtmlText.includes('id="withdraw-consent-button"') ||
    !popupHtmlText.includes(store.listing.privacyPolicyUrl) ||
    !popupJsText.includes(store.dataUse.prominentConsentVersion) ||
    !popupJsText.includes('void initializeConsent()') ||
    !backgroundJsText.includes('withdraw-local-consent') ||
    !backgroundJsText.includes('chrome.storage.local.get(null)')
  ) {
    throw new Error(
      'The runtime consent surface does not match the disclosure.',
    );
  }

  const publicRoutePaths = [
    'app/local-guard/page.tsx',
    'app/local-guard/privacy/page.tsx',
    'app/local-guard/support/page.tsx',
  ];
  for (const path of publicRoutePaths) {
    if (!(await regularFile(resolve(path)))) {
      throw new Error(`Required public disclosure route is missing: ${path}`);
    }
  }

  const gateIds = evidence.gates.map((gate) => gate.id);
  unique(gateIds, 'Release gates');
  if (!sameStrings(gateIds, REQUIRED_GATE_IDS)) {
    throw new Error('Release gates do not match the complete required set.');
  }
  for (const gate of evidence.gates) {
    if (gate.status === 'missing' && gate.evidence.length !== 0) {
      throw new Error(
        `Missing gate ${gate.id} may not cite completion evidence.`,
      );
    }
    if (gate.status !== 'missing' && gate.evidence.length === 0) {
      throw new Error(`Gate ${gate.id} requires inspectable evidence.`);
    }
    for (const path of gate.evidence) {
      if (!(await regularFile(repositoryPath(path)))) {
        throw new Error(`Gate evidence is missing or unsafe: ${path}`);
      }
    }
  }

  const assets = await Promise.all(
    store.requiredAssets.map(async (asset) => {
      const path = repositoryPath(asset.path);
      if (!(await regularFile(path))) {
        return { id: asset.id, path: asset.path, present: false as const };
      }
      const dimensions = pngDimensions(await readFile(path));
      if (
        dimensions.width !== asset.width ||
        dimensions.height !== asset.height
      ) {
        throw new Error(
          `Store graphic asset dimensions are wrong: ${asset.path}`,
        );
      }
      return {
        id: asset.id,
        path: asset.path,
        present: true as const,
        sha256: sha256(await readFile(path)),
      };
    }),
  );

  const gateById = new Map(evidence.gates.map((gate) => [gate.id, gate]));
  const assetsPresent = assets.every((asset) => asset.present);
  if (
    gateById.get('store_graphic_assets')?.status === 'verified' &&
    !assetsPresent
  ) {
    throw new Error(
      'Store graphic assets are marked verified but are incomplete.',
    );
  }
  if (
    gateById.get('publisher_identity')?.status === 'verified' &&
    (!store.distribution.publisherIdentityVerified ||
      !store.distribution.productionReleaseKeyFingerprint)
  ) {
    throw new Error(
      'Publisher identity is marked verified without its identity binding.',
    );
  }
  if (
    gateById.get('chrome_web_store_review_and_signing')?.status ===
      'verified' &&
    (!store.distribution.chromeWebStoreHosted ||
      !store.distribution.chromeWebStoreSigned ||
      !store.distribution.storeItemId)
  ) {
    throw new Error(
      'Chrome Web Store signing is marked verified without store identity.',
    );
  }
  if (
    gateById.get('native_messaging_identity_channel')?.status === 'verified' &&
    (!store.distribution.nativeMessagingEnabled ||
      !store.distribution.nativeHostName ||
      store.distribution.nativeHostAllowedExtensionId !==
        store.distribution.storeItemId)
  ) {
    throw new Error(
      'Native messaging is marked verified without exact extension identity.',
    );
  }
  if (
    gateById.get('secure_local_transport')?.status === 'verified' &&
    store.dataUse.transport !== 'chrome_native_messaging'
  ) {
    throw new Error(
      'Secure local transport is marked verified while HTTP remains active.',
    );
  }

  const blockers = evidence.gates
    .filter((gate) => gate.status !== 'verified')
    .map((gate) => gate.id);
  if (!assetsPresent && !blockers.includes('store_graphic_assets')) {
    blockers.unshift('store_graphic_assets');
  }
  const allGatesVerified = blockers.length === 0;
  const ordinaryUserReleaseReady =
    allGatesVerified &&
    evidence.releaseChannel === 'production_candidate' &&
    store.distribution.ordinaryUserDistributionApproved &&
    store.distribution.chromeWebStoreHosted &&
    store.distribution.chromeWebStoreSigned &&
    store.distribution.publisherIdentityVerified &&
    store.distribution.nativeMessagingEnabled &&
    store.dataUse.transport === 'chrome_native_messaging';

  const sourcePaths = [
    ...new Set([
      manifestPath,
      storeSubmissionPath,
      releaseEvidencePath,
      resolve('products/extension/popup.html'),
      resolve('products/extension/popup.js'),
      resolve('products/extension/background.js'),
      ...publicRoutePaths.map((path) => resolve(path)),
      ...evidence.gates.flatMap((gate) =>
        gate.evidence.map((path) => repositoryPath(path)),
      ),
    ]),
  ];
  const sourceDigests = await Promise.all(
    sourcePaths.map(async (path) => ({
      file: relative(process.cwd(), path).replaceAll('\\', '/'),
      sha256: sha256(await readFile(path)),
    })),
  );
  const report = Object.freeze({
    schemaVersion: 'leftout.local-guard-readiness-report/1' as const,
    extensionVersion: manifest.version,
    evidenceDate: evidence.evidenceDate,
    releaseChannel: evidence.releaseChannel,
    sourceDisclosureReady: true as const,
    storeAssetsReady: assetsPresent,
    ordinaryUserReleaseReady,
    blockers: Object.freeze(blockers),
    assets: Object.freeze(assets),
    gates: Object.freeze(evidence.gates),
    sourceDigests: Object.freeze(sourceDigests),
    claims: Object.freeze({
      chromeWebStoreSigned: store.distribution.chromeWebStoreSigned,
      nativeMessagingIdentityBound:
        store.distribution.nativeMessagingEnabled &&
        Boolean(store.distribution.nativeHostAllowedExtensionId),
      secureLocalTransport:
        store.dataUse.transport === 'chrome_native_messaging',
      ordinaryUserDistributionApproved:
        store.distribution.ordinaryUserDistributionApproved,
    }),
  });

  const outputPath =
    options.outputPath === undefined
      ? resolve(
          `outputs/local-guard/leftout-local-guard-${manifest.version}.readiness.json`,
        )
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
  const result = await assessLocalGuardRelease();
  console.log(
    `Disclosure source ready: ${result.report.sourceDisclosureReady}`,
  );
  console.log(`Store assets ready: ${result.report.storeAssetsReady}`);
  console.log(
    `Ordinary-user release ready: ${result.report.ordinaryUserReleaseReady}`,
  );
  console.log(`Open gates: ${result.report.blockers.join(', ') || 'none'}`);
  if (result.outputPath) console.log(`Readiness report: ${result.outputPath}`);
  if (
    process.argv.includes('--require-product-release') &&
    !result.report.ordinaryUserReleaseReady
  ) {
    throw new Error('Local Guard ordinary-user release gate is not satisfied.');
  }
}
