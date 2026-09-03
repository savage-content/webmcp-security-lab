import { describe, expect, it } from 'vitest';

import { handleReportingWorkerRequest } from '../products/reporting-worker/worker';

const database = {} as D1Database;

const disabledEnvironment = Object.freeze({
  DB: database,
  LEFTOUT_REPORTING_MODE: 'disabled',
});

const invitedIntakeEnvironment = Object.freeze({
  DB: database,
  LEFTOUT_REPORTING_MODE: 'invited',
  LEFTOUT_REPORTING_INTAKE: 'true',
  LEFTOUT_REPORTING_MODERATION: 'false',
  LEFTOUT_REPORTING_PUBLICATION: 'false',
  LEFTOUT_REPORTING_FEED: 'false',
  LEFTOUT_REPORTING_LIFECYCLE: 'false',
  LEFTOUT_REPORTING_CORRECTION: 'false',
  LEFTOUT_REPORTING_INVITATION_ID: 'invitation.source-check',
  LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: 'a'.repeat(64),
  LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '2',
  LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '4',
});

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('standalone reporting Worker', () => {
  it('makes every exact reporting route indistinguishable while disabled', async () => {
    const paths = [
      '/api/reports/intake',
      '/api/reports/review',
      '/api/reports/review/75062cb9-ee66-42ec-a6d6-c6edb80afcee',
      '/api/reports/publish/75062cb9-ee66-42ec-a6d6-c6edb80afcee',
      '/api/reports/feed',
      '/api/reports/lifecycle/75062cb9-ee66-42ec-a6d6-c6edb80afcee',
      '/api/reports/lifecycle/75062cb9-ee66-42ec-a6d6-c6edb80afcee/delete',
      '/api/reports/corrections/pub_20260902_example',
    ];
    for (const path of paths) {
      const response = await handleReportingWorkerRequest(
        new Request(`https://reports.example${path}`),
        disabledEnvironment,
      );
      expect(response.status).toBe(404);
      expect(await body(response)).toEqual({ error: 'Not found.' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('exposes no learning site, health endpoint, trailing route, or encoded route', async () => {
    const paths = [
      '/',
      '/local-guard',
      '/health',
      '/api/reports/intake/',
      '/api/reports/%69ntake',
      '/api/reports/review/id/extra',
    ];
    for (const path of paths) {
      const response = await handleReportingWorkerRequest(
        new Request(`https://reports.example${path}`),
        disabledEnvironment,
      );
      expect(response.status).toBe(404);
    }
  });

  it('fails closed when a recognized route sees partial configuration', async () => {
    const response = await handleReportingWorkerRequest(
      new Request('https://reports.example/api/reports/intake'),
      {
        DB: database,
        LEFTOUT_REPORTING_MODE: 'invited',
      },
    );
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({
      error: 'Reporting service unavailable.',
    });
  });

  it('advertises only POST when invited intake is enabled', async () => {
    const response = await handleReportingWorkerRequest(
      new Request('https://reports.example/api/reports/intake'),
      invitedIntakeEnvironment,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(await body(response)).toEqual({ error: 'Method not allowed.' });
  });

  it('rejects query authority before an enabled intake handler runs', async () => {
    const response = await handleReportingWorkerRequest(
      new Request('https://reports.example/api/reports/intake?target=other', {
        method: 'POST',
      }),
      invitedIntakeEnvironment,
    );
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      error: 'Request query is not allowed.',
    });
  });

  it('does not reveal malformed configuration on unrelated paths', async () => {
    const response = await handleReportingWorkerRequest(
      new Request('https://reports.example/not-a-reporting-route'),
      {
        DB: database,
        LEFTOUT_REPORTING_MODE: 'invalid',
      },
    );
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: 'Not found.' });
  });
});
