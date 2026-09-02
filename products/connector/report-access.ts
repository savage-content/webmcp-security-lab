import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const REPORT_SESSION_COOKIE = 'leftout_report_session';

export type LocalPageTarget = '/setup' | '/receipts' | '/issues/preview';

interface LaunchTicketRecord {
  expiresAtMs: number;
  target: LocalPageTarget;
  binding?: string;
}

interface ReportSessionRecord {
  expiresAtMs: number;
  allowedTargets: LocalPageTarget[];
  binding?: string;
}

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

export interface ReportAccessManagerOptions {
  now?: () => number;
  secret?: () => string;
  ticketTtlMs?: number;
  sessionTtlMs?: number;
}

export class ReportAccessManager {
  readonly #now: () => number;
  readonly #secret: () => string;
  readonly #ticketTtlMs: number;
  readonly #sessionTtlMs: number;
  readonly #tickets = new Map<string, LaunchTicketRecord>();
  readonly #sessions = new Map<string, ReportSessionRecord>();

  constructor(options: ReportAccessManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#secret = options.secret ?? randomSecret;
    this.#ticketTtlMs = options.ticketTtlMs ?? 60_000;
    this.#sessionTtlMs = options.sessionTtlMs ?? 15 * 60_000;
    if (this.#ticketTtlMs < 1_000 || this.#ticketTtlMs > 5 * 60_000) {
      throw new Error('Report launch-ticket TTL must be 1 to 300 seconds.');
    }
    if (this.#sessionTtlMs < 60_000 || this.#sessionTtlMs > 60 * 60_000) {
      throw new Error('Report session TTL must be 1 to 60 minutes.');
    }
  }

  issue(target: LocalPageTarget, binding?: string) {
    this.cleanup();
    while (this.#tickets.size >= 32) {
      const oldest = this.#tickets.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#tickets.delete(oldest);
    }
    const ticket = this.#secret();
    const expiresAtMs = this.#now() + this.#ticketTtlMs;
    this.#tickets.set(digest(ticket), {
      target,
      expiresAtMs,
      ...(binding ? { binding } : {}),
    });
    return {
      ticket,
      target,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  consume(ticket: string) {
    this.cleanup();
    const key = digest(ticket);
    const record = this.#tickets.get(key);
    this.#tickets.delete(key);
    if (!record || record.expiresAtMs <= this.#now()) {
      throw new Error('The local launch ticket is invalid or expired.');
    }

    const sessionToken = this.#secret();
    const expiresAtMs = this.#now() + this.#sessionTtlMs;
    while (this.#sessions.size >= 32) {
      const oldest = this.#sessions.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#sessions.delete(oldest);
    }
    this.#sessions.set(digest(sessionToken), {
      expiresAtMs,
      allowedTargets:
        record.target === '/setup'
          ? ['/setup', '/receipts', '/issues/preview']
          : record.target === '/receipts'
            ? ['/receipts', '/issues/preview']
            : ['/issues/preview'],
      ...(record.binding ? { binding: record.binding } : {}),
    });
    return {
      sessionToken,
      target: record.target,
      expiresAt: new Date(expiresAtMs).toISOString(),
      maxAgeSeconds: Math.floor(this.#sessionTtlMs / 1_000),
    };
  }

  authorize(sessionToken: string, target: LocalPageTarget) {
    this.cleanup();
    if (!sessionToken) return undefined;
    const key = digest(sessionToken);
    for (const [candidate, record] of this.#sessions) {
      if (safeEqual(candidate, key)) {
        return record.expiresAtMs > this.#now() &&
          record.allowedTargets.includes(target)
          ? { binding: record.binding }
          : undefined;
      }
    }
    return undefined;
  }

  revokeBinding(binding: string) {
    for (const [key, record] of this.#tickets) {
      if (record.binding === binding) this.#tickets.delete(key);
    }
    for (const [key, record] of this.#sessions) {
      if (record.binding === binding) this.#sessions.delete(key);
    }
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

export function cookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return '';
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 1) continue;
    if (segment.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}
