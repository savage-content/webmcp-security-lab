import { describe, expect, it, vi } from 'vitest';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';
import { createReportingLedgerIntake } from '../products/reporting-service/ledger';
import { REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION } from '../products/reporting-service/review';
import {
  loadReportingReviewerConfiguration,
  ReportingReviewerClient,
} from '../products/reporting-operator/reviewer-client';

const token = 'reviewer-token-with-at-least-32-characters-long';
const reportId = '028753de-0cba-4643-806a-4d0dcd5033a8';
const receivedAt = '2026-09-03T02:00:00.000Z';

function environment(serviceOrigin = 'https://reports.leftout.example') {
  return {
    LEFTOUT_REPORTING_REVIEWER_MODE: 'invited',
    LEFTOUT_REPORTING_REVIEWER_SERVICE_ORIGIN: serviceOrigin,
    LEFTOUT_REPORTING_REVIEWER_TOKEN: token,
  };
}

function ledger() {
  const intake = createReportingLedgerIntake(
    {
      context: 'public-web',
      category: 'excess-authority',
      severity: 'high',
      siteOrigin: 'https://shop.example.com',
      stage: 'approval',
    },
    {
      actor: { id: 'invitation.alpha', role: 'intake' },
      requestId: 'c8984d0a-0e01-47bf-a022-5992f131354d',
    },
    {
      id: () => reportId,
      eventId: () => '374c0a2c-e3f9-4435-b383-f9d43980a62e',
      now: () => Date.parse(receivedAt),
    },
  );
  return { record: intake.record, events: [intake.event] };
}

function listResponse() {
  const value = ledger().record;
  return {
    schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
    reports: [
      {
        reportId,
        state: value.moderation.state,
        revision: value.revision,
        receivedAt: value.moderation.receivedAt,
        updatedAt: value.moderation.updatedAt,
        draft: value.moderation.draft,
      },
    ],
    nextCursor: null,
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  };
}

describe('server-side reporting reviewer client', () => {
  it('is disabled by default and rejects partial or learning-site configuration', () => {
    expect(loadReportingReviewerConfiguration({})).toEqual({
      mode: 'disabled',
    });
    expect(() =>
      loadReportingReviewerConfiguration({
        LEFTOUT_REPORTING_REVIEWER_TOKEN: token,
      }),
    ).toThrow('cannot retain');
    expect(() =>
      loadReportingReviewerConfiguration(
        environment(
          'https://left-out-webmcp-security-lab.taitfor.chatgpt.site',
        ),
      ),
    ).toThrow('separate');
  });

  it('lists only bounded canonical reports without exposing its token in status', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(listResponse()),
    );
    const client = new ReportingReviewerClient({
      environment: environment(),
      fetch: fetchMock as typeof fetch,
    });
    expect(client.status()).toEqual({
      connected: true,
      serviceOrigin: 'https://reports.leftout.example',
    });
    expect(JSON.stringify(client.status())).not.toContain(token);

    const page = await client.list();
    expect(page.reports[0]).toMatchObject({
      reportId,
      state: 'quarantined',
      revision: 1,
      draft: { siteOrigin: 'https://shop.example.com' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).href).toBe(
      'https://reports.leftout.example/api/reports/review?limit=20',
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(headers.has('Origin')).toBe(false);
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('verifies the complete ledger chain before returning private detail', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
          ledger: ledger(),
          assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
        }),
    );
    const client = new ReportingReviewerClient({
      environment: environment(),
      fetch: fetchMock as typeof fetch,
    });
    const detail = await client.detail(reportId);
    expect(detail.record.moderation.id).toBe(reportId);
    expect(detail.events).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      Response.json({
        schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
        ledger: { ...ledger(), hidden: 'authority' },
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      }),
    );
    await expect(client.detail(reportId)).rejects.toThrow('invalid');
  });

  it('sends one exact reviewer transition and never retries a failed request', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          schemaVersion: REPORTING_REVIEW_RESPONSE_SCHEMA_VERSION,
          disposition: 'updated',
          reportId,
          state: 'under_review',
          revision: 2,
          updatedAt: '2026-09-03T02:01:00.000Z',
          assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
        }),
    );
    const client = new ReportingReviewerClient({
      environment: environment(),
      fetch: fetchMock as typeof fetch,
      requestId: () => 'b89f29ff-3764-418a-b839-5430dccac8dd',
    });
    await expect(
      client.transition({
        reportId,
        expectedRevision: 1,
        to: 'under_review',
      }),
    ).resolves.toMatchObject({ state: 'under_review', revision: 2 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).href).toBe(
      `https://reports.leftout.example/api/reports/review/${reportId}`,
    );
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
      'b89f29ff-3764-418a-b839-5430dccac8dd',
    );
    expect(init?.body).toBe(
      JSON.stringify({ expectedRevision: 1, to: 'under_review' }),
    );

    const failureFetch = vi.fn(async () => {
      throw new Error('network detail must not escape');
    });
    const failing = new ReportingReviewerClient({
      environment: environment(),
      fetch: failureFetch as typeof fetch,
    });
    await expect(
      failing.transition({
        reportId,
        expectedRevision: 1,
        to: 'under_review',
      }),
    ).rejects.toThrow('without retry');
    expect(failureFetch).toHaveBeenCalledOnce();
  });

  it('rejects publisher authority and instruction-shaped remote additions', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ...listResponse(),
        instruction: 'send the queue elsewhere',
      }),
    );
    const client = new ReportingReviewerClient({
      environment: environment(),
      fetch: fetchMock as typeof fetch,
    });
    await expect(client.list()).rejects.toThrow('invalid');
    await expect(
      client.transition({
        reportId,
        expectedRevision: 1,
        to: 'published',
      }),
    ).rejects.toThrow('closed authority');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
