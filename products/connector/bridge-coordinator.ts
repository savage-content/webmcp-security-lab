import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { canonicalJson } from '../../lib/capability-core';
import { isApprovedCapabilityToolName } from './lesson-capability-policy';

export { APPROVED_CAPABILITY_TOOL_PATTERN } from './lesson-capability-policy';

export type BridgeCommand =
  | {
      id: string;
      kind: 'inspect-tools';
      issuedAt: string;
    }
  | {
      id: string;
      kind: 'invoke-approved-capability';
      issuedAt: string;
      toolName: string;
      arguments: Record<string, never>;
    };

export interface BridgeCommandResult {
  commandId: string;
  observedAt: string;
  observedOrigin: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

export interface BridgeResultCommitment {
  receiptEntryId: string;
}

export class TerminalBridgeResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalBridgeResultError';
  }
}

export interface AcceptedBridgeCommandResult extends BridgeCommandResult {
  commitment?: BridgeResultCommitment;
}

interface InternalSession {
  id: string;
  bridgeTokenHash: Buffer;
  origin: string;
  pageUrl: string;
  clientLabel: string;
  pairedAt: string;
  lastSeenAt: string;
  queue: BridgeCommand[];
  inFlight: BridgeCommand | null;
  awaitingAcknowledgement: string | null;
}

interface PendingCommand {
  sessionId: string;
  resolve: (result: AcceptedBridgeCommandResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface CompletedCommand {
  sessionId: string;
  command: BridgeCommand;
  canonicalResult: string;
}

interface CommittingCommand {
  sessionId: string;
  command: BridgeCommand;
  result: BridgeCommandResult;
  canonicalResult: string;
  attempt: Promise<void> | null;
  waiter: Promise<void> | null;
}

interface RejectedCommand {
  sessionId: string;
  command: BridgeCommand;
  canonicalResult: string;
}

export interface PairedPageSummary {
  sessionId: string;
  origin: string;
  pageUrl: string;
  clientLabel: string;
  pairedAt: string;
  lastSeenAt: string;
  connected: boolean;
}

export interface PairPageInput {
  pairCode: string;
  origin: string;
  pageUrl: string;
  clientLabel: string;
}

export interface BridgeCoordinatorOptions {
  pairCode?: string;
  allowedOrigins: string[];
  commandTimeoutMs?: number;
  connectedWindowMs?: number;
  now?: () => number;
  sessionId?: () => string;
  bridgeToken?: () => string;
  nextPairCode?: () => string;
  commandId?: () => string;
  onPairCodeRotated?: (pairCode: string) => void;
  commitResult?: (context: {
    command: BridgeCommand;
    result: BridgeCommandResult;
    page: PairedPageSummary;
  }) => Promise<BridgeResultCommitment | undefined>;
}

function defaultPairCode() {
  return randomInt(10_000_000, 100_000_000).toString();
}

function tokenDigest(token: string) {
  return createHash('sha256').update(token, 'utf8').digest();
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function normalizedOrigin(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) page origins can be paired.');
  }
  return url.origin;
}

export class BridgeCoordinator {
  #pairCode: string;
  readonly #allowedOrigins: Set<string>;
  readonly #commandTimeoutMs: number;
  readonly #connectedWindowMs: number;
  readonly #now: () => number;
  readonly #sessionId: () => string;
  readonly #bridgeToken: () => string;
  readonly #nextPairCode: () => string;
  readonly #commandId: () => string;
  readonly #onPairCodeRotated?: (pairCode: string) => void;
  readonly #commitResult?: BridgeCoordinatorOptions['commitResult'];
  readonly #sessions = new Map<string, InternalSession>();
  readonly #pending = new Map<string, PendingCommand>();
  readonly #completed = new Map<string, CompletedCommand>();
  readonly #committing = new Map<string, CommittingCommand>();
  readonly #rejected = new Map<string, RejectedCommand>();

  constructor(options: BridgeCoordinatorOptions) {
    if (options.allowedOrigins.length === 0) {
      throw new Error('At least one exact page origin must be allowed.');
    }
    if (
      options.pairCode !== undefined &&
      options.pairCode.trim().length === 0
    ) {
      throw new Error('Pair code must be a non-empty string when configured.');
    }
    this.#pairCode = options.pairCode ?? defaultPairCode();
    this.#allowedOrigins = new Set(
      options.allowedOrigins.map(normalizedOrigin),
    );
    this.#commandTimeoutMs = options.commandTimeoutMs ?? 20_000;
    this.#connectedWindowMs = options.connectedWindowMs ?? 5_000;
    this.#now = options.now ?? Date.now;
    this.#sessionId = options.sessionId ?? randomUUID;
    this.#bridgeToken =
      options.bridgeToken ??
      (() => Buffer.from(randomBytes(32)).toString('base64url'));
    this.#nextPairCode = options.nextPairCode ?? defaultPairCode;
    this.#commandId = options.commandId ?? randomUUID;
    this.#onPairCodeRotated = options.onPairCodeRotated;
    this.#commitResult = options.commitResult;
  }

  get pairCode() {
    return this.#pairCode;
  }

  pair(input: PairPageInput) {
    if (!safeEqual(tokenDigest(input.pairCode), tokenDigest(this.#pairCode))) {
      throw new Error('The one-time pairing code is invalid or has expired.');
    }

    const pageUrl = new URL(input.pageUrl);
    const origin = normalizedOrigin(input.origin);
    if (pageUrl.origin !== origin) {
      throw new Error('The reported page URL and origin do not match.');
    }
    if (pageUrl.username || pageUrl.password) {
      throw new Error('Page URLs containing credentials cannot be paired.');
    }
    if (!this.#allowedOrigins.has(origin)) {
      throw new Error(`Pairing is not allowed for origin ${origin}.`);
    }
    // The connector records only the approved origin and path. Query values and
    // fragments can contain secrets and are checked ephemerally by the browser
    // extension instead of being persisted in the pairing or receipt ledger.
    pageUrl.search = '';
    pageUrl.hash = '';
    const clientLabel = input.clientLabel.trim();
    if (clientLabel.length < 1 || clientLabel.length > 80) {
      throw new Error('Client label must contain 1 to 80 characters.');
    }

    const pairedAt = new Date(this.#now()).toISOString();
    const id = this.#sessionId();
    const bridgeToken = this.#bridgeToken();
    this.#sessions.set(id, {
      id,
      bridgeTokenHash: tokenDigest(bridgeToken),
      origin,
      pageUrl: pageUrl.toString(),
      clientLabel,
      pairedAt,
      lastSeenAt: pairedAt,
      queue: [],
      inFlight: null,
      awaitingAcknowledgement: null,
    });

    this.#pairCode = this.#nextPairCode();
    this.#onPairCodeRotated?.(this.#pairCode);
    return {
      sessionId: id,
      bridgeToken,
      origin,
      pageUrl: pageUrl.toString(),
      pairedAt,
    };
  }

  authenticate(sessionId: string, bridgeToken: string) {
    const session = this.#sessions.get(sessionId);
    if (
      !session ||
      !safeEqual(tokenDigest(bridgeToken), session.bridgeTokenHash)
    ) {
      throw new Error('Bridge session authentication failed.');
    }
    return session;
  }

  heartbeat(sessionId: string, bridgeToken: string) {
    const session = this.authenticate(sessionId, bridgeToken);
    session.lastSeenAt = new Date(this.#now()).toISOString();
    return this.toSummary(session);
  }

  poll(sessionId: string, bridgeToken: string) {
    const session = this.authenticate(sessionId, bridgeToken);
    session.lastSeenAt = new Date(this.#now()).toISOString();
    if (session.awaitingAcknowledgement) {
      this.#completed.delete(session.awaitingAcknowledgement);
      session.awaitingAcknowledgement = null;
    }
    if (!session.inFlight) {
      const next = session.queue[0];
      if (next) {
        session.inFlight = next;
        session.queue = session.queue.slice(1);
        const pending = this.#pending.get(next.id);
        if (pending?.sessionId === sessionId) {
          clearTimeout(pending.timer);
          pending.timer = this.commandTimer(session, next.id);
        }
      }
    }
    // Once a result is latched, the page must retry that exact result rather
    // than receiving and executing the command again while receipt commitment
    // is still pending or retryable.
    if (session.inFlight && this.#committing.has(session.inFlight.id)) {
      return null;
    }
    return session.inFlight ? structuredClone(session.inFlight) : null;
  }

  complete(
    sessionId: string,
    bridgeToken: string,
    result: BridgeCommandResult,
  ) {
    const session = this.authenticate(sessionId, bridgeToken);

    const completed = this.#completed.get(result.commandId);
    if (completed) {
      if (completed.sessionId !== sessionId) {
        throw new Error('The command belongs to a different bridge session.');
      }
      this.assertResultBinding(session, completed.command, result);
      if (canonicalJson(result) !== completed.canonicalResult) {
        throw new Error(
          'A different result was already accepted for this command.',
        );
      }
      session.lastSeenAt = new Date(this.#now()).toISOString();
      return;
    }

    const rejected = this.#rejected.get(result.commandId);
    if (rejected) {
      if (rejected.sessionId !== sessionId) {
        throw new Error('The command belongs to a different bridge session.');
      }
      this.assertResultBinding(session, rejected.command, result);
      if (canonicalJson(result) !== rejected.canonicalResult) {
        throw new Error(
          'A different result was already rejected for this command.',
        );
      }
      throw new Error(
        'The command result was permanently rejected by connector validation.',
      );
    }

    const committing = this.#committing.get(result.commandId);
    if (committing) {
      if (committing.sessionId !== sessionId) {
        throw new Error('The command belongs to a different bridge session.');
      }
      this.assertResultBinding(session, committing.command, result);
      if (canonicalJson(result) !== committing.canonicalResult) {
        throw new Error(
          'A different result is already being committed for this command.',
        );
      }
      const pending = this.#pending.get(result.commandId);
      if (!pending || pending.sessionId !== sessionId) {
        throw new Error('The command result is no longer pending.');
      }
      return this.waitForCommit(session, pending, committing);
    }

    const pending = this.#pending.get(result.commandId);
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error('The command is unknown, expired, or already completed.');
    }
    const command = session.inFlight;
    if (!command || command.id !== result.commandId) {
      throw new Error('The command has not been delivered to this page.');
    }
    this.assertResultBinding(session, command, result);
    const canonicalResult = canonicalJson(result);

    if (this.#commitResult) {
      clearTimeout(pending.timer);
      const committing: CommittingCommand = {
        sessionId,
        command: structuredClone(command),
        result: structuredClone(result),
        canonicalResult,
        attempt: null,
        waiter: null,
      };
      this.#committing.set(result.commandId, committing);
      return this.waitForCommit(session, pending, committing);
    }

    this.finalizeCompletion(session, pending, command, result, canonicalResult);
  }

  private finalizeCompletion(
    session: InternalSession,
    pending: PendingCommand,
    command: BridgeCommand,
    result: BridgeCommandResult,
    canonicalResult: string,
    commitment?: BridgeResultCommitment,
  ) {
    if (
      this.#pending.get(result.commandId) !== pending ||
      session.inFlight?.id !== command.id
    ) {
      throw new Error('The command expired before its result was committed.');
    }

    clearTimeout(pending.timer);
    this.#pending.delete(result.commandId);
    session.inFlight = null;
    this.#completed.set(result.commandId, {
      sessionId: session.id,
      command: structuredClone(command),
      canonicalResult,
    });
    session.awaitingAcknowledgement = result.commandId;
    session.lastSeenAt = new Date(this.#now()).toISOString();
    if (result.ok) {
      pending.resolve({
        ...structuredClone(result),
        ...(commitment ? { commitment: structuredClone(commitment) } : {}),
      });
    } else {
      pending.reject(
        new Error(
          'The paired page reported that the command failed. Page-supplied error text was omitted as untrusted data.',
        ),
      );
    }
  }

  private waitForCommit(
    session: InternalSession,
    pending: PendingCommand,
    committing: CommittingCommand,
  ) {
    if (committing.waiter) return committing.waiter;
    const attempt = this.ensureCommitAttempt(session, pending, committing);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const commitTimeout = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error('Timed out validating and committing the bridge result.'),
          ),
        this.#commandTimeoutMs,
      );
    });
    const waiter = Promise.race([attempt, commitTimeout]).finally(() => {
      if (timeout) clearTimeout(timeout);
      if (committing.waiter === waiter) committing.waiter = null;
    });
    committing.waiter = waiter;
    return waiter;
  }

  private ensureCommitAttempt(
    session: InternalSession,
    pending: PendingCommand,
    committing: CommittingCommand,
  ) {
    if (committing.attempt) return committing.attempt;
    clearTimeout(pending.timer);
    const attempt = Promise.resolve()
      .then(() =>
        this.#commitResult?.({
          command: structuredClone(committing.command),
          result: structuredClone(committing.result),
          page: this.toSummary(session),
        }),
      )
      .then((commitment) => {
        if (this.#committing.get(committing.command.id) !== committing) return;
        this.finalizeCompletion(
          session,
          pending,
          committing.command,
          committing.result,
          committing.canonicalResult,
          commitment,
        );
        this.#committing.delete(committing.command.id);
      })
      .catch((error: unknown) => {
        if (this.#committing.get(committing.command.id) === committing) {
          committing.attempt = null;
          if (error instanceof TerminalBridgeResultError) {
            this.rejectCompletion(session, pending, committing);
          } else {
            // Keep the canonical result and in-flight command latched. The
            // extension can retry delivery without invoking the page again.
            pending.timer = this.commandTimer(session, committing.command.id);
          }
        }
        throw error;
      });
    committing.attempt = attempt;
    return attempt;
  }

  private rejectCompletion(
    session: InternalSession,
    pending: PendingCommand,
    committing: CommittingCommand,
  ) {
    const command = committing.command;
    if (this.#pending.get(command.id) !== pending) return;
    clearTimeout(pending.timer);
    this.#committing.delete(command.id);
    this.#pending.delete(command.id);
    session.queue = session.queue.filter((item) => item.id !== command.id);
    if (session.inFlight?.id === command.id) session.inFlight = null;
    this.#rejected.set(command.id, {
      sessionId: session.id,
      command: structuredClone(command),
      canonicalResult: committing.canonicalResult,
    });
    pending.reject(
      new Error(
        'The bridge result failed connector validation or receipt commitment; no acknowledgement was issued.',
      ),
    );
  }

  listPairedPages() {
    return [...this.#sessions.values()].map((session) =>
      this.toSummary(session),
    );
  }

  getPairedPage(sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error('The paired page session was not found.');
    return this.toSummary(session);
  }

  revoke(sessionId: string, bridgeToken: string) {
    const session = this.authenticate(sessionId, bridgeToken);
    this.#sessions.delete(sessionId);
    for (const [commandId, pending] of this.#pending) {
      if (pending.sessionId !== sessionId) continue;
      clearTimeout(pending.timer);
      this.#pending.delete(commandId);
      this.#committing.delete(commandId);
      pending.reject(new Error('The paired browser session was revoked.'));
    }
    for (const [commandId, completed] of this.#completed) {
      if (completed.sessionId === sessionId) this.#completed.delete(commandId);
    }
    for (const [commandId, rejected] of this.#rejected) {
      if (rejected.sessionId === sessionId) this.#rejected.delete(commandId);
    }
    return this.toSummary(session);
  }

  requestInspection(sessionId: string) {
    return this.enqueue(sessionId, {
      id: this.#commandId(),
      kind: 'inspect-tools',
      issuedAt: new Date(this.#now()).toISOString(),
    });
  }

  requestApprovedInvocation(sessionId: string, toolName: string) {
    if (!isApprovedCapabilityToolName(toolName)) {
      throw new Error(
        'Only a generated one-use capability from the built-in lesson registry may be invoked.',
      );
    }
    return this.enqueue(sessionId, {
      id: this.#commandId(),
      kind: 'invoke-approved-capability',
      issuedAt: new Date(this.#now()).toISOString(),
      toolName,
      arguments: {},
    });
  }

  dispose() {
    for (const [commandId, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('The connector is shutting down.'));
      this.#pending.delete(commandId);
    }
    this.#completed.clear();
    this.#committing.clear();
    this.#rejected.clear();
    this.#sessions.clear();
  }

  private enqueue(sessionId: string, command: BridgeCommand) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error('The paired page session was not found.');
    if (
      this.#now() - Date.parse(session.lastSeenAt) >
      this.#connectedWindowMs
    ) {
      throw new Error('The paired page is not currently connected.');
    }
    if (
      [...this.#pending.values()].some((item) => item.sessionId === sessionId)
    ) {
      throw new Error('That page already has a command in progress.');
    }
    if (
      this.#pending.has(command.id) ||
      this.#completed.has(command.id) ||
      this.#committing.has(command.id) ||
      this.#rejected.has(command.id)
    ) {
      throw new Error('The generated command identity is not unique.');
    }
    for (const [commandId, rejected] of this.#rejected) {
      if (rejected.sessionId === sessionId) this.#rejected.delete(commandId);
    }

    return new Promise<AcceptedBridgeCommandResult>((resolve, reject) => {
      const timer = this.commandTimer(session, command.id);
      this.#pending.set(command.id, { sessionId, resolve, reject, timer });
      session.queue.push(command);
    });
  }

  private commandTimer(session: InternalSession, commandId: string) {
    return setTimeout(() => {
      const pending = this.#pending.get(commandId);
      if (!pending || pending.sessionId !== session.id) return;
      const committing = this.#committing.get(commandId);
      if (committing) {
        this.#committing.delete(commandId);
        this.#rejected.set(commandId, {
          sessionId: session.id,
          command: structuredClone(committing.command),
          canonicalResult: committing.canonicalResult,
        });
      }
      this.#pending.delete(commandId);
      session.queue = session.queue.filter((item) => item.id !== commandId);
      if (session.inFlight?.id === commandId) session.inFlight = null;
      pending.reject(
        new Error('Timed out waiting for the paired browser page.'),
      );
    }, this.#commandTimeoutMs);
  }

  private assertResultBinding(
    session: InternalSession,
    command: BridgeCommand,
    result: BridgeCommandResult,
  ) {
    if (result.observedOrigin !== session.origin) {
      throw new Error('The command result came from a different page origin.');
    }
    if (!Number.isFinite(Date.parse(result.observedAt))) {
      throw new Error('The command result requires an ISO observation time.');
    }
    if (result.ok) {
      if (result.error !== undefined) {
        throw new Error('A successful command result cannot contain an error.');
      }
      if (
        !result.payload ||
        typeof result.payload !== 'object' ||
        Array.isArray(result.payload) ||
        (result.payload as Record<string, unknown>).origin !== session.origin ||
        (result.payload as Record<string, unknown>).pageUrl !== session.pageUrl
      ) {
        throw new Error(
          'The successful command payload has a different paired page identity.',
        );
      }
      if (
        command.kind === 'invoke-approved-capability' &&
        (result.payload as Record<string, unknown>).toolName !==
          command.toolName
      ) {
        throw new Error('The command result names a different capability.');
      }
      return;
    }
    if (result.payload !== undefined) {
      throw new Error('A failed command result cannot contain a payload.');
    }
  }

  private toSummary(session: InternalSession): PairedPageSummary {
    return {
      sessionId: session.id,
      origin: session.origin,
      pageUrl: session.pageUrl,
      clientLabel: session.clientLabel,
      pairedAt: session.pairedAt,
      lastSeenAt: session.lastSeenAt,
      connected:
        this.#now() - Date.parse(session.lastSeenAt) <= this.#connectedWindowMs,
    };
  }
}
