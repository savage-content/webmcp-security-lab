import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleReportingDeletion } from '../products/reporting-service/delete';
import { handleReportingIntake } from '../products/reporting-service/intake';
import { handleReportingLifecycleTransition } from '../products/reporting-service/lifecycle';
import { handleReportingPublication } from '../products/reporting-service/publish';
import { handleReportingReviewTransition } from '../products/reporting-service/review';
import {
  listReportingPublications,
  loadReportingDeletionTombstone,
  loadReportingLedger,
  loadReportingPublication,
  loadReportingRetention,
} from '../products/reporting-service/store';

const invitationToken = 'invitation-token-with-at-least-32-characters';
const reviewerToken = 'reviewer-token-with-at-least-32-characters-long';
const publisherToken = 'publisher-token-with-at-least-32-characters';
const custodianToken = 'custodian-token-with-at-least-32-characters';

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function environment() {
  return {
    LEFTOUT_REPORTING_MODE: 'invited',
    LEFTOUT_REPORTING_INTAKE: 'true',
    LEFTOUT_REPORTING_MODERATION: 'true',
    LEFTOUT_REPORTING_PUBLICATION: 'true',
    LEFTOUT_REPORTING_FEED: 'false',
    LEFTOUT_REPORTING_LIFECYCLE: 'true',
    LEFTOUT_REPORTING_INVITATION_ID: 'invitation.deletion-alpha',
    LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(invitationToken),
    LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_RETENTION_DAYS: '1',
    LEFTOUT_REPORTING_RETENTION_POLICY_VERSION: 'retention.private-v1',
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
      {
        id: 'custodian-alpha',
        role: 'custodian',
        tokenSha256: digest(custodianToken),
      },
    ]),
  };
}

function jsonRequest(
  url: string,
  token: string,
  body: unknown,
  key: string = randomUUID(),
  origin?: string,
) {
  return new Request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deletionRequest(
  reportId: string,
  input: {
    expectedRetentionRevision?: number;
    key?: string;
    reason?: 'data_subject_request' | 'retention_expired';
    token?: string;
    extra?: Readonly<Record<string, unknown>>;
    origin?: string;
  } = {},
) {
  return jsonRequest(
    `https://reports.example.test/api/reports/lifecycle/${reportId}/delete`,
    input.token ?? custodianToken,
    {
      expectedRetentionRevision: input.expectedRetentionRevision ?? 1,
      reason: input.reason ?? 'data_subject_request',
      ...input.extra,
    },
    input.key,
    input.origin,
  );
}

describe('controlled reporting deletion', () => {
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

  async function createReport() {
    const response = await handleReportingIntake(
      jsonRequest(
        'https://reports.example.test/api/reports/intake',
        invitationToken,
        {
          category: 'unexpected-tool-change',
          severity: 'high',
          siteOrigin: 'https://shop.example.com',
          stage: 'registration',
        },
      ),
      {
        environment: environment(),
        database,
        now: () => Date.parse('2026-09-02T20:15:00.000Z'),
      },
    );
    expect(response.status).toBe(201);
    return ((await response.json()) as { reportId: string }).reportId;
  }

  async function publishReport(reportId: string) {
    for (const [expectedRevision, to] of [
      [1, 'under_review'],
      [2, 'accepted_private'],
    ] as const) {
      const response = await handleReportingReviewTransition(
        jsonRequest(
          `https://reports.example.test/api/reports/review/${reportId}`,
          reviewerToken,
          { expectedRevision, to },
        ),
        { environment: environment(), database },
      );
      expect(response.status).toBe(200);
    }
    const response = await handleReportingPublication(
      jsonRequest(
        `https://reports.example.test/api/reports/publish/${reportId}`,
        publisherToken,
        {
          expectedRevision: 3,
          publication: {
            hostnameVisibility: 'withheld',
            hostnameConsent: 'not_granted',
            evidenceBasis: 'human_reproduced',
          },
        },
      ),
      { environment: environment(), database },
    );
    expect(response.status).toBe(200);
  }

  it('is absent while disabled and rejects broader authority', async () => {
    expect(
      (
        await handleReportingDeletion(deletionRequest(randomUUID()), {
          environment: {},
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(randomUUID(), { token: reviewerToken }),
          { environment: environment(), database },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(randomUUID(), { extra: { force: true } }),
          { environment: environment(), database },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(randomUUID(), { origin: 'https://evil.example' }),
          { environment: environment(), database },
        )
      ).status,
    ).toBe(403);
  });

  it('deletes private data atomically and returns a non-identifying exact retry', async () => {
    const reportId = await createReport();
    const key = randomUUID();
    const dependencies = {
      environment: environment(),
      database,
      now: () => Date.parse('2026-09-02T21:15:00.000Z'),
    };
    const first = await handleReportingDeletion(
      deletionRequest(reportId, { key }),
      dependencies,
    );
    const firstBody = (await first.json()) as {
      tombstone: { requestId: string; tombstoneId: string };
    };
    const replay = await handleReportingDeletion(
      deletionRequest(reportId, { key }),
      dependencies,
    );

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({
      disposition: 'deleted',
      tombstone: {
        reason: 'data_subject_request',
        publicationSurvives: false,
        publicId: null,
        moderationEventCount: 1,
        retentionEventCount: 1,
      },
    });
    expect(JSON.stringify(firstBody)).not.toContain(reportId);
    expect(JSON.stringify(firstBody)).not.toContain('shop.example.com');
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      disposition: 'existing',
      tombstone: { tombstoneId: firstBody.tombstone.tombstoneId },
    });
    expect(await loadReportingLedger(database, reportId)).toBeNull();
    expect(await loadReportingRetention(database, reportId)).toBeNull();
    expect(
      await loadReportingDeletionTombstone(
        database,
        firstBody.tombstone.requestId,
      ),
    ).toMatchObject({ tombstoneId: firstBody.tombstone.tombstoneId });
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(reportId, {
            key,
            reason: 'retention_expired',
          }),
          dependencies,
        )
      ).status,
    ).toBe(409);
  });

  it('enforces the deadline and blocks every deletion under legal hold', async () => {
    const dueReport = await createReport();
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(dueReport, { reason: 'retention_expired' }),
          {
            environment: environment(),
            database,
            now: () => Date.parse('2026-09-03T20:14:59.999Z'),
          },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(dueReport, { reason: 'retention_expired' }),
          {
            environment: environment(),
            database,
            now: () => Date.parse('2026-09-03T20:15:00.000Z'),
          },
        )
      ).status,
    ).toBe(200);

    const heldReport = await createReport();
    const held = await handleReportingLifecycleTransition(
      jsonRequest(
        `https://reports.example.test/api/reports/lifecycle/${heldReport}`,
        custodianToken,
        { expectedRevision: 1, legalHold: true },
      ),
      { environment: environment(), database },
    );
    expect(held.status).toBe(200);
    expect(
      (
        await handleReportingDeletion(
          deletionRequest(heldReport, { expectedRetentionRevision: 2 }),
          {
            environment: environment(),
            database,
            now: () => Date.parse('2027-09-03T20:15:00.000Z'),
          },
        )
      ).status,
    ).toBe(409);
    expect(await loadReportingLedger(database, heldReport)).not.toBeNull();
  }, 15_000);

  it('preserves a published projection without its private lookup link', async () => {
    const reportId = await createReport();
    await publishReport(reportId);
    const before = await loadReportingPublication(database, reportId);
    expect(before?.publicId).toBeTruthy();

    const deleted = await handleReportingDeletion(deletionRequest(reportId), {
      environment: environment(),
      database,
      now: () => Date.parse('2026-09-04T20:15:00.000Z'),
    });
    const body = (await deleted.json()) as {
      tombstone: { publicId: string; publicationSurvives: boolean };
    };
    const page = await listReportingPublications(database, {
      through: '2026-09-05T20:15:00.000Z',
    });

    expect(deleted.status).toBe(200);
    expect(body.tombstone).toMatchObject({
      publicId: before?.publicId,
      publicationSurvives: true,
    });
    expect(await loadReportingPublication(database, reportId)).toBeNull();
    expect(page.publications).toContainEqual(
      expect.objectContaining({
        publicId: before?.publicId,
        reportId: null,
        recordSha256: before?.recordSha256,
      }),
    );
    expect(JSON.stringify(page.publications)).not.toContain(reportId);
    expect(JSON.stringify(page.publications)).not.toContain('shop.example.com');
  }, 15_000);
});
