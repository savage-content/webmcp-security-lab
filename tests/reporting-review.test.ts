import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleReportingIntake } from '../products/reporting-service/intake';
import {
  handleReportingReviewList,
  handleReportingReviewRecord,
  handleReportingReviewTransition,
} from '../products/reporting-service/review';

const invitationToken = 'invitation-token-with-at-least-32-characters';
const reviewerToken = 'reviewer-token-with-at-least-32-characters-long';
const publisherToken = 'publisher-token-with-at-least-32-characters';

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function environment(invitationId: string) {
  return {
    LEFTOUT_REPORTING_MODE: 'invited',
    LEFTOUT_REPORTING_INTAKE: 'true',
    LEFTOUT_REPORTING_MODERATION: 'true',
    LEFTOUT_REPORTING_PUBLICATION: 'true',
    LEFTOUT_REPORTING_FEED: 'false',
    LEFTOUT_REPORTING_INVITATION_ID: invitationId,
    LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(invitationToken),
    LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '50',
    LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
      {
        id: 'reviewer-alpha',
        role: 'reviewer',
        tokenSha256: digest(reviewerToken),
      },
      {
        id: 'publisher-alpha',
        role: 'publisher',
        tokenSha256: digest(publisherToken),
      },
    ]),
  };
}

function reportBody(origin: string) {
  return {
    category: 'unexpected-tool-change',
    severity: 'high',
    siteOrigin: origin,
    stage: 'registration',
  };
}

function authorizedRequest(url: string, token = reviewerToken, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(url, { ...init, headers });
}

async function createReport(
  database: D1Database,
  reportingEnvironment: Readonly<Record<string, string>>,
  origin: string,
  at: string,
) {
  const response = await handleReportingIntake(
    new Request('https://reports.example.test/api/reports/intake', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${invitationToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(reportBody(origin)),
    }),
    {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse(at),
    },
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { reportId: string };
}

function transitionRequest(
  reportId: string,
  body: unknown,
  options: { key?: string; token?: string; headers?: HeadersInit } = {},
) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${options.token ?? reviewerToken}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Idempotency-Key', options.key ?? randomUUID());
  return new Request(
    `https://reports.example.test/api/reports/review/${reportId}`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );
}

describe('authenticated reporting review', () => {
  let miniflare: Miniflare | undefined;
  let database: D1Database;

  beforeAll(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default { fetch() { return new Response("ok"); } }',
        d1Databases: { REPORTS: randomUUID() },
      }),
    );
    database = (await miniflare.getD1Database(
      'REPORTS',
    )) as unknown as D1Database;
  });

  afterAll(async () => {
    await miniflare?.dispose();
  });

  it('returns not found while disabled and rejects non-reviewer authority', async () => {
    const url = 'https://reports.example.test/api/reports/review';
    expect(
      (await handleReportingReviewList(authorizedRequest(url), { environment: {} }))
        .status,
    ).toBe(404);
    const reportingEnvironment = environment('invitation.review-auth');
    expect(
      (
        await handleReportingReviewList(
          authorizedRequest(url, publisherToken),
          { environment: reportingEnvironment, database },
        )
      ).status,
    ).toBe(401);
  });

  it('lists private quarantine records with bounded keyset pagination', async () => {
    const reportingEnvironment = environment('invitation.review-pagination');
    const first = await createReport(
      database,
      reportingEnvironment,
      'https://one.example.com',
      '2026-09-02T18:00:00.000Z',
    );
    const second = await createReport(
      database,
      reportingEnvironment,
      'https://two.example.com',
      '2026-09-02T18:01:00.000Z',
    );
    const pageOne = await handleReportingReviewList(
      authorizedRequest('https://reports.example.test/api/reports/review?limit=1'),
      { environment: reportingEnvironment, database },
    );
    expect(pageOne.status).toBe(200);
    const pageOneBody = (await pageOne.json()) as {
      reports: Array<{ reportId: string }>;
      nextCursor: string;
    };
    expect(pageOneBody.reports).toHaveLength(1);
    expect(pageOneBody.nextCursor).toEqual(expect.any(String));
    const pageTwo = await handleReportingReviewList(
      authorizedRequest(
        `https://reports.example.test/api/reports/review?limit=1&cursor=${pageOneBody.nextCursor}`,
      ),
      { environment: reportingEnvironment, database },
    );
    const pageTwoBody = (await pageTwo.json()) as {
      reports: Array<{ reportId: string }>;
    };
    expect(pageTwoBody.reports).toHaveLength(1);
    expect(
      new Set([
        pageOneBody.reports[0]?.reportId,
        pageTwoBody.reports[0]?.reportId,
      ]),
    ).toEqual(new Set([first.reportId, second.reportId]));
  });

  it('returns one verified ledger only to a reviewer', async () => {
    const reportingEnvironment = environment('invitation.review-detail');
    const report = await createReport(
      database,
      reportingEnvironment,
      'https://detail.example.com',
      '2026-09-02T19:00:00.000Z',
    );
    const response = await handleReportingReviewRecord(
      authorizedRequest(
        `https://reports.example.test/api/reports/review/${report.reportId}`,
      ),
      { environment: reportingEnvironment, database },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('ledger.record.moderation.draft.siteOrigin');
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('applies one reviewer transition and makes its exact retry idempotent', async () => {
    const reportingEnvironment = environment('invitation.review-transition');
    const report = await createReport(
      database,
      reportingEnvironment,
      'https://transition.example.com',
      '2026-09-02T20:00:00.000Z',
    );
    const key = randomUUID();
    const dependencies = {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T20:01:00.000Z'),
    };
    const first = await handleReportingReviewTransition(
      transitionRequest(report.reportId, {
        expectedRevision: 1,
        to: 'under_review',
      }, { key }),
      dependencies,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      disposition: 'updated',
      state: 'under_review',
      revision: 2,
    });
    const replay = await handleReportingReviewTransition(
      transitionRequest(report.reportId, {
        expectedRevision: 1,
        to: 'under_review',
      }, { key }),
      dependencies,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      disposition: 'existing',
      state: 'under_review',
      revision: 2,
    });
  });

  it('rejects stale, conflicting, publication, browser, and hidden authority', async () => {
    const reportingEnvironment = environment('invitation.review-rejections');
    const report = await createReport(
      database,
      reportingEnvironment,
      'https://reject.example.com',
      '2026-09-02T21:00:00.000Z',
    );
    const key = randomUUID();
    const dependencies = {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T21:01:00.000Z'),
    };
    await handleReportingReviewTransition(
      transitionRequest(
        report.reportId,
        { expectedRevision: 1, to: 'under_review' },
        { key },
      ),
      dependencies,
    );
    expect(
      (
        await handleReportingReviewTransition(
          transitionRequest(
            report.reportId,
            { expectedRevision: 1, to: 'rejected' },
            { key },
          ),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingReviewTransition(
          transitionRequest(report.reportId, {
            expectedRevision: 1,
            to: 'rejected',
          }),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingReviewTransition(
          transitionRequest(report.reportId, {
            expectedRevision: 2,
            to: 'published',
          }),
          dependencies,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleReportingReviewTransition(
          transitionRequest(
            report.reportId,
            { expectedRevision: 2, to: 'rejected', actor: 'publisher-alpha' },
          ),
          dependencies,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReportingReviewTransition(
          transitionRequest(
            report.reportId,
            { expectedRevision: 2, to: 'rejected' },
            { headers: { Origin: 'https://evil.example' } },
          ),
          dependencies,
        )
      ).status,
    ).toBe(403);
  });
});
