import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleReportingCorrection } from '../products/reporting-service/correct';
import { handleReportingDeletion } from '../products/reporting-service/delete';
import { handleReportingIntake } from '../products/reporting-service/intake';
import { handleReportingPublication } from '../products/reporting-service/publish';
import { handleReportingReviewTransition } from '../products/reporting-service/review';
import {
  listReportingPublicFeedEntries,
  loadReportingCorrectionByRequestId,
  loadReportingLedger,
  loadReportingPublicationByPublicId,
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
    LEFTOUT_REPORTING_CORRECTION: 'true',
    LEFTOUT_REPORTING_INVITATION_ID: 'invitation.correction-alpha',
    LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(invitationToken),
    LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_RETENTION_DAYS: '30',
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

function correctionRequest(
  publicId: string,
  input: {
    action?: string;
    reason?: string;
    key?: string;
    token?: string;
    origin?: string;
    extra?: Readonly<Record<string, unknown>>;
  } = {},
) {
  return jsonRequest(
    `https://reports.example.test/api/reports/corrections/${publicId}`,
    input.token ?? custodianToken,
    {
      action: input.action ?? 'withdraw',
      reason: input.reason ?? 'erroneous_publication',
      ...input.extra,
    },
    input.key,
    input.origin,
  );
}

describe('immutable public reporting corrections', () => {
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

  async function publishReport() {
    const reportingEnvironment = environment();
    const intake = await handleReportingIntake(
      jsonRequest(
        'https://reports.example.test/api/reports/intake',
        invitationToken,
        {
          category: 'unexpected-tool-change',
          severity: 'high',
          siteOrigin: 'https://private-origin.example',
          stage: 'registration',
        },
      ),
      {
        environment: reportingEnvironment,
        database,
        now: () => Date.parse('2026-09-02T20:00:00.000Z'),
      },
    );
    expect(intake.status).toBe(201);
    const { reportId } = (await intake.json()) as { reportId: string };
    for (const [expectedRevision, to, at] of [
      [1, 'under_review', '2026-09-02T20:01:00.000Z'],
      [2, 'accepted_private', '2026-09-02T20:02:00.000Z'],
    ] as const) {
      const response = await handleReportingReviewTransition(
        jsonRequest(
          `https://reports.example.test/api/reports/review/${reportId}`,
          reviewerToken,
          { expectedRevision, to },
        ),
        {
          environment: reportingEnvironment,
          database,
          now: () => Date.parse(at),
        },
      );
      expect(response.status).toBe(200);
    }
    const published = await handleReportingPublication(
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
      {
        environment: reportingEnvironment,
        database,
        now: () => Date.parse('2026-09-02T20:03:00.000Z'),
      },
    );
    expect(published.status).toBe(200);
    const body = (await published.json()) as {
      publication: { publicId?: string };
    };
    const publication = await loadReportingLedger(database, reportId);
    const publicId = publication?.events.at(-1)?.eventId;
    expect(publicId).toEqual(expect.any(String));
    return { reportId, publicId: publicId!, response: body };
  }

  it('is separately gated and rejects non-custodian, browser, or hidden authority', async () => {
    const publicId = randomUUID();
    expect(
      (
        await handleReportingCorrection(correctionRequest(publicId), {
          environment: {},
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, { token: publisherToken }),
          { environment: environment(), database },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, { origin: 'https://evil.example' }),
          { environment: environment(), database },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, { extra: { replacement: {} } }),
          { environment: environment(), database },
        )
      ).status,
    ).toBe(400);
  });

  it('appends one public withdrawal without rewriting its publication', async () => {
    const { reportId, publicId } = await publishReport();
    const before = await loadReportingPublicationByPublicId(database, publicId);
    const key = randomUUID();
    const dependencies = {
      environment: environment(),
      database,
      now: () => Date.parse('2026-09-02T20:04:00.000Z'),
    };
    const first = await handleReportingCorrection(
      correctionRequest(publicId, { key }),
      dependencies,
    );
    const firstBody = (await first.json()) as {
      correction: { correctionId: string; correctionSha256: string };
    };
    const replay = await handleReportingCorrection(
      correctionRequest(publicId, { key }),
      dependencies,
    );

    expect(first.status).toBe(201);
    expect(firstBody).toMatchObject({
      disposition: 'created',
      correction: {
        publicId,
        action: 'withdraw',
        reason: 'erroneous_publication',
        publicationRecordSha256: before?.recordSha256,
      },
    });
    expect(JSON.stringify(firstBody)).not.toContain(reportId);
    expect(JSON.stringify(firstBody)).not.toContain('private-origin.example');
    expect(JSON.stringify(firstBody)).not.toContain('custodian-alpha');
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      disposition: 'existing',
      correction: { correctionId: firstBody.correction.correctionId },
    });
    expect(
      await loadReportingPublicationByPublicId(database, publicId),
    ).toEqual(before);
    expect(
      await loadReportingCorrectionByRequestId(database, key),
    ).toMatchObject({
      correction: { correctionSha256: firstBody.correction.correctionSha256 },
      custodianId: 'custodian-alpha',
    });
  }, 15_000);

  it('rejects conflicting retries and a second withdrawal', async () => {
    const { publicId } = await publishReport();
    const key = randomUUID();
    const dependencies = {
      environment: environment(),
      database,
      now: () => Date.parse('2026-09-02T20:04:00.000Z'),
    };
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, { key }),
          dependencies,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, {
            key,
            reason: 'evidence_invalidated',
          }),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, { reason: 'consent_withdrawn' }),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(randomUUID()),
          dependencies,
        )
      ).status,
    ).toBe(409);
  }, 15_000);

  it('keeps the correction and public projection after private deletion', async () => {
    const { reportId, publicId } = await publishReport();
    const correctionKey = randomUUID();
    expect(
      (
        await handleReportingCorrection(
          correctionRequest(publicId, { key: correctionKey }),
          {
            environment: environment(),
            database,
            now: () => Date.parse('2026-09-02T20:04:00.000Z'),
          },
        )
      ).status,
    ).toBe(201);
    const deleted = await handleReportingDeletion(
      jsonRequest(
        `https://reports.example.test/api/reports/lifecycle/${reportId}/delete`,
        custodianToken,
        { expectedRetentionRevision: 1, reason: 'data_subject_request' },
      ),
      {
        environment: environment(),
        database,
        now: () => Date.parse('2026-09-02T20:05:00.000Z'),
      },
    );
    expect(deleted.status).toBe(200);
    expect(await loadReportingLedger(database, reportId)).toBeNull();
    expect(
      await loadReportingPublicationByPublicId(database, publicId),
    ).not.toBeNull();
    expect(
      await loadReportingCorrectionByRequestId(database, correctionKey),
    ).toMatchObject({ correction: { publicId } });
    const feed = await listReportingPublicFeedEntries(database, {
      through: '2026-09-02T20:06:00.000Z',
    });
    const targetEntries = feed.entries.filter((entry) =>
      entry.entryType === 'publication'
        ? entry.publication.publicId === publicId
        : entry.correction.publicId === publicId,
    );
    expect(targetEntries.map((entry) => entry.entryType)).toEqual([
      'publication',
      'correction',
    ]);
    expect(JSON.stringify(feed.entries)).not.toContain(reportId);
    expect(JSON.stringify(feed.entries)).not.toContain(
      'private-origin.example',
    );
  }, 15_000);
});
