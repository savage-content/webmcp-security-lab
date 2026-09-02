import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';

export const REPORTING_FEED_SIGNATURE_ALGORITHM = 'Ed25519' as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const KEY_ID_PATTERN =
  /^feed\.[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export interface ReportingFeedSigningMaterial {
  keyId: string;
  privateKeyPkcs8Base64: string;
  publicKeySpkiBase64: string;
  publicKeySpkiSha256: string;
}

export interface ReportingFeedSignature {
  algorithm: typeof REPORTING_FEED_SIGNATURE_ALGORITHM;
  bodySha256Base64: string;
  keyId: string;
  publicKeySpkiBase64: string;
  publicKeySpkiSha256: string;
  signatureBase64: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string') ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error('Reporting feed signing fields are invalid.');
  }
}

function canonicalBase64(
  value: unknown,
  label: string,
  minimumBytes: number,
  maximumBytes: number,
) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximumBytes * 2 ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new Error(`${label} must use bounded canonical base64.`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (
    bytes.length < minimumBytes ||
    bytes.length > maximumBytes ||
    bytes.toString('base64') !== value
  ) {
    throw new Error(`${label} must use bounded canonical base64.`);
  }
  return bytes;
}

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest();
}

function validatedMaterial(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Reporting feed signing material is required.');
  }
  exactKeys(value, [
    'keyId',
    'privateKeyPkcs8Base64',
    'publicKeySpkiBase64',
    'publicKeySpkiSha256',
  ]);
  if (
    typeof value.keyId !== 'string' ||
    value.keyId.length > 64 ||
    !KEY_ID_PATTERN.test(value.keyId)
  ) {
    throw new Error(
      'Reporting feed signing key ID must be a normalized feed.* identifier.',
    );
  }
  if (typeof value.privateKeyPkcs8Base64 !== 'string') {
    throw new Error('Reporting feed private key is required.');
  }
  if (typeof value.publicKeySpkiBase64 !== 'string') {
    throw new Error('Reporting feed public key is required.');
  }
  if (
    typeof value.publicKeySpkiSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.publicKeySpkiSha256)
  ) {
    throw new Error(
      'Reporting feed public-key fingerprint must be a lowercase SHA-256 digest.',
    );
  }
  const privateDer = canonicalBase64(
    value.privateKeyPkcs8Base64,
    'Reporting feed private key',
    32,
    512,
  );
  const configuredPublicDer = canonicalBase64(
    value.publicKeySpkiBase64,
    'Reporting feed public key',
    32,
    512,
  );
  let privateKey;
  try {
    privateKey = createPrivateKey({
      key: privateDer,
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    throw new Error('Reporting feed private key is invalid.');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Reporting feed signing requires an Ed25519 private key.');
  }
  const derivedPublicDer = Buffer.from(
    createPublicKey(privateKey).export({ format: 'der', type: 'spki' }),
  );
  const fingerprint = Buffer.from(sha256(derivedPublicDer)).toString('hex');
  if (
    !derivedPublicDer.equals(configuredPublicDer) ||
    fingerprint !== value.publicKeySpkiSha256
  ) {
    throw new Error(
      'Reporting feed signing key does not match the separately configured public key and fingerprint.',
    );
  }
  return {
    material: Object.freeze({
      keyId: value.keyId,
      privateKeyPkcs8Base64: value.privateKeyPkcs8Base64,
      publicKeySpkiBase64: value.publicKeySpkiBase64,
      publicKeySpkiSha256: value.publicKeySpkiSha256,
    }),
    privateKey,
    publicKey: createPublicKey(privateKey),
  } as const;
}

export function parseReportingFeedSigningMaterial(
  value: unknown,
): Readonly<ReportingFeedSigningMaterial> {
  return validatedMaterial(value).material;
}

export function signReportingFeedBytes(
  bytes: Uint8Array,
  material: Readonly<ReportingFeedSigningMaterial>,
): Readonly<ReportingFeedSignature> {
  const validated = validatedMaterial(material);
  const body = Buffer.from(bytes);
  return Object.freeze({
    algorithm: REPORTING_FEED_SIGNATURE_ALGORITHM,
    bodySha256Base64: Buffer.from(sha256(body)).toString('base64'),
    keyId: validated.material.keyId,
    publicKeySpkiBase64: validated.material.publicKeySpkiBase64,
    publicKeySpkiSha256: validated.material.publicKeySpkiSha256,
    signatureBase64: Buffer.from(
      sign(null, body, validated.privateKey),
    ).toString('base64'),
  });
}

export function verifyReportingFeedBytes(input: {
  bytes: Uint8Array;
  expectedPublicKeySpkiSha256: string;
  publicKeySpkiBase64: string;
  signatureBase64: string;
}) {
  if (
    !SHA256_PATTERN.test(input.expectedPublicKeySpkiSha256) ||
    typeof input.signatureBase64 !== 'string' ||
    !BASE64_PATTERN.test(input.signatureBase64)
  ) {
    return false;
  }
  let publicDer: Buffer;
  let signature: Buffer;
  try {
    publicDer = canonicalBase64(
      input.publicKeySpkiBase64,
      'Reporting feed public key',
      32,
      512,
    );
    signature = canonicalBase64(
      input.signatureBase64,
      'Reporting feed signature',
      32,
      256,
    );
  } catch {
    return false;
  }
  if (
    Buffer.from(sha256(publicDer)).toString('hex') !==
    input.expectedPublicKeySpkiSha256
  ) {
    return false;
  }
  try {
    const publicKey = createPublicKey({
      key: publicDer,
      format: 'der',
      type: 'spki',
    });
    return (
      publicKey.asymmetricKeyType === 'ed25519' &&
      verify(null, Buffer.from(input.bytes), publicKey, signature)
    );
  } catch {
    return false;
  }
}
