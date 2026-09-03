import { createHash, randomBytes } from 'node:crypto';

import {
  createPrivacySafeIssueDraft,
  type PrivacySafeIssueDraft,
} from './issue-draft';

interface CompositionRecord {
  expiresAtMs: number;
  scope: string;
  siteOrigin: string;
}

interface SubmissionRecord {
  draft: Readonly<PrivacySafeIssueDraft>;
  expiresAtMs: number;
  scope: string;
}

function randomSecret() {
  return Buffer.from(randomBytes(32)).toString('base64url');
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function boundedScope(value: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
    throw new Error('A bounded external-report scope is required.');
  }
  return value;
}

export function canonicalExternalReportOrigin(siteOrigin: string) {
  const draft = createPrivacySafeIssueDraft({
    context: 'public-web',
    siteOrigin,
    category: 'unexpected-tool-change',
    severity: 'informational',
    stage: 'registration',
  });
  return draft.siteOrigin!;
}

export interface ExternalReportActionManagerOptions {
  now?: () => number;
  secret?: () => string;
  ttlMs?: number;
}

/**
 * Holds public origin and draft authority on the loopback server. Browser forms
 * carry only one-use opaque actions plus closed enum choices.
 */
export class ExternalReportActionManager {
  readonly #now: () => number;
  readonly #secret: () => string;
  readonly #ttlMs: number;
  readonly #compositions = new Map<string, CompositionRecord>();
  readonly #submissions = new Map<string, SubmissionRecord>();

  constructor(options: ExternalReportActionManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#secret = options.secret ?? randomSecret;
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    if (this.#ttlMs < 1_000 || this.#ttlMs > 10 * 60_000) {
      throw new Error('External-report action TTL must be 1 to 600 seconds.');
    }
  }

  issueComposition(scopeValue: string, siteOrigin: string) {
    this.cleanup();
    this.limit(this.#compositions);
    const token = this.#secret();
    this.#compositions.set(digest(token), {
      scope: boundedScope(scopeValue),
      siteOrigin: canonicalExternalReportOrigin(siteOrigin),
      expiresAtMs: this.#now() + this.#ttlMs,
    });
    return token;
  }

  compose(
    token: string,
    scopeValue: string,
    input: {
      category: unknown;
      severity: unknown;
      stage: unknown;
    },
  ) {
    this.cleanup();
    const record = this.consumeRecord(
      this.#compositions,
      token,
      boundedScope(scopeValue),
    );
    return createPrivacySafeIssueDraft({
      context: 'public-web',
      siteOrigin: record.siteOrigin,
      category: input.category,
      severity: input.severity,
      stage: input.stage,
    });
  }

  issueSubmission(scopeValue: string, draftInput: PrivacySafeIssueDraft) {
    this.cleanup();
    this.limit(this.#submissions);
    const draft = createPrivacySafeIssueDraft({
      context: draftInput.context,
      category: draftInput.category,
      severity: draftInput.severity,
      stage: draftInput.stage,
      ...(draftInput.siteOrigin ? { siteOrigin: draftInput.siteOrigin } : {}),
    });
    if (draft.context !== 'public-web') {
      throw new Error(
        'Only a public-web draft can receive submission authority.',
      );
    }
    const token = this.#secret();
    this.#submissions.set(digest(token), {
      scope: boundedScope(scopeValue),
      draft,
      expiresAtMs: this.#now() + this.#ttlMs,
    });
    return token;
  }

  consumeSubmission(token: string, scopeValue: string) {
    this.cleanup();
    return this.consumeRecord(
      this.#submissions,
      token,
      boundedScope(scopeValue),
    ).draft;
  }

  revokeScope(scopeValue: string) {
    const scope = boundedScope(scopeValue);
    for (const records of [this.#compositions, this.#submissions]) {
      for (const [key, record] of records) {
        if (record.scope === scope) records.delete(key);
      }
    }
  }

  dispose() {
    this.#compositions.clear();
    this.#submissions.clear();
  }

  private cleanup() {
    const now = this.#now();
    for (const records of [this.#compositions, this.#submissions]) {
      for (const [key, record] of records) {
        if (record.expiresAtMs <= now) records.delete(key);
      }
    }
  }

  private consumeRecord<T extends { expiresAtMs: number; scope: string }>(
    records: Map<string, T>,
    token: string,
    scope: string,
  ) {
    const key = digest(token);
    const record = records.get(key);
    records.delete(key);
    if (
      !record ||
      record.expiresAtMs <= this.#now() ||
      record.scope !== scope
    ) {
      throw new Error('The external-report action is invalid or expired.');
    }
    return record;
  }

  private limit<T>(records: Map<string, T>) {
    while (records.size >= 64) {
      const oldest = records.keys().next().value;
      if (typeof oldest !== 'string') break;
      records.delete(oldest);
    }
  }
}
