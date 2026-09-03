import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_GUARD_WINDOWS_PIPE_PREFIX,
  parseLocalGuardWindowsPipePath,
  startConnectorIpcServer,
} from '../products/connector/ipc-server';
import { createNativeHostIpcClient } from '../products/native-host/ipc-client';
import {
  NATIVE_MESSAGE_SCHEMA,
  successNativeBridgeResponse,
} from '../products/native-host/native-messaging';

const SECRET = Buffer.from('i'.repeat(32));
const REQUEST_ID = '5af587fe-f44c-4ab0-8243-7b63d348f612';
const NONCE = Buffer.from('n'.repeat(32)).toString('base64url');

function pairRequest() {
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

describe('Local Guard named-pipe transport', () => {
  it('accepts only the install-owned Windows pipe namespace', () => {
    const valid = `${LOCAL_GUARD_WINDOWS_PIPE_PREFIX}12345678-abcd`;
    expect(parseLocalGuardWindowsPipePath(valid)).toBe(valid);
    expect(() => parseLocalGuardWindowsPipePath('127.0.0.1:8788')).toThrow(
      'install-owned namespace',
    );
    expect(() =>
      parseLocalGuardWindowsPipePath('\\\\.\\pipe\\arbitrary-host'),
    ).toThrow('install-owned namespace');
  });

  it.skipIf(process.platform !== 'win32')(
    'carries one authenticated request without retry and rejects replay',
    async () => {
      const pipePath = `${LOCAL_GUARD_WINDOWS_PIPE_PREFIX}${randomUUID()}`;
      const handle = vi.fn(async (request) =>
        successNativeBridgeResponse(request.requestId, 200, {
          paired: true,
        }),
      );
      const server = await startConnectorIpcServer({
        pipePath,
        secret: SECRET,
        handle,
      });
      try {
        const client = createNativeHostIpcClient({
          pipePath,
          secret: SECRET,
          nonce: () => NONCE,
          timeoutMs: 1000,
        });
        await expect(client.handle(pairRequest())).resolves.toEqual({
          status: 200,
          body: { paired: true },
        });
        expect(handle).toHaveBeenCalledOnce();

        await expect(client.handle(pairRequest())).rejects.toThrow(
          /ambiguous response|closed without a response|connector IPC is unavailable/u,
        );
        expect(handle).toHaveBeenCalledOnce();
      } finally {
        await server.close();
      }
    },
  );
});
