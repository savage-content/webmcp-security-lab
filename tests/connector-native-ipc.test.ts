import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCAL_GUARD_WINDOWS_PIPE_PREFIX } from '../products/connector/ipc-server';
import { startCapabilityConnector } from '../products/connector/server';
import { createNativeHostIpcClient } from '../products/native-host/ipc-client';
import { NATIVE_MESSAGE_SCHEMA } from '../products/native-host/native-messaging';

const SECRET = Buffer.from('p'.repeat(32));
const ORIGIN = 'https://left-out.example';

function request(
  action: 'pair' | 'poll' | 'result' | 'revoke' | 'report-link',
  payload: Record<string, unknown>,
) {
  return {
    schemaVersion: NATIVE_MESSAGE_SCHEMA,
    requestId: randomUUID(),
    action,
    payload,
  } as never;
}

describe('connector native-only candidate mode', () => {
  it('will not disable the browser HTTP bridge without native IPC', async () => {
    await expect(
      startCapabilityConnector({ browserBridgeEnabled: false }),
    ).rejects.toThrow('requires the native IPC transport');
  });

  it.skipIf(process.platform !== 'win32')(
    'pairs, delivers, accepts, reports, and revokes without an HTTP bridge',
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'leftout-native-connector-'),
      );
      const pipePath = `${LOCAL_GUARD_WINDOWS_PIPE_PREFIX}${randomUUID()}`;
      const logs: string[] = [];
      const connector = await startCapabilityConnector({
        mcpPort: 0,
        bridgePort: 0,
        browserBridgeEnabled: false,
        nativeIpc: { pipePath, secret: SECRET },
        accessToken: 'native-candidate-test-token',
        ledgerPath: join(directory, 'receipts.jsonl'),
        allowedOrigins: [ORIGIN],
        log: (message) => logs.push(message),
      });
      try {
        expect(connector.browserBridgeEnabled).toBe(false);
        expect(connector.bridgePort).toBe(0);
        expect(connector.nativeIpcPath).toBe(pipePath);
        expect(logs.some((line) => line.includes('Local browser bridge'))).toBe(
          false,
        );
        expect(logs.some((line) => line.includes('pairing code'))).toBe(false);

        const client = createNativeHostIpcClient({
          pipePath,
          secret: SECRET,
          timeoutMs: 1000,
        });
        const paired = await client.handle(
          request('pair', {
            origin: ORIGIN,
            page_url: `${ORIGIN}/lesson?private=discard#step`,
            client_label: 'Signed Local Guard candidate',
          }),
        );
        const pairedBody = paired.body as Record<string, unknown>;
        const sessionId = String(pairedBody.session_id);
        expect(pairedBody).toMatchObject({
          origin: ORIGIN,
          page_url: `${ORIGIN}/lesson`,
        });
        expect(JSON.stringify(pairedBody)).not.toContain('bridge_token');

        const pending = connector.coordinator.requestInspection(sessionId);
        const delivery = await client.handle(
          request('poll', { session_id: sessionId }),
        );
        const command = delivery.body as Record<string, unknown>;
        expect(command).toMatchObject({ kind: 'inspect-tools' });
        await expect(
          client.handle(
            request('result', {
              session_id: sessionId,
              result: {
                command_id: command.command_id,
                observed_at: new Date().toISOString(),
                observed_origin: ORIGIN,
                ok: true,
                payload: {
                  origin: ORIGIN,
                  pageUrl: `${ORIGIN}/lesson`,
                  tools: [],
                },
              },
            }),
          ),
        ).resolves.toMatchObject({ status: 202 });
        await expect(pending).resolves.toMatchObject({ ok: true });

        const report = await client.handle(
          request('report-link', { session_id: sessionId }),
        );
        expect(report.body).toMatchObject({
          report_url: expect.stringMatching(
            /^http:\/\/127\.0\.0\.1:\d+\/reports\/open\?ticket=/u,
          ),
        });
        await expect(
          client.handle(request('revoke', { session_id: sessionId })),
        ).resolves.toMatchObject({ status: 200, body: { revoked: true } });
        await expect(
          client.handle(request('poll', { session_id: sessionId })),
        ).rejects.toThrow('Native bridge session authentication failed');
      } finally {
        await connector.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
