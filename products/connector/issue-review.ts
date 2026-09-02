import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { LocalIssueCandidateSource } from './issue-candidate';
import {
  createPrivacySafeIssueDraft,
  type PrivacySafeIssueDraft,
} from './issue-draft';

export const LOCAL_ISSUE_REVIEW_SCHEMA_VERSION =
  'leftout.local-issue-review/1' as const;

export interface LocalIssueReviewItem {
  draft: Readonly<PrivacySafeIssueDraft>;
  id: string;
  reviewState: 'local-only';
  savedAt: string;
  schemaVersion: typeof LOCAL_ISSUE_REVIEW_SCHEMA_VERSION;
}

interface SaveActionRecord {
  expiresAtMs: number;
  scope: string;
  source: LocalIssueCandidateSource;
}

function randomSecret() {
  return Buffer.from(randomBytes(32)).toString('base64url');
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function boundedScope(value: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
    throw new Error('A bounded local review scope is required.');
  }
  return value;
}

export interface IssueSaveActionManagerOptions {
  now?: () => number;
  secret?: () => string;
  ttlMs?: number;
}

/** One-use action tokens prevent cross-origin or stale local form saves. */
export class IssueSaveActionManager {
  readonly #now: () => number;
  readonly #secret: () => string;
  readonly #ttlMs: number;
  readonly #actions = new Map<string, SaveActionRecord>();

  constructor(options: IssueSaveActionManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#secret = options.secret ?? randomSecret;
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    if (this.#ttlMs < 1_000 || this.#ttlMs > 10 * 60_000) {
      throw new Error('Issue save-action TTL must be 1 to 600 seconds.');
    }
  }

  issue(scopeValue: string, source: LocalIssueCandidateSource) {
    this.cleanup();
    while (this.#actions.size >= 64) {
      const oldest = this.#actions.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#actions.delete(oldest);
    }
    const scope = boundedScope(scopeValue);
    const token = this.#secret();
    this.#actions.set(digest(token), {
      scope,
      source: structuredClone(source),
      expiresAtMs: this.#now() + this.#ttlMs,
    });
    return token;
  }

  consume(token: string, scopeValue: string) {
    this.cleanup();
    const key = digest(token);
    const record = this.#actions.get(key);
    this.#actions.delete(key);
    const scope = boundedScope(scopeValue);
    if (
      !record ||
      record.expiresAtMs <= this.#now() ||
      record.scope !== scope
    ) {
      throw new Error('The local save action is invalid or expired.');
    }
    return structuredClone(record.source);
  }

  revokeScope(scopeValue: string) {
    const scope = boundedScope(scopeValue);
    for (const [key, record] of this.#actions) {
      if (record.scope === scope) this.#actions.delete(key);
    }
  }

  dispose() {
    this.#actions.clear();
  }

  private cleanup() {
    const now = this.#now();
    for (const [key, record] of this.#actions) {
      if (record.expiresAtMs <= now) this.#actions.delete(key);
    }
  }
}

export interface LocalIssueReviewStoreOptions {
  id?: () => string;
  now?: () => number;
}

/**
 * Ephemeral, connector-local review list. It deliberately stores only the
 * strict issue draft, never the source receipt, page content, or tool result.
 */
export class LocalIssueReviewStore {
  readonly #id: () => string;
  readonly #now: () => number;
  readonly #items = new Map<string, LocalIssueReviewItem[]>();

  constructor(options: LocalIssueReviewStoreOptions = {}) {
    this.#id = options.id ?? randomUUID;
    this.#now = options.now ?? Date.now;
  }

  save(scopeValue: string, draft: PrivacySafeIssueDraft) {
    const scope = boundedScope(scopeValue);
    const safeDraft = createPrivacySafeIssueDraft({
      context: draft.context,
      category: draft.category,
      severity: draft.severity,
      stage: draft.stage,
      ...(draft.context === 'public-web'
        ? { siteOrigin: draft.siteOrigin }
        : {}),
    });
    if (safeDraft.context !== 'synthetic-lab') {
      throw new Error(
        'This local workbench currently accepts synthetic lesson drafts only.',
      );
    }
    const item: LocalIssueReviewItem = Object.freeze({
      schemaVersion: LOCAL_ISSUE_REVIEW_SCHEMA_VERSION,
      id: this.#id(),
      savedAt: new Date(this.#now()).toISOString(),
      reviewState: 'local-only',
      draft: safeDraft,
    });
    const current = this.#items.get(scope) ?? [];
    this.#items.set(scope, [...current.slice(-11), item]);
    while (this.#items.size > 32) {
      const oldest = this.#items.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#items.delete(oldest);
    }
    return item;
  }

  list(scopeValue: string) {
    const scope = boundedScope(scopeValue);
    return [...(this.#items.get(scope) ?? [])].reverse();
  }

  revokeScope(scopeValue: string) {
    this.#items.delete(boundedScope(scopeValue));
  }

  dispose() {
    this.#items.clear();
  }
}
