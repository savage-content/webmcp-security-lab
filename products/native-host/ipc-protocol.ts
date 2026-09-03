import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { canonicalJson } from '../../lib/capability-core';
import {
  parseNativeBridgeRequest,
  parseNativeBridgeResponse,
  type NativeBridgeRequest,
  type NativeBridgeResponse,
} from './native-messaging';

export const LOCAL_GUARD_IPC_SCHEMA = 'leftout.local-guard-ipc-envelope/1';
export const LOCAL_GUARD_IPC_MAX_BYTES = 2 * 1024 * 1024;
export const LOCAL_GUARD_IPC_DEFAULT_MAX_SKEW_MS = 30_000;
export const LOCAL_GUARD_IPC_SECRET_MIN_BYTES = 32;
export const LOCAL_GUARD_IPC_SECRET_MAX_BYTES = 64;

const uuidSchema = z.uuid();
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{22,86}$/u);
const macSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
const issuedAtSchema = z.iso.datetime({ offset: true });

const requestEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(LOCAL_GUARD_IPC_SCHEMA),
    direction: z.literal('request'),
    requestId: uuidSchema,
    nonce: nonceSchema,
    issuedAt: issuedAtSchema,
    message: z.unknown(),
    mac: macSchema,
  })
  .strict();

const responseEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(LOCAL_GUARD_IPC_SCHEMA),
    direction: z.literal('response'),
    requestId: uuidSchema,
    requestNonce: nonceSchema,
    issuedAt: issuedAtSchema,
    message: z.unknown(),
    mac: macSchema,
  })
  .strict();

export interface VerifiedIpcRequest {
  envelope: z.infer<typeof requestEnvelopeSchema>;
  message: NativeBridgeRequest;
}

export interface VerifiedIpcResponse {
  envelope: z.infer<typeof responseEnvelopeSchema>;
  message: NativeBridgeResponse;
}

function boundedInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function normalizedSecret(secret: Uint8Array) {
  const value = Buffer.from(secret);
  if (
    value.byteLength < LOCAL_GUARD_IPC_SECRET_MIN_BYTES ||
    value.byteLength > LOCAL_GUARD_IPC_SECRET_MAX_BYTES
  ) {
    throw new Error('Local Guard IPC secret must contain 32 to 64 bytes.');
  }
  return value;
}

export function validateLocalGuardIpcSecret(secret: Uint8Array) {
  return normalizedSecret(secret);
}

export function decodeLocalGuardIpcSecret(value: string) {
  if (!/^[A-Za-z0-9_-]{43,86}$/u.test(value)) {
    throw new Error('Local Guard IPC secret is not canonical base64url.');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Local Guard IPC secret is not canonical base64url.');
  }
  return normalizedSecret(decoded);
}

export function generateLocalGuardIpcSecret() {
  return Buffer.from(randomBytes(LOCAL_GUARD_IPC_SECRET_MIN_BYTES)).toString(
    'base64url',
  );
}

function unsignedEnvelope(value: Record<string, unknown>) {
  const { mac: _mac, ...unsigned } = value;
  return unsigned;
}

function envelopeMac(value: Record<string, unknown>, secret: Uint8Array) {
  return createHmac('sha256', normalizedSecret(secret))
    .update(canonicalJson(unsignedEnvelope(value)), 'utf8')
    .digest();
}

function parseMac(value: string) {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength !== 32 || decoded.toString('base64url') !== value) {
    throw new Error('Local Guard IPC MAC is malformed.');
  }
  return decoded;
}

function verifyMac(value: Record<string, unknown>, secret: Uint8Array) {
  const supplied = parseMac(String(value.mac));
  const expected = envelopeMac(value, secret);
  if (
    supplied.byteLength !== expected.byteLength ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new Error('Local Guard IPC authentication failed.');
  }
}

function assertFresh(issuedAt: string, now: number, maxSkewMs: number) {
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued) || Math.abs(now - issued) > maxSkewMs) {
    throw new Error('Local Guard IPC message is stale or future-dated.');
  }
}

export class LocalGuardIpcReplayWindow {
  readonly #maxSkewMs: number;
  readonly #maxEntries: number;
  readonly #seen = new Map<string, number>();

  constructor(options: { maxSkewMs?: number; maxEntries?: number } = {}) {
    this.#maxSkewMs = boundedInteger(
      options.maxSkewMs ?? LOCAL_GUARD_IPC_DEFAULT_MAX_SKEW_MS,
      'IPC replay-window skew',
    );
    this.#maxEntries = boundedInteger(
      options.maxEntries ?? 2048,
      'IPC replay-window capacity',
    );
  }

  consume(nonce: string, issuedAt: string, now = Date.now()) {
    assertFresh(issuedAt, now, this.#maxSkewMs);
    for (const [knownNonce, expiresAt] of this.#seen) {
      if (expiresAt < now) this.#seen.delete(knownNonce);
    }
    if (this.#seen.has(nonce)) {
      throw new Error('Local Guard IPC replay was rejected.');
    }
    if (this.#seen.size >= this.#maxEntries) {
      throw new Error('Local Guard IPC replay window is at capacity.');
    }
    this.#seen.set(nonce, now + this.#maxSkewMs);
  }
}

export function createLocalGuardIpcRequest(
  message: NativeBridgeRequest,
  secret: Uint8Array,
  options: { now?: number; nonce?: string } = {},
) {
  const parsed = parseNativeBridgeRequest(message);
  const unsigned = requestEnvelopeSchema.omit({ mac: true }).parse({
    schemaVersion: LOCAL_GUARD_IPC_SCHEMA,
    direction: 'request',
    requestId: parsed.requestId,
    nonce:
      options.nonce ??
      Buffer.from(randomBytes(LOCAL_GUARD_IPC_SECRET_MIN_BYTES)).toString(
        'base64url',
      ),
    issuedAt: new Date(options.now ?? Date.now()).toISOString(),
    message: parsed,
  });
  return requestEnvelopeSchema.parse({
    ...unsigned,
    mac: Buffer.from(envelopeMac(unsigned, secret)).toString('base64url'),
  });
}

export function verifyLocalGuardIpcRequest(
  value: unknown,
  secret: Uint8Array,
  replayWindow: LocalGuardIpcReplayWindow,
  options: { now?: number } = {},
): VerifiedIpcRequest {
  const envelope = requestEnvelopeSchema.parse(value);
  verifyMac(envelope, secret);
  replayWindow.consume(
    envelope.nonce,
    envelope.issuedAt,
    options.now ?? Date.now(),
  );
  const message = parseNativeBridgeRequest(envelope.message);
  if (message.requestId !== envelope.requestId) {
    throw new Error('Local Guard IPC request identity is inconsistent.');
  }
  return { envelope, message };
}

export function createLocalGuardIpcResponse(
  request: VerifiedIpcRequest,
  message: NativeBridgeResponse,
  secret: Uint8Array,
  options: { now?: number } = {},
) {
  const parsed = parseNativeBridgeResponse(message, request.message.requestId);
  const unsigned = responseEnvelopeSchema.omit({ mac: true }).parse({
    schemaVersion: LOCAL_GUARD_IPC_SCHEMA,
    direction: 'response',
    requestId: request.message.requestId,
    requestNonce: request.envelope.nonce,
    issuedAt: new Date(options.now ?? Date.now()).toISOString(),
    message: parsed,
  });
  return responseEnvelopeSchema.parse({
    ...unsigned,
    mac: Buffer.from(envelopeMac(unsigned, secret)).toString('base64url'),
  });
}

export function verifyLocalGuardIpcResponse(
  value: unknown,
  request: z.infer<typeof requestEnvelopeSchema>,
  secret: Uint8Array,
  options: { now?: number; maxSkewMs?: number } = {},
): VerifiedIpcResponse {
  const envelope = responseEnvelopeSchema.parse(value);
  verifyMac(envelope, secret);
  assertFresh(
    envelope.issuedAt,
    options.now ?? Date.now(),
    boundedInteger(
      options.maxSkewMs ?? LOCAL_GUARD_IPC_DEFAULT_MAX_SKEW_MS,
      'IPC response skew',
    ),
  );
  if (
    envelope.requestId !== request.requestId ||
    envelope.requestNonce !== request.nonce
  ) {
    throw new Error('Local Guard IPC response does not match the request.');
  }
  const message = parseNativeBridgeResponse(
    envelope.message,
    request.requestId,
  );
  return { envelope, message };
}

function encodedJson(value: unknown) {
  let body: Buffer;
  try {
    body = Buffer.from(JSON.stringify(value), 'utf8');
  } catch {
    throw new Error('Local Guard IPC message is not JSON serializable.');
  }
  if (body.byteLength === 0 || body.byteLength > LOCAL_GUARD_IPC_MAX_BYTES) {
    throw new Error('Local Guard IPC message exceeds its byte boundary.');
  }
  return body;
}

export function encodeLocalGuardIpcFrame(value: unknown) {
  const body = encodedJson(value);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.byteLength, 0);
  return Buffer.concat([header, body]);
}

export function decodeLocalGuardIpcFrame(frame: Uint8Array) {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(frame),
    ) as unknown;
  } catch {
    throw new Error('Local Guard IPC frame is not valid UTF-8 JSON.');
  }
}

export class LocalGuardIpcFrameDecoder {
  #buffer = Buffer.alloc(0);

  push(chunk: Uint8Array) {
    if (chunk.byteLength === 0) return [];
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const frames: Buffer[] = [];
    while (this.#buffer.byteLength >= 4) {
      const length = this.#buffer.readUInt32BE(0);
      if (length === 0 || length > LOCAL_GUARD_IPC_MAX_BYTES) {
        this.#buffer = Buffer.alloc(0);
        throw new Error('Local Guard IPC frame length is outside policy.');
      }
      if (this.#buffer.byteLength < length + 4) break;
      frames.push(Buffer.from(this.#buffer.subarray(4, length + 4)));
      this.#buffer = Buffer.from(this.#buffer.subarray(length + 4));
    }
    if (this.#buffer.byteLength > LOCAL_GUARD_IPC_MAX_BYTES + 4) {
      this.#buffer = Buffer.alloc(0);
      throw new Error('Buffered Local Guard IPC data exceeds policy.');
    }
    return frames;
  }

  finish() {
    if (this.#buffer.byteLength !== 0) {
      this.#buffer = Buffer.alloc(0);
      throw new Error('Local Guard IPC stream ended mid-frame.');
    }
  }
}
