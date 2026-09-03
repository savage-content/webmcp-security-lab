import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { allowedIssueModerationTransitions } from '../connector/issue-moderation';
import {
  ISSUE_MODERATION_STATES,
  type IssueModerationState,
} from '../connector/issue-publication';

export const REVIEWER_SESSION_COOKIE = 'leftout_reporting_reviewer_session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REVIEWER_TARGETS = new Set<IssueModerationState>([
  'under_review',
  'needs_evidence',
  'accepted_private',
  'duplicate',
  'rejected',
]);

function randomSecret() {
  return Buffer.from(randomBytes(32)).toString('base64url');
}

function digest(value: string) {
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

function boundedToken(value: string, label: string) {
  if (
    typeof value !== 'string' ||
    value.length < 20 ||
    value.length > 128 ||
    value !== value.trim()
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function boundedScope(value: string) {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error('Reviewer action scope is invalid.');
  }
  return value;
}

function reportId(value: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error('Reviewer report identity is invalid.');
  }
  return value;
}

function reviewCursor(value: string) {
  if (
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    Buffer.from(value, 'base64url').toString('base64url') !== value
  ) {
    throw new Error('Reviewer page cursor is invalid.');
  }
  return value;
}

export interface ReviewerAccessManagerOptions {
  now?: () => number;
  secret?: () => string;
  ticketTtlMs?: number;
  sessionTtlMs?: number;
}

interface LaunchTicket {
  expiresAtMs: number;
}

interface ReviewerSession {
  expiresAtMs: number;
}

export class ReviewerAccessManager {
  readonly #now: () => number;
  readonly #secret: () => string;
  readonly #ticketTtlMs: number;
  readonly #sessionTtlMs: number;
  readonly #tickets = new Map<string, LaunchTicket>();
  readonly #sessions = new Map<string, ReviewerSession>();

  constructor(options: ReviewerAccessManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#secret = options.secret ?? randomSecret;
    this.#ticketTtlMs = options.ticketTtlMs ?? 60_000;
    this.#sessionTtlMs = options.sessionTtlMs ?? 15 * 60_000;
    if (this.#ticketTtlMs < 1_000 || this.#ticketTtlMs > 5 * 60_000) {
      throw new Error('Reviewer launch-ticket TTL must be 1 to 300 seconds.');
    }
    if (this.#sessionTtlMs < 60_000 || this.#sessionTtlMs > 60 * 60_000) {
      throw new Error('Reviewer session TTL must be 1 to 60 minutes.');
    }
  }

  issueLaunchTicket() {
    this.cleanup();
    while (this.#tickets.size >= 8) {
      const oldest = this.#tickets.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#tickets.delete(oldest);
    }
    const token = boundedToken(this.#secret(), 'Reviewer launch ticket');
    const expiresAtMs = this.#now() + this.#ticketTtlMs;
    this.#tickets.set(digest(token), { expiresAtMs });
    return Object.freeze({
      token,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  }

  consumeLaunchTicket(tokenValue: string) {
    this.cleanup();
    const token = boundedToken(tokenValue, 'Reviewer launch ticket');
    const key = digest(token);
    let record: LaunchTicket | undefined;
    let matchedKey: string | undefined;
    for (const [candidate, item] of this.#tickets) {
      if (safeEqual(candidate, key)) {
        record = item;
        matchedKey = candidate;
      }
    }
    if (matchedKey) this.#tickets.delete(matchedKey);
    if (!record || record.expiresAtMs <= this.#now()) {
      throw new Error('Reviewer launch ticket is invalid or expired.');
    }
    const sessionToken = boundedToken(this.#secret(), 'Reviewer session token');
    const expiresAtMs = this.#now() + this.#sessionTtlMs;
    while (this.#sessions.size >= 8) {
      const oldest = this.#sessions.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#sessions.delete(oldest);
    }
    const scope = digest(sessionToken);
    this.#sessions.set(scope, { expiresAtMs });
    return Object.freeze({
      sessionToken,
      scope,
      expiresAt: new Date(expiresAtMs).toISOString(),
      maxAgeSeconds: Math.floor(this.#sessionTtlMs / 1_000),
    });
  }

  authorize(sessionTokenValue: string) {
    this.cleanup();
    if (!sessionTokenValue) return undefined;
    let token: string;
    try {
      token = boundedToken(sessionTokenValue, 'Reviewer session token');
    } catch {
      return undefined;
    }
    const key = digest(token);
    for (const [candidate, record] of this.#sessions) {
      if (safeEqual(candidate, key) && record.expiresAtMs > this.#now()) {
        return Object.freeze({ scope: candidate });
      }
    }
    return undefined;
  }

  revoke(sessionTokenValue: string) {
    const authorization = this.authorize(sessionTokenValue);
    if (authorization) this.#sessions.delete(authorization.scope);
  }

  dispose() {
    this.#tickets.clear();
    this.#sessions.clear();
  }

  private cleanup() {
    const now = this.#now();
    for (const [key, record] of this.#tickets) {
      if (record.expiresAtMs <= now) this.#tickets.delete(key);
    }
    for (const [key, record] of this.#sessions) {
      if (record.expiresAtMs <= now) this.#sessions.delete(key);
    }
  }
}

type ReviewerAction =
  | Readonly<{ kind: 'view'; reportId: string }>
  | Readonly<{ kind: 'page'; cursor: string }>
  | Readonly<{
      kind: 'transition';
      reportId: string;
      expectedRevision: number;
      to: IssueModerationState;
    }>;

interface StoredReviewerAction {
  action: ReviewerAction;
  expiresAtMs: number;
  scope: string;
}

export interface ReviewerActionManagerOptions {
  now?: () => number;
  secret?: () => string;
  ttlMs?: number;
}

export class ReviewerActionManager {
  readonly #now: () => number;
  readonly #secret: () => string;
  readonly #ttlMs: number;
  readonly #actions = new Map<string, StoredReviewerAction>();

  constructor(options: ReviewerActionManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#secret = options.secret ?? randomSecret;
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    if (this.#ttlMs < 1_000 || this.#ttlMs > 10 * 60_000) {
      throw new Error('Reviewer action TTL must be 1 to 600 seconds.');
    }
  }

  issueView(scopeValue: string, reportIdValue: string) {
    return this.issue(scopeValue, {
      kind: 'view',
      reportId: reportId(reportIdValue),
    });
  }

  issuePage(scopeValue: string, cursorValue: string) {
    return this.issue(scopeValue, {
      kind: 'page',
      cursor: reviewCursor(cursorValue),
    });
  }

  issueTransitions(input: {
    scope: string;
    reportId: string;
    expectedRevision: number;
    state: IssueModerationState;
  }) {
    boundedScope(input.scope);
    reportId(input.reportId);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !ISSUE_MODERATION_STATES.includes(input.state)
    ) {
      throw new Error('Reviewer transition source is invalid.');
    }
    return Object.freeze(
      allowedIssueModerationTransitions(input.state)
        .filter((to) => REVIEWER_TARGETS.has(to))
        .map((to) =>
          Object.freeze({
            to,
            token: this.issue(input.scope, {
              kind: 'transition',
              reportId: input.reportId,
              expectedRevision: input.expectedRevision,
              to,
            }),
          }),
        ),
    );
  }

  consume(
    tokenValue: string,
    scopeValue: string,
    kind: ReviewerAction['kind'],
  ) {
    this.cleanup();
    const token = boundedToken(tokenValue, 'Reviewer action token');
    const key = digest(token);
    const record = this.#actions.get(key);
    this.#actions.delete(key);
    const scope = boundedScope(scopeValue);
    if (
      !record ||
      record.expiresAtMs <= this.#now() ||
      record.scope !== scope ||
      record.action.kind !== kind
    ) {
      throw new Error('Reviewer action is invalid or expired.');
    }
    return structuredClone(record.action);
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

  private issue(scopeValue: string, action: ReviewerAction) {
    this.cleanup();
    while (this.#actions.size >= 256) {
      const oldest = this.#actions.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#actions.delete(oldest);
    }
    const scope = boundedScope(scopeValue);
    const token = boundedToken(this.#secret(), 'Reviewer action token');
    this.#actions.set(digest(token), {
      action: structuredClone(action),
      expiresAtMs: this.#now() + this.#ttlMs,
      scope,
    });
    return token;
  }

  private cleanup() {
    const now = this.#now();
    for (const [key, record] of this.#actions) {
      if (record.expiresAtMs <= now) this.#actions.delete(key);
    }
  }
}

export function reviewerCookieValue(cookieHeader: string | undefined) {
  if (!cookieHeader) return '';
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 1) continue;
    if (segment.slice(0, separator).trim() !== REVIEWER_SESSION_COOKIE)
      continue;
    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}
