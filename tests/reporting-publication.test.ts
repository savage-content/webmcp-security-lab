import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleReportingIntake } from '../products/reporting-service/intake';
import { handleReportingPublication } from '../products/reporting-service/publish';
import { handleReportingReviewTransition } from '../products/reporting-service/review';
import { loadReportingPublication } from '../products/reporting-service/store';

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
    LEFTOUT_REPORTING_LIFECYCLE: 'false',
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

function transitionRequest(
  reportId: string,
  expectedRevision: number,
  to: string,
) {
  return new Request(
    `https://reports.example.test/api/reports/review/${reportId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({ expectedRevision, to }),
    },
  );
}

function publicationRequest(
  reportId: string,
  body: unknown,
  options: { key?: string; token?: string; headers?: HeadersInit } = {},
) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${options.token ?? publisherToken}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Idempotency-Key', options.key ?? randomUUID());
  return new Request(
    `https://reports.example.test/api/reports/publish/${reportId}`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );
}

const withheld = {
  hostnameVisibility: 'withheld',
  hostnameConsent: 'not_granted',
  evidenceBasis: 'human_reproduced',
} as const;

async function createReport(
  database: D1Database,
  reportingEnvironment: Readonly<Record<string, string>>,
  origin = 'https://shop.example.com',
) {
  const intake = await handleReportingIntake(
    new Request('https://reports.example.test/api/reports/intake', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${invitationToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        category: 'unexpected-tool-change',
        severity: 'high',
        siteOrigin: origin,
        stage: 'registration',
      }),
    }),
    {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T18:00:00.000Z'),
    },
  );
  const { reportId } = (await intake.json()) as { reportId: string };
  return reportId;
}

async function acceptReport(
  database: D1Database,
  reportingEnvironment: Readonly<Record<string, string>>,
  reportId: string,
) {
  expect(
    (
      await handleReportingReviewTransition(
        transitionRequest(reportId, 1, 'under_review'),
        {
          environment: reportingEnvironment,
          database,
          now: () => Date.parse('2026-09-02T18:01:00.000Z'),
        },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await handleReportingReviewTransition(
        transitionRequest(reportId, 2, 'accepted_private'),
        {
          environment: reportingEnvironment,
          database,
          now: () => Date.parse('2026-09-02T18:02:00.000Z'),
        },
      )
    ).status,
  ).toBe(200);
}

describe('separate reporting publication authority', () => {
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

  it('is hidden while disabled and rejects reviewer credentials', async () => {
    const id = randomUUID();
    expect(
      (
        await handleReportingPublication(
          publicationRequest(id, {
            expectedRevision: 3,
            publication: withheld,
          }),
          { environment: {} },
        )
      ).status,
    ).toBe(404);
    const reportingEnvironment = environment('invitation.publish-auth');
    expect(
      (
        await handleReportingPublication(
          publicationRequest(
            id,
            { expectedRevision: 3, publication: withheld },
            { token: reviewerToken },
          ),
          { environment: reportingEnvironment, database },
        )
      ).status,
    ).toBe(401);
  });

  it('publishes only an accepted record and persists a minimized immutable projection', async () => {
    const reportingEnvironment = environment('invitation.publish-success');
    const reportId = await createReport(database, reportingEnvironment);
    await acceptReport(database, reportingEnvironment, reportId);
    const response = await handleReportingPublication(
      publicationRequest(reportId, {
        expectedRevision: 3,
        publication: withheld,
      }),
      {
        environment: reportingEnvironment,
        database,
        now: () => Date.parse('2026-09-02T18:03:00.000Z'),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      disposition: 'updated',
      reportId,
      state: 'published',
      revision: 4,
      publication: {
        moderationState: 'published',
        hostnameVisibility: 'withheld',
      },
    });
    expect(JSON.stringify(body.publication)).not.toContain('shop.example.com');
    expect(await loadReportingPublication(database, reportId)).toMatchObject({
      publisherId: 'publisher-alpha',
      sourceRevision: 4,
    });
  }, 15_000);

  it('returns the original publication for an exact idempotent retry', async () => {
    const reportingEnvironment = environment('invitation.publish-retry');
    const reportId = await createReport(database, reportingEnvironment);
    await acceptReport(database, reportingEnvironment, reportId);
    const key = randomUUID();
    const dependencies = {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T18:03:00.000Z'),
    };
    expect(
      (
        await handleReportingPublication(
          publicationRequest(
            reportId,
            { expectedRevision: 3, publication: withheld },
            { key },
          ),
          dependencies,
        )
      ).status,
    ).toBe(200);
    const replay = await handleReportingPublication(
      publicationRequest(
        reportId,
        { expectedRevision: 3, publication: withheld },
        { key },
      ),
      dependencies,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ disposition: 'existing' });
  });

  it('binds named publication to the reviewed origin hostname', async () => {
    const reportingEnvironment = environment('invitation.publish-hostname');
    const reportId = await createReport(database, reportingEnvironment);
    await acceptReport(database, reportingEnvironment, reportId);
    const dependencies = {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T18:03:00.000Z'),
    };
    expect(
      (
        await handleReportingPublication(
          publicationRequest(reportId, {
            expectedRevision: 3,
            publication: {
              hostnameVisibility: 'named',
              hostnameConsent: 'explicit',
              evidenceBasis: 'human_reproduced',
              hostname: 'other.example.com',
            },
          }),
          dependencies,
        )
      ).status,
    ).toBe(400);
    const accepted = await handleReportingPublication(
      publicationRequest(reportId, {
        expectedRevision: 3,
        publication: {
          hostnameVisibility: 'named',
          hostnameConsent: 'explicit',
          evidenceBasis: 'human_reproduced',
          hostname: 'shop.example.com',
        },
      }),
      dependencies,
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toHaveProperty(
      'publication.hostname',
      'shop.example.com',
    );
  });

  it('rejects pre-review, hidden, browser-origin, and broad publication authority', async () => {
    const reportingEnvironment = environment('invitation.publish-rejections');
    const reportId = await createReport(database, reportingEnvironment);
    const dependencies = { environment: reportingEnvironment, database };
    expect(
      (
        await handleReportingPublication(
          publicationRequest(reportId, {
            expectedRevision: 1,
            publication: withheld,
          }),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingPublication(
          publicationRequest(reportId, {
            expectedRevision: 1,
            publication: { ...withheld, reporterId: 'hidden' },
          }),
          dependencies,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReportingPublication(
          publicationRequest(
            reportId,
            { expectedRevision: 1, publication: withheld },
            { headers: { Origin: 'https://evil.example' } },
          ),
          dependencies,
        )
      ).status,
    ).toBe(403);
  });
});
