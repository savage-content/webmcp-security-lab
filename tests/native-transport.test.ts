import { describe, expect, it, vi } from 'vitest';

import {
  createNativeBridgeClient,
  NATIVE_HOST_NAME,
  NATIVE_MESSAGE_SCHEMA,
  nativeTransportDeclared,
} from '../products/extension/native-transport.js';

const REQUEST_ID = '5af587fe-f44c-4ab0-8243-7b63d348f612';
const SESSION_ID = '1420ef15-7b3f-4ed0-9e06-094245ca9bf2';

function runtimeHarness(
  responseFor: (request: Record<string, unknown>) => unknown,
) {
  const runtime = {
    lastError: undefined as undefined | { message?: string },
    getManifest: () => ({ permissions: ['nativeMessaging'] }),
    sendNativeMessage: vi.fn(
      (
        host: string,
        request: Record<string, unknown>,
        callback: (response: unknown) => void,
      ) => {
        expect(host).toBe(NATIVE_HOST_NAME);
        callback(responseFor(request));
      },
    ),
  };
  const client = createNativeBridgeClient({
    runtime,
    cryptoApi: { randomUUID: () => REQUEST_ID } as unknown as Crypto,
  });
  return { runtime, client };
}

describe('extension native-messaging client', () => {
  it('detects only an explicitly declared nativeMessaging permission', () => {
    expect(
      nativeTransportDeclared({
        getManifest: () => ({ permissions: ['nativeMessaging'] }),
      }),
    ).toBe(true);
    expect(
      nativeTransportDeclared({ getManifest: () => ({ permissions: [] }) }),
    ).toBe(false);
  });

  it('sends one closed, request-correlated message without retry', async () => {
    const { runtime, client } = runtimeHarness((request) => ({
      schemaVersion: NATIVE_MESSAGE_SCHEMA,
      requestId: request.requestId,
      ok: true,
      status: 200,
      body: { paired: true },
    }));
    await expect(
      client.request('pair', {
        origin: 'https://left-out.example',
        page_url: 'https://left-out.example/lab',
        client_label: 'LeftOut signed Local Guard',
      }),
    ).resolves.toEqual({ status: 200, body: { paired: true } });
    expect(runtime.sendNativeMessage).toHaveBeenCalledOnce();
    expect(runtime.sendNativeMessage.mock.calls[0]?.[1]).toMatchObject({
      schemaVersion: NATIVE_MESSAGE_SCHEMA,
      requestId: REQUEST_ID,
      action: 'pair',
    });
  });

  it('rejects unknown actions, hidden authority, and malformed sessions before transport', async () => {
    const { runtime, client } = runtimeHarness(() => undefined);
    await expect(client.request('execute-arbitrary-tool', {})).rejects.toThrow(
      'closed policy',
    );
    await expect(
      client.request('poll', { session_id: SESSION_ID, retry: true }),
    ).rejects.toThrow('session boundary');
    await expect(
      client.request('revoke', { session_id: 'not-a-session' }),
    ).rejects.toThrow('session boundary');
    await expect(
      client.request('pair', {
        origin: 'https://left-out.example',
        page_url: 'https://different.example/lab',
        client_label: 'LeftOut signed Local Guard',
      }),
    ).rejects.toThrow('exact page boundary');
    expect(runtime.sendNativeMessage).not.toHaveBeenCalled();
  });

  it('preserves an exact same-origin page URL including query and fragment', async () => {
    const { runtime, client } = runtimeHarness((request) => ({
      schemaVersion: NATIVE_MESSAGE_SCHEMA,
      requestId: request.requestId,
      ok: true,
      status: 200,
      body: { paired: true },
    }));
    const pageUrl = 'https://left-out.example/lab?release=11#lesson';
    await expect(
      client.request('pair', {
        origin: 'https://left-out.example',
        page_url: pageUrl,
        client_label: 'LeftOut signed Local Guard',
      }),
    ).resolves.toEqual({ status: 200, body: { paired: true } });
    expect(runtime.sendNativeMessage.mock.calls[0]?.[1]).toMatchObject({
      payload: { page_url: pageUrl },
    });
  });

  it('rejects a mismatched or over-broad response without retry', async () => {
    const { runtime, client } = runtimeHarness(() => ({
      schemaVersion: NATIVE_MESSAGE_SCHEMA,
      requestId: 'f853a26d-d10c-4b3f-b88f-8252df661997',
      ok: true,
      status: 200,
      body: {},
    }));
    await expect(
      client.request('poll', { session_id: SESSION_ID }),
    ).rejects.toThrow('mismatched response');
    expect(runtime.sendNativeMessage).toHaveBeenCalledOnce();

    const second = runtimeHarness((request) => ({
      schemaVersion: NATIVE_MESSAGE_SCHEMA,
      requestId: request.requestId,
      ok: true,
      status: 200,
      body: {},
      hidden: true,
    }));
    await expect(
      second.client.request('poll', { session_id: SESSION_ID }),
    ).rejects.toThrow('invalid success response');
    expect(second.runtime.sendNativeMessage).toHaveBeenCalledOnce();
  });

  it('fails closed when Chrome reports the native host unavailable', async () => {
    const runtime = {
      lastError: undefined as undefined | { message?: string },
      getManifest: () => ({ permissions: ['nativeMessaging'] }),
      sendNativeMessage: vi.fn(
        (
          _host: string,
          _request: Record<string, unknown>,
          callback: (response: unknown) => void,
        ) => {
          runtime.lastError = {
            message: 'Specified native messaging host not found.',
          };
          callback(undefined);
          runtime.lastError = undefined;
        },
      ),
    };
    const client = createNativeBridgeClient({
      runtime,
      cryptoApi: { randomUUID: () => REQUEST_ID } as unknown as Crypto,
    });
    await expect(
      client.request('poll', { session_id: SESSION_ID }),
    ).rejects.toThrow('identity-bound Local Guard host is unavailable');
    expect(runtime.sendNativeMessage).toHaveBeenCalledOnce();
  });
});
