import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportingRelayClient } from '../products/connector/reporting-relay';
import { startCapabilityConnector } from '../products/connector/server';

const assuranceLimitation =
  'This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.';
const invitationToken = 'invitation-token-with-more-than-thirty-two-characters';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function hiddenActionToken(html: string) {
  return /name="action_token" value="([A-Za-z0-9_-]+)"/u.exec(html)?.[1];
}

describe('connector external-report handoff', () => {
  it('previews a paired public origin and sends exactly one reviewed report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-report-handoff-'));
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(typeof init?.body).toBe('string');
        expect(JSON.parse(init?.body as string)).toEqual({
          siteOrigin: 'https://shop.example.com',
          category: 'unexpected-tool-change',
          severity: 'medium',
          stage: 'registration',
        });
        expect(new Headers(init?.headers).has('origin')).toBe(false);
        return Response.json(
          {
            schemaVersion: 'leftout.reporting-intake-response/1',
            disposition: 'created',
            reportId: '923e4567-e89b-42d3-a456-426614174000',
            state: 'quarantined',
            revision: 1,
            receivedAt: '2026-09-03T03:00:00.000Z',
            assuranceLimitation,
          },
          { status: 201 },
        );
      },
    );
    const reportingRelay = new ReportingRelayClient({
      environment: {
        LEFTOUT_CONNECTOR_REPORTING_MODE: 'invited',
        LEFTOUT_CONNECTOR_REPORTING_ENDPOINT:
          'https://reports.example.com/api/reports/intake',
        LEFTOUT_CONNECTOR_REPORTING_INVITATION_TOKEN: invitationToken,
      },
      fetch: fetchMock,
      idempotencyKey: () => '123e4567-e89b-42d3-a456-426614174000',
    });
    const connector = await startCapabilityConnector({
      mcpPort: 0,
      bridgePort: 0,
      accessToken: 'mcp-report-token',
      pairCode: '12345678',
      ledgerPath: join(directory, 'receipts.jsonl'),
      allowedOrigins: ['https://shop.example.com'],
      reportingRelay,
      log: () => undefined,
    });
    cleanups.push(async () => {
      await connector.close();
      await rm(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${connector.mcpPort}`;
    const bridge = `http://127.0.0.1:${connector.bridgePort}`;

    const pairingResponse = await fetch(`${bridge}/bridge/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pair_code: '12345678',
        origin: 'https://shop.example.com',
        page_url: 'https://shop.example.com/account?private=value#fragment',
        client_label: 'Public report test',
      }),
    });
    const pairing = (await pairingResponse.json()) as {
      session_id: string;
      bridge_token: string;
    };
    const reportLinkResponse = await fetch(
      `${bridge}/bridge/report-link?session_id=${pairing.session_id}`,
      { headers: { authorization: `Bearer ${pairing.bridge_token}` } },
    );
    const reportLink = (await reportLinkResponse.json()) as {
      report_url: string;
    };
    const launch = await fetch(reportLink.report_url, { redirect: 'manual' });
    const cookie = launch.headers.get('set-cookie')?.split(';')[0] ?? '';

    const dashboard = await fetch(`${base}/receipts`, {
      headers: { cookie },
    });
    const dashboardHtml = await dashboard.text();
    expect(dashboardHtml).toContain(
      'Report a concern about https://shop.example.com',
    );
    expect(dashboardHtml).not.toContain('/account');
    expect(dashboardHtml).not.toContain('private=value');

    const formResponse = await fetch(`${base}/issues/public/new`, {
      headers: { cookie },
    });
    const formHtml = await formResponse.text();
    const composeToken = hiddenActionToken(formHtml);
    expect(formResponse.status).toBe(200);
    expect(formHtml).toContain('Nothing is sent on this step');
    expect(formHtml).not.toContain('name="siteOrigin"');
    expect(composeToken).toBeTruthy();

    const previewResponse = await fetch(`${base}/issues/public/preview`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action_token: composeToken ?? '',
        category: 'unexpected-tool-change',
        severity: 'medium',
        stage: 'registration',
      }),
    });
    const previewHtml = await previewResponse.text();
    const submitToken = hiddenActionToken(previewHtml);
    expect(previewResponse.status).toBe(200);
    expect(previewHtml).toContain('Send this four-field report once');
    expect(previewHtml).toContain('Will not be sent');
    expect(submitToken).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    const submit = () =>
      fetch(`${base}/issues/public/submit`, {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ action_token: submitToken ?? '' }),
      });
    const submitted = await submit();
    const submittedHtml = await submitted.text();
    expect(submitted.status).toBe(200);
    expect(submittedHtml).toContain('The report was received once');
    expect(submittedHtml).toContain('923e4567-e89b-42d3-a456-426614174000');
    expect(submittedHtml).not.toContain('shop.example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const replay = await submit();
    expect(replay.status).toBe(502);
    expect(await replay.text()).toContain('invalid or expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the synthetic public lab out of external reporting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-report-lab-'));
    const connector = await startCapabilityConnector({
      mcpPort: 0,
      bridgePort: 0,
      accessToken: 'mcp-report-token',
      pairCode: '12345678',
      ledgerPath: join(directory, 'receipts.jsonl'),
      allowedOrigins: [
        'https://left-out-webmcp-security-lab.taitfor.chatgpt.site',
      ],
      log: () => undefined,
    });
    cleanups.push(async () => {
      await connector.close();
      await rm(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${connector.mcpPort}`;
    const bridge = `http://127.0.0.1:${connector.bridgePort}`;
    const paired = await fetch(`${bridge}/bridge/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pair_code: '12345678',
        origin: 'https://left-out-webmcp-security-lab.taitfor.chatgpt.site',
        page_url: 'https://left-out-webmcp-security-lab.taitfor.chatgpt.site/',
        client_label: 'Synthetic lab test',
      }),
    }).then(
      (response) =>
        response.json() as Promise<{
          session_id: string;
          bridge_token: string;
        }>,
    );
    const reportUrl = await fetch(
      `${bridge}/bridge/report-link?session_id=${paired.session_id}`,
      { headers: { authorization: `Bearer ${paired.bridge_token}` } },
    ).then(
      (response) =>
        response.json() as Promise<{
          report_url: string;
        }>,
    );
    const launch = await fetch(reportUrl.report_url, { redirect: 'manual' });
    const cookie = launch.headers.get('set-cookie')?.split(';')[0] ?? '';
    const response = await fetch(`${base}/issues/public/new`, {
      headers: { cookie },
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(
      'Synthetic lessons, local pages, IP addresses, and private names cannot enter external reporting.',
    );
  });
});
