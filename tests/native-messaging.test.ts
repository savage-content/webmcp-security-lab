import { Readable, Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
  decodeNativeBridgeRequest,
  decodeNativeBridgeResponse,
  encodeNativeMessage,
  errorNativeBridgeResponse,
  expectedExtensionOrigin,
  NativeMessageDecoder,
  NATIVE_MESSAGE_SCHEMA,
  parseNativeBridgeRequest,
  parseNativeBridgeResponse,
  successNativeBridgeResponse,
  verifyNativeCallerOrigin,
} from '../products/native-host/native-messaging';
import { runNativeHostRuntime } from '../products/native-host/runtime';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const REQUEST_ID = '5af587fe-f44c-4ab0-8243-7b63d348f612';
const SESSION_ID = '1420ef15-7b3f-4ed0-9e06-094245ca9bf2';

function pairRequest() {
  return {
    schemaVersion: NATIVE_MESSAGE_SCHEMA,
    requestId: REQUEST_ID,
    action: 'pair' as const,
    payload: {
      origin: 'https://left-out.example',
      page_url: 'https://left-out.example/lab',
      client_label: 'LeftOut signed Local Guard',
    },
  };
}

describe('identity-bound native messaging protocol', () => {
  it('binds the native host to one exact release extension origin', () => {
    expect(expectedExtensionOrigin(EXTENSION_ID)).toBe(
      `chrome-extension://${EXTENSION_ID}/`,
    );
    expect(
      verifyNativeCallerOrigin(
        `chrome-extension://${EXTENSION_ID}/`,
        EXTENSION_ID,
      ),
    ).toBe(`chrome-extension://${EXTENSION_ID}/`);
    expect(() =>
      verifyNativeCallerOrigin(
        'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
        EXTENSION_ID,
      ),
    ).toThrow('does not match');
    expect(() => expectedExtensionOrigin('*'.repeat(32))).toThrow();
  });

  it('accepts only the closed action and payload schemas', () => {
    expect(parseNativeBridgeRequest(pairRequest())).toEqual(pairRequest());
    expect(() =>
      parseNativeBridgeRequest({ ...pairRequest(), hidden: true }),
    ).toThrow();
    expect(() =>
      parseNativeBridgeRequest({
        ...pairRequest(),
        action: 'execute-arbitrary-tool',
      }),
    ).toThrow();
    expect(() =>
      parseNativeBridgeRequest({
        schemaVersion: NATIVE_MESSAGE_SCHEMA,
        requestId: REQUEST_ID,
        action: 'poll',
        payload: { session_id: SESSION_ID, retry: true },
      }),
    ).toThrow();
    expect(() =>
      parseNativeBridgeRequest({
        ...pairRequest(),
        payload: {
          ...pairRequest().payload,
          page_url: 'https://different.example/lab',
        },
      }),
    ).toThrow('must match the exact origin');
    expect(() =>
      parseNativeBridgeRequest({
        ...pairRequest(),
        payload: {
          ...pairRequest().payload,
          page_url: 'https://user:password@left-out.example/lab',
        },
      }),
    ).toThrow();
  });

  it.each(['LE', 'BE'] as const)(
    'frames split and adjacent %s messages without ambiguity',
    (byteOrder) => {
      const first = encodeNativeMessage(pairRequest(), { byteOrder });
      const secondRequest = {
        schemaVersion: NATIVE_MESSAGE_SCHEMA,
        requestId: 'f853a26d-d10c-4b3f-b88f-8252df661997',
        action: 'poll' as const,
        payload: { session_id: SESSION_ID },
      };
      const second = encodeNativeMessage(secondRequest, { byteOrder });
      const stream = Buffer.concat([first, second]);
      const decoder = new NativeMessageDecoder({ byteOrder });
      expect(decoder.push(stream.subarray(0, 3))).toEqual([]);
      expect(decoder.push(stream.subarray(3, first.length + 2))).toHaveLength(
        1,
      );
      const trailing = decoder.push(stream.subarray(first.length + 2));
      expect(trailing).toHaveLength(1);
      expect(decodeNativeBridgeRequest(trailing[0])).toEqual(secondRequest);
      expect(() => decoder.finish()).not.toThrow();
    },
  );

  it('rejects zero, oversized, and truncated frames', () => {
    const zero = Buffer.alloc(4);
    const oversized = Buffer.alloc(4);
    new DataView(
      oversized.buffer,
      oversized.byteOffset,
      oversized.byteLength,
    ).setUint32(0, 33, true);
    expect(() =>
      new NativeMessageDecoder({ byteOrder: 'LE' }).push(zero),
    ).toThrow('outside the allowed boundary');
    expect(() =>
      new NativeMessageDecoder({ byteOrder: 'LE', maxBytes: 32 }).push(
        oversized,
      ),
    ).toThrow('outside the allowed boundary');
    const decoder = new NativeMessageDecoder({ byteOrder: 'LE' });
    decoder.push(
      encodeNativeMessage(pairRequest(), { byteOrder: 'LE' }).subarray(0, 8),
    );
    expect(() => decoder.finish()).toThrow('mid-frame');
  });

  it('binds responses to the exact request and one-MiB host boundary', () => {
    const success = successNativeBridgeResponse(REQUEST_ID, 200, {
      paired: true,
    });
    expect(parseNativeBridgeResponse(success, REQUEST_ID)).toEqual(success);
    expect(() =>
      parseNativeBridgeResponse(
        success,
        'f853a26d-d10c-4b3f-b88f-8252df661997',
      ),
    ).toThrow('request identity');
    expect(
      errorNativeBridgeResponse(REQUEST_ID, 403, 'Forbidden'),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(() =>
      successNativeBridgeResponse(REQUEST_ID, 200, {
        data: 'x'.repeat(1024 * 1024),
      }),
    ).toThrow('byte boundary');
  });

  it('serializes requests and emits one correlated response per frame', async () => {
    const first = pairRequest();
    const second = {
      schemaVersion: NATIVE_MESSAGE_SCHEMA,
      requestId: 'f853a26d-d10c-4b3f-b88f-8252df661997',
      action: 'revoke' as const,
      payload: { session_id: SESSION_ID },
    };
    const input = Readable.from([
      Buffer.concat([encodeNativeMessage(first), encodeNativeMessage(second)]),
    ]);
    const outputFrames: Buffer[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        outputFrames.push(Buffer.from(chunk));
        callback();
      },
    });
    const handle = vi.fn(async (request) => ({
      status: request.action === 'revoke' ? (202 as const) : (200 as const),
      body: { action: request.action },
    }));

    await runNativeHostRuntime({
      callerOrigin: `chrome-extension://${EXTENSION_ID}/`,
      extensionId: EXTENSION_ID,
      input,
      output,
      handle,
    });

    const decoder = new NativeMessageDecoder();
    const responses = decoder
      .push(Buffer.concat(outputFrames))
      .map((frame) => decodeNativeBridgeResponse(frame));
    decoder.finish();
    expect(responses).toEqual([
      expect.objectContaining({ requestId: first.requestId, ok: true }),
      expect.objectContaining({ requestId: second.requestId, ok: true }),
    ]);
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('returns a bounded correlated error without logging to stdout', async () => {
    const input = Readable.from([encodeNativeMessage(pairRequest())]);
    const outputFrames: Buffer[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        outputFrames.push(Buffer.from(chunk));
        callback();
      },
    });
    await runNativeHostRuntime({
      callerOrigin: `chrome-extension://${EXTENSION_ID}/`,
      extensionId: EXTENSION_ID,
      input,
      output,
      handle: async () => {
        throw new Error('connector unavailable\nsecret detail');
      },
    });
    const decoder = new NativeMessageDecoder();
    const [frame] = decoder.push(Buffer.concat(outputFrames));
    expect(decodeNativeBridgeResponse(frame)).toEqual(
      expect.objectContaining({
        requestId: REQUEST_ID,
        ok: false,
        status: 500,
        error: 'connector unavailable secret detail',
      }),
    );
  });
});
