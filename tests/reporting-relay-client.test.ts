import { describe, expect, it, vi } from 'vitest';

import { createPrivacySafeIssueDraft } from '../products/connector/issue-draft';
import {
  REPORTING_RELAY_ENVIRONMENT,
  ReportingRelayClient,
} from '../products/connector/reporting-relay';

const token = 'invitation-token-with-more-than-thirty-two-characters';
const idempotencyKey = '123e4567-e89b-42d3-a456-426614174000';
const reportId = '923e4567-e89b-42d3-a456-426614174000';
const assuranceLimitation =
  'This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.';

function environment(overrides: Record<string, string> = {}) {
  return {
    [REPORTING_RELAY_ENVIRONMENT.mode]: 'invited',
    [REPORTING_RELAY_ENVIRONMENT.endpoint]:
      'https://reports.example.com/api/reports/intake',
    [REPORTING_RELAY_ENVIRONMENT.invitationToken]: token,
    ...overrides,
  };
}

function publicDraft() {
  return createPrivacySafeIssueDraft({
    context: 'public-web',
    siteOrigin: 'https://shop.example.com',
    category: 'unexpected-tool-change',
    severity: 'medium',
    stage: 'registration',
  });
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'leftout.reporting-intake-response/1',
    disposition: 'created',
    reportId,
    state: 'quarantined',
    revision: 1,
    receivedAt: '2026-09-03T03:00:00.000Z',
    assuranceLimitation,
    ...overrides,
  };
}

describe('privacy-bounded reporting relay client', () => {
  it('is fully disabled without destination or credential state', () => {
    const client = new ReportingRelayClient({ environment: {} });
    expect(client.status()).toEqual({
      mode: 'disabled',
      acceptsExternalReports: false,
      automaticRetry: false,
      browserCredentialsExposed: false,
    });
    expect(JSON.stringify(client.status())).not.toContain('token');
  });

  it.each([
    {
      [REPORTING_RELAY_ENVIRONMENT.endpoint]:
        'https://reports.example.com/api/reports/intake',
    },
    {
      [REPORTING_RELAY_ENVIRONMENT.mode]: 'disabled',
      [REPORTING_RELAY_ENVIRONMENT.invitationToken]: token,
    },
    {
      [REPORTING_RELAY_ENVIRONMENT.mode]: 'invited',
    },
    environment({
      [REPORTING_RELAY_ENVIRONMENT.endpoint]:
        'http://reports.example.com/api/reports/intake',
    }),
    environment({
      [REPORTING_RELAY_ENVIRONMENT.endpoint]:
        'https://localhost/api/reports/intake',
    }),
    environment({
      [REPORTING_RELAY_ENVIRONMENT.endpoint]:
        'https://reports.example.com/api/reports/intake?next=elsewhere',
    }),
    environment({
      [REPORTING_RELAY_ENVIRONMENT.endpoint]:
        'https://left-out-webmcp-security-lab.taitfor.chatgpt.site/api/reports/intake',
    }),
  ])('rejects partial, disabled, or unsafe configuration %#', (configured) => {
    expect(
      () => new ReportingRelayClient({ environment: configured }),
    ).toThrow();
  });

  it('sends exactly four fields once without browser credentials or retry', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(init?.redirect).toBe('error');
        expect(init?.credentials).toBe('omit');
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe(`Bearer ${token}`);
        expect(headers.get('content-type')).toBe('application/json');
        expect(headers.get('idempotency-key')).toBe(idempotencyKey);
        expect(headers.has('origin')).toBe(false);
        expect(typeof init?.body).toBe('string');
        expect(JSON.parse(init?.body as string)).toEqual({
          siteOrigin: 'https://shop.example.com',
          category: 'unexpected-tool-change',
          severity: 'medium',
          stage: 'registration',
        });
        return Response.json(receipt(), { status: 201 });
      },
    );
    const client = new ReportingRelayClient({
      environment: environment(),
      fetch: fetchMock,
      idempotencyKey: () => idempotencyKey,
    });

    await expect(client.submit(publicDraft())).resolves.toEqual(receipt());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.status()).toEqual({
      mode: 'invited',
      acceptsExternalReports: true,
      automaticRetry: false,
      browserCredentialsExposed: false,
      destinationOrigin: 'https://reports.example.com',
    });
    expect(JSON.stringify(client.status())).not.toContain(token);
  });

  it('rejects synthetic drafts before making a request', async () => {
    const fetchMock = vi.fn();
    const client = new ReportingRelayClient({
      environment: environment(),
      fetch: fetchMock,
    });
    await expect(
      client.submit(
        createPrivacySafeIssueDraft({
          context: 'synthetic-lab',
          category: 'annotation-mismatch',
          severity: 'informational',
          stage: 'discovery',
        }),
      ),
    ).rejects.toThrow('public-web');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [500, { error: `do not expose ${token}` }],
    [201, receipt({ state: 'published' })],
    [201, receipt({ secret: token })],
    [201, { padding: 'x'.repeat(17 * 1024) }],
  ])('fails closed for an untrusted response %#', async (status, body) => {
    const fetchMock = vi.fn(async () => Response.json(body, { status }));
    const client = new ReportingRelayClient({
      environment: environment(),
      fetch: fetchMock,
      idempotencyKey: () => idempotencyKey,
    });
    let observed = '';
    try {
      await client.submit(publicDraft());
    } catch (error) {
      observed = error instanceof Error ? error.message : String(error);
    }
    expect(observed).not.toContain(token);
    expect(observed.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
