import { describe, expect, it } from 'vitest';

import { BridgeCoordinator } from '../products/connector/bridge-coordinator';
import { NativeBridgeAdapter } from '../products/connector/native-adapter';
import { NATIVE_MESSAGE_SCHEMA } from '../products/native-host/native-messaging';

const IDS = [
  '5af587fe-f44c-4ab0-8243-7b63d348f612',
  'f853a26d-d10c-4b3f-b88f-8252df661997',
  '1420ef15-7b3f-4ed0-9e06-094245ca9bf2',
  '012a2635-0b1a-4f26-9b3e-df09f272184e',
  '23ddc913-343a-4520-a704-4e0b6f39c33e',
];

function nativeRequest(
  requestId: string,
  action: 'pair' | 'poll' | 'result' | 'revoke' | 'report-link',
  payload: Record<string, unknown>,
) {
  return {
    schemaVersion: NATIVE_MESSAGE_SCHEMA,
    requestId,
    action,
    payload,
  } as never;
}

describe('connector native bridge adapter', () => {
  it('keeps bridge tokens server-side across the closed native lifecycle', async () => {
    const coordinator = new BridgeCoordinator({
      allowedOrigins: ['https://left-out.example'],
      pairCode: '12345678',
      sessionId: () => IDS[2],
      bridgeToken: () => 'server-only-bridge-token',
      nextPairCode: () => '87654321',
      commandId: () => IDS[3],
      commandTimeoutMs: 1000,
    });
    const revoked: string[] = [];
    const adapter = new NativeBridgeAdapter({
      coordinator,
      createReportLaunch: (sessionId) => ({
        url: `http://127.0.0.1/reports/open?opaque=${sessionId.length}`,
        expiresAt: '2026-09-02T18:01:00.000Z',
      }),
      revokeSessionResources: (sessionId) => revoked.push(sessionId),
    });

    const pairing = await adapter.handle(
      nativeRequest(IDS[0], 'pair', {
        origin: 'https://left-out.example',
        page_url: 'https://left-out.example/lab?secret=not-persisted#step',
        client_label: 'Signed Local Guard',
      }),
    );
    expect(pairing).toMatchObject({
      ok: true,
      body: {
        session_id: IDS[2],
        page_url: 'https://left-out.example/lab',
      },
    });
    expect(JSON.stringify(pairing)).not.toContain('server-only-bridge-token');
    expect(JSON.stringify(pairing)).not.toContain('12345678');

    const pending = coordinator.requestInspection(IDS[2]);
    const delivery = await adapter.handle(
      nativeRequest(IDS[1], 'poll', { session_id: IDS[2] }),
    );
    expect(delivery).toMatchObject({
      ok: true,
      status: 200,
      body: { command_id: IDS[3], kind: 'inspect-tools' },
    });
    const accepted = await adapter.handle(
      nativeRequest(IDS[4], 'result', {
        session_id: IDS[2],
        result: {
          command_id: IDS[3],
          observed_at: '2026-09-02T18:00:01.000Z',
          observed_origin: 'https://left-out.example',
          ok: true,
          payload: {
            origin: 'https://left-out.example',
            pageUrl: 'https://left-out.example/lab',
            tools: [],
          },
        },
      }),
    );
    expect(accepted).toMatchObject({ ok: true, status: 202 });
    await expect(pending).resolves.toMatchObject({ ok: true });

    const report = await adapter.handle(
      nativeRequest(IDS[0], 'report-link', { session_id: IDS[2] }),
    );
    expect(report).toMatchObject({
      ok: true,
      body: { expires_at: '2026-09-02T18:01:00.000Z' },
    });
    const revoke = await adapter.handle(
      nativeRequest(IDS[1], 'revoke', { session_id: IDS[2] }),
    );
    expect(revoke).toMatchObject({ ok: true, body: { revoked: true } });
    expect(revoked).toEqual([IDS[2]]);
    await expect(
      adapter.handle(nativeRequest(IDS[4], 'poll', { session_id: IDS[2] })),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it('rejects malformed result authority before it reaches the coordinator', async () => {
    const coordinator = new BridgeCoordinator({
      allowedOrigins: ['https://left-out.example'],
      pairCode: '12345678',
      sessionId: () => IDS[2],
      bridgeToken: () => 'server-only-bridge-token',
    });
    const adapter = new NativeBridgeAdapter({
      coordinator,
      createReportLaunch: () => ({
        url: 'http://127.0.0.1/reports/open?ticket=opaque',
        expiresAt: '2026-09-02T18:01:00.000Z',
      }),
    });
    await adapter.handle(
      nativeRequest(IDS[0], 'pair', {
        origin: 'https://left-out.example',
        page_url: 'https://left-out.example/lab',
        client_label: 'Signed Local Guard',
      }),
    );
    const response = await adapter.handle(
      nativeRequest(IDS[1], 'result', {
        session_id: IDS[2],
        result: {
          command_id: IDS[3],
          observed_at: '2026-09-02T18:00:01.000Z',
          observed_origin: 'https://left-out.example',
          ok: true,
          retry: true,
        },
      }),
    );
    expect(response).toMatchObject({ ok: false, status: 400 });
  });
});
