import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/u;
const DEFAULT_TTL_MS = 60_000;

interface ChallengeBinding {
  extensionOrigin: string;
  origin: string;
  pageUrl: string;
  clientLabel: string;
}

interface StoredChallenge extends ChallengeBinding {
  expiresAtMs: number;
}

export interface PairingChallengeOptions {
  now?: () => number;
  token?: () => string;
  ttlMs?: number;
}

function digestHex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function normalizedExtensionOrigin(value: string) {
  const origin = value.trim();
  if (!EXTENSION_ORIGIN_PATTERN.test(origin)) {
    throw new Error('Pairing challenges require a Chrome extension origin.');
  }
  return origin;
}

function normalizedBinding(input: ChallengeBinding): ChallengeBinding {
  const originUrl = new URL(input.origin);
  if (
    !['http:', 'https:'].includes(originUrl.protocol) ||
    originUrl.username ||
    originUrl.password ||
    input.origin.trim() !== originUrl.origin
  ) {
    throw new Error('The pairing challenge origin is invalid.');
  }
  const origin = originUrl.origin;
  const page = new URL(input.pageUrl);
  if (!['http:', 'https:'].includes(page.protocol) || page.origin !== origin) {
    throw new Error('The pairing challenge page identity is invalid.');
  }
  if (page.username || page.password) {
    throw new Error('Page URLs containing credentials cannot be paired.');
  }
  page.search = '';
  page.hash = '';
  const clientLabel = input.clientLabel.trim();
  if (clientLabel.length < 1 || clientLabel.length > 80) {
    throw new Error('Client label must contain 1 to 80 characters.');
  }
  return {
    extensionOrigin: normalizedExtensionOrigin(input.extensionOrigin),
    origin,
    pageUrl: page.toString(),
    clientLabel,
  };
}

export class PairingChallengeManager {
  readonly #now: () => number;
  readonly #token: () => string;
  readonly #ttlMs: number;
  readonly #challenges = new Map<string, StoredChallenge>();

  constructor(options: PairingChallengeOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#token =
      options.token ??
      (() => Buffer.from(randomBytes(32)).toString('base64url'));
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (this.#ttlMs < 1_000 || this.#ttlMs > DEFAULT_TTL_MS) {
      throw new Error('Pairing challenge TTL must be 1 to 60 seconds.');
    }
  }

  issue(input: ChallengeBinding) {
    this.prune();
    const binding = normalizedBinding(input);
    const token = this.#token();
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) {
      throw new Error('Pairing challenge generator returned an invalid token.');
    }
    const expiresAtMs = this.#now() + this.#ttlMs;
    this.#challenges.set(digestHex(token), {
      ...binding,
      expiresAtMs,
    });
    return {
      token,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  consume(token: string, input: ChallengeBinding) {
    this.prune();
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) {
      throw new Error('The pairing challenge is invalid or expired.');
    }
    const key = digestHex(token);
    const stored = this.#challenges.get(key);
    this.#challenges.delete(key);
    if (!stored || stored.expiresAtMs <= this.#now()) {
      throw new Error('The pairing challenge is invalid or expired.');
    }
    const candidate = normalizedBinding(input);
    for (const field of [
      'extensionOrigin',
      'origin',
      'pageUrl',
      'clientLabel',
    ] as const) {
      if (!safeEqual(stored[field], candidate[field])) {
        throw new Error('The pairing challenge does not match this tab.');
      }
    }
    return candidate;
  }

  prune() {
    const now = this.#now();
    for (const [key, challenge] of this.#challenges) {
      if (challenge.expiresAtMs <= now) this.#challenges.delete(key);
    }
  }
}
