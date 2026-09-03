import { describe, expect, it } from 'vitest';

import {
  createLocalGuardIpcRequest,
  createLocalGuardIpcResponse,
  decodeLocalGuardIpcFrame,
  decodeLocalGuardIpcSecret,
  encodeLocalGuardIpcFrame,
  generateLocalGuardIpcSecret,
  LocalGuardIpcFrameDecoder,
  LocalGuardIpcReplayWindow,
  verifyLocalGuardIpcRequest,
  verifyLocalGuardIpcResponse,
} from '../products/native-host/ipc-protocol';
import {
  NATIVE_MESSAGE_SCHEMA,
  successNativeBridgeResponse,
} from '../products/native-host/native-messaging';

const NOW = Date.parse('2026-09-02T18:00:00.000Z');
const SECRET = Buffer.from('a'.repeat(32));
const REQUEST_ID = '5af587fe-f44c-4ab0-8243-7b63d348f612';
const NONCE = Buffer.from('b'.repeat(32)).toString('base64url');

function request() {
  return {
    schemaVersion: NATIVE_MESSAGE_SCHEMA,
    requestId: REQUEST_ID,
    action: 'pair' as const,
    payload: {
      origin: 'https://left-out.example',
      page_url: 'https://left-out.example/lab',
      client_label: 'Signed Local Guard',
    },
  } as const;
}

describe('authenticated install-owned Local Guard IPC protocol', () => {
  it('accepts one fresh authenticated request and rejects replay', () => {
    const envelope = createLocalGuardIpcRequest(request(), SECRET, {
      now: NOW,
      nonce: NONCE,
    });
    const replayWindow = new LocalGuardIpcReplayWindow();
    expect(
      verifyLocalGuardIpcRequest(envelope, SECRET, replayWindow, { now: NOW })
        .message,
    ).toEqual(request());
    expect(() =>
      verifyLocalGuardIpcRequest(envelope, SECRET, replayWindow, { now: NOW }),
    ).toThrow('replay');
  });

  it('rejects altered, unknown, stale, future-dated, or wrongly keyed requests', () => {
    const envelope = createLocalGuardIpcRequest(request(), SECRET, {
      now: NOW,
      nonce: NONCE,
    });
    expect(() =>
      verifyLocalGuardIpcRequest(
        { ...envelope, message: { ...request(), action: 'poll' } },
        SECRET,
        new LocalGuardIpcReplayWindow(),
        { now: NOW },
      ),
    ).toThrow('authentication');
    expect(() =>
      verifyLocalGuardIpcRequest(
        { ...envelope, hidden: true },
        SECRET,
        new LocalGuardIpcReplayWindow(),
        { now: NOW },
      ),
    ).toThrow();
    expect(() =>
      verifyLocalGuardIpcRequest(
        envelope,
        Buffer.from('z'.repeat(32)),
        new LocalGuardIpcReplayWindow(),
        { now: NOW },
      ),
    ).toThrow('authentication');
    expect(() =>
      verifyLocalGuardIpcRequest(
        envelope,
        SECRET,
        new LocalGuardIpcReplayWindow(),
        { now: NOW + 30_001 },
      ),
    ).toThrow('stale or future-dated');
    expect(() =>
      verifyLocalGuardIpcRequest(
        envelope,
        SECRET,
        new LocalGuardIpcReplayWindow(),
        { now: NOW - 30_001 },
      ),
    ).toThrow('stale or future-dated');
  });

  it('binds a signed response to the exact request identity and nonce', () => {
    const envelope = createLocalGuardIpcRequest(request(), SECRET, {
      now: NOW,
      nonce: NONCE,
    });
    const verifiedRequest = verifyLocalGuardIpcRequest(
      envelope,
      SECRET,
      new LocalGuardIpcReplayWindow(),
      { now: NOW },
    );
    const response = createLocalGuardIpcResponse(
      verifiedRequest,
      successNativeBridgeResponse(REQUEST_ID, 200, { paired: true }),
      SECRET,
      { now: NOW },
    );
    expect(
      verifyLocalGuardIpcResponse(response, envelope, SECRET, { now: NOW })
        .message,
    ).toMatchObject({ ok: true, requestId: REQUEST_ID });
    expect(() =>
      verifyLocalGuardIpcResponse(
        response,
        {
          ...envelope,
          nonce: Buffer.from('c'.repeat(32)).toString('base64url'),
        },
        SECRET,
        { now: NOW },
      ),
    ).toThrow('does not match');
  });

  it('uses a canonical 32-byte secret and bounded unambiguous framing', () => {
    const generated = generateLocalGuardIpcSecret();
    expect(decodeLocalGuardIpcSecret(generated)).toHaveLength(32);
    expect(() => decodeLocalGuardIpcSecret(`${generated}=`)).toThrow(
      'canonical',
    );
    const envelope = createLocalGuardIpcRequest(request(), SECRET, {
      now: NOW,
      nonce: NONCE,
    });
    const frame = encodeLocalGuardIpcFrame(envelope);
    const decoder = new LocalGuardIpcFrameDecoder();
    expect(decoder.push(frame.subarray(0, 5))).toEqual([]);
    const [body] = decoder.push(frame.subarray(5));
    expect(decodeLocalGuardIpcFrame(body)).toEqual(envelope);
    expect(() => decoder.finish()).not.toThrow();
    const invalid = Buffer.alloc(4);
    invalid.writeUInt32BE(0);
    expect(() => new LocalGuardIpcFrameDecoder().push(invalid)).toThrow(
      'outside policy',
    );
  });
});
