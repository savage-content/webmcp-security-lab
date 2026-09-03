import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';
import { handleReportingCorrection } from '../products/reporting-service/correct';
import {
  handleReportingFeed,
  handleReportingFeedUnsupportedMethod,
} from '../products/reporting-service/feed';
import { verifyReportingFeedBytes } from '../products/reporting-service/feed-signing';
import { handleReportingIntake } from '../products/reporting-service/intake';
import { handleReportingPublication } from '../products/reporting-service/publish';
import { handleReportingReviewTransition } from '../products/reporting-service/review';
import { loadReportingPublication } from '../products/reporting-service/store';

const invitationToken = 'invitation-token-with-at-least-32-characters';
const reviewerToken = 'reviewer-token-with-at-least-32-characters-long';
const publisherToken = 'publisher-token-with-at-least-32-characters';
const custodianToken = 'custodian-token-with-at-least-32-characters';
const feedToken = 'feed-reader-token-with-at-least-32-characters-long';
const signingKeyPair = generateKeyPairSync('ed25519');
const privateDer = Buffer.from(
  signingKeyPair.privateKey.export({ format: 'der', type: 'pkcs8' }),
);
const publicDer = Buffer.from(
  signingKeyPair.publicKey.export({ format: 'der', type: 'spki' }),
);
const trustedFingerprint = createHash('sha256').update(publicDer).digest('hex');

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function environment() {
  return {
    LEFTOUT_REPORTING_MODE: 'invited',
    LEFTOUT_REPORTING_INTAKE: 'true',
    LEFTOUT_REPORTING_MODERATION: 'true',
    LEFTOUT_REPORTING_PUBLICATION: 'true',
    LEFTOUT_REPORTING_FEED: 'true',
    LEFTOUT_REPORTING_LIFECYCLE: 'false',
    LEFTOUT_REPORTING_CORRECTION: 'true',
    LEFTOUT_REPORTING_INVITATION_ID: 'invitation.feed-test',
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
      {
        id: 'custodian-alpha',
        role: 'custodian',
        tokenSha256: digest(custodianToken),
      },
    ]),
    LEFTOUT_REPORTING_FEED_TOKEN_SHA256: digest(feedToken),
    LEFTOUT_REPORTING_FEED_SIGNING_KEY_ID: 'feed.test',
    LEFTOUT_REPORTING_FEED_SIGNING_PRIVATE_KEY_PKCS8_BASE64:
      privateDer.toString('base64'),
    LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SPKI_BASE64:
      publicDer.toString('base64'),
    LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SHA256: trustedFingerprint,
  };
}

function feedRequest(
  query = '',
  options: { token?: string; headers?: HeadersInit } = {},
) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${options.token ?? feedToken}`);
  return new Request(`https://reports.example.test/api/reports/feed${query}`, {
    headers,
  });
}

function reviewRequest(reportId: string, expectedRevision: number, to: string) {
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

async function publishReport(
  database: D1Database,
  reportingEnvironment: Readonly<Record<string, string>>,
  options: {
    origin?: string;
    publishedAt?: string;
  } = {},
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
        siteOrigin: options.origin ?? 'https://private-origin.example',
        stage: 'registration',
      }),
    }),
    {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T18:00:00.000Z'),
    },
  );
  expect(intake.status).toBe(201);
  const { reportId } = (await intake.json()) as { reportId: string };
  for (const [expectedRevision, to, at] of [
    [1, 'under_review', '2026-09-02T18:01:00.000Z'],
    [2, 'accepted_private', '2026-09-02T18:02:00.000Z'],
  ] as const) {
    const response = await handleReportingReviewTransition(
      reviewRequest(reportId, expectedRevision, to),
      {
        environment: reportingEnvironment,
        database,
        now: () => Date.parse(at),
      },
    );
    expect(response.status).toBe(200);
  }
  const publication = await handleReportingPublication(
    new Request(
      `https://reports.example.test/api/reports/publish/${reportId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publisherToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          expectedRevision: 3,
          publication: {
            hostnameVisibility: 'withheld',
            hostnameConsent: 'not_granted',
            evidenceBasis: 'human_reproduced',
          },
        }),
      },
    ),
    {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse(options.publishedAt ?? '2026-09-02T18:03:00.000Z'),
    },
  );
  expect(publication.status).toBe(200);
  return reportId;
}

function responseSignature(response: Response, bytes: Uint8Array) {
  const publicKeySpkiBase64 = response.headers.get(
    'x-leftout-feed-public-key-spki',
  );
  const signatureBase64 = response.headers.get('x-leftout-feed-signature');
  expect(publicKeySpkiBase64).toBe(publicDer.toString('base64'));
  expect(response.headers.get('x-leftout-feed-public-key-sha256')).toBe(
    trustedFingerprint,
  );
  expect(response.headers.get('x-leftout-feed-key-id')).toBe('feed.test');
  expect(response.headers.get('x-leftout-feed-signature-algorithm')).toBe(
    'Ed25519',
  );
  expect(response.headers.get('content-digest')).toBe(
    `sha-256=:${createHash('sha256').update(bytes).digest('base64')}:`,
  );
  return {
    publicKeySpkiBase64: publicKeySpkiBase64!,
    signatureBase64: signatureBase64!,
  };
}

describe('signed minimized reporting feed', () => {
  let miniflare: Miniflare | undefined;
  let database: D1Database;

  beforeEach(async () => {
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

  afterEach(async () => {
    await miniflare?.dispose();
  });

  it('is hidden while disabled and keeps feed authority separate', async () => {
    expect(
      (
        await handleReportingFeed(feedRequest(), {
          environment: {},
          database,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await handleReportingFeed(feedRequest('', { token: publisherToken }), {
          environment: environment(),
          database,
        })
      ).status,
    ).toBe(401);
  });

  it('returns only a signed, minimized JSON publication page', async () => {
    const reportingEnvironment = environment();
    const reportId = await publishReport(database, reportingEnvironment);
    const response = await handleReportingFeed(feedRequest(), {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T19:00:00.000Z'),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = responseSignature(response, bytes);
    expect(
      verifyReportingFeedBytes({
        bytes,
        expectedPublicKeySpkiSha256: trustedFingerprint,
        ...signature,
      }),
    ).toBe(true);
    const text = new TextDecoder().decode(bytes);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body).toMatchObject({
      schemaVersion: 'leftout.reporting-feed-page/2',
      format: 'json',
      generatedAt: '2026-09-02T19:00:00.000Z',
      snapshotAt: '2026-09-02T19:00:00.000Z',
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    });
    expect(body.entries).toEqual([
      expect.objectContaining({
        type: 'publication',
        publicId: expect.any(String),
        occurredAt: '2026-09-02T18:03:00.000Z',
        recordSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        record: expect.objectContaining({
          moderationState: 'published',
          hostnameVisibility: 'withheld',
        }),
      }),
    ]);
    expect(text).not.toContain(reportId);
    expect(text).not.toContain('private-origin.example');
    expect(text).not.toContain('publisher-alpha');
    expect(text).not.toContain('sourceRevision');
  });

  it('serves stable, signed NDJSON snapshot pages without private IDs', async () => {
    const reportingEnvironment = environment();
    const firstReportId = await publishReport(database, reportingEnvironment, {
      publishedAt: '2026-09-02T18:03:00.000Z',
    });
    const secondReportId = await publishReport(database, reportingEnvironment, {
      origin: 'https://second-private.example',
      publishedAt: '2026-09-02T18:04:00.000Z',
    });
    const first = await handleReportingFeed(
      feedRequest('?format=ndjson&limit=1'),
      {
        environment: reportingEnvironment,
        database,
        now: () => Date.parse('2026-09-02T19:00:00.000Z'),
      },
    );
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe(
      'application/x-ndjson; charset=utf-8',
    );
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    expect(
      verifyReportingFeedBytes({
        bytes: firstBytes,
        expectedPublicKeySpkiSha256: trustedFingerprint,
        ...responseSignature(first, firstBytes),
      }),
    ).toBe(true);
    const firstLines = new TextDecoder()
      .decode(firstBytes)
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(firstLines.map((line) => line.type)).toEqual([
      'metadata',
      'publication',
      'page',
    ]);
    const nextCursor = firstLines.at(-1)?.nextCursor;
    expect(nextCursor).toEqual(expect.any(String));
    if (typeof nextCursor !== 'string') {
      throw new Error('Expected a feed continuation cursor.');
    }

    const second = await handleReportingFeed(
      feedRequest(`?format=ndjson&limit=1&cursor=${nextCursor}`),
      {
        environment: reportingEnvironment,
        database,
        now: () => Date.parse('2026-09-02T19:01:00.000Z'),
      },
    );
    const secondBytes = new Uint8Array(await second.arrayBuffer());
    expect(
      verifyReportingFeedBytes({
        bytes: secondBytes,
        expectedPublicKeySpkiSha256: trustedFingerprint,
        ...responseSignature(second, secondBytes),
      }),
    ).toBe(true);
    const combined =
      new TextDecoder().decode(firstBytes) +
      new TextDecoder().decode(secondBytes);
    expect(combined).not.toContain(firstReportId);
    expect(combined).not.toContain(secondReportId);
    expect(combined).not.toContain('second-private.example');
    const secondLines = new TextDecoder()
      .decode(secondBytes)
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(secondLines.at(-1)?.nextCursor).toBeNull();
  }, 15_000);

  it('signs an immutable correction after the unchanged publication entry', async () => {
    const reportingEnvironment = environment();
    const reportId = await publishReport(database, reportingEnvironment);
    const publication = await loadReportingPublication(database, reportId);
    expect(publication).not.toBeNull();
    const correction = await handleReportingCorrection(
      new Request(
        `https://reports.example.test/api/reports/corrections/${publication?.publicId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${custodianToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': randomUUID(),
          },
          body: JSON.stringify({
            action: 'withdraw',
            reason: 'evidence_invalidated',
          }),
        },
      ),
      {
        environment: reportingEnvironment,
        database,
        // A correction can share the publication millisecond. The public
        // timeline must still place the publication first.
        now: () => Date.parse('2026-09-02T18:03:00.000Z'),
      },
    );
    expect(correction.status).toBe(201);
    const response = await handleReportingFeed(feedRequest(), {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T19:00:00.000Z'),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(
      verifyReportingFeedBytes({
        bytes,
        expectedPublicKeySpkiSha256: trustedFingerprint,
        ...responseSignature(response, bytes),
      }),
    ).toBe(true);
    const text = new TextDecoder().decode(bytes);
    const body = JSON.parse(text) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(body.entries.map((entry) => entry.type)).toEqual([
      'publication',
      'correction',
    ]);
    expect(body.entries[0]).toMatchObject({
      publicId: publication?.publicId,
      recordSha256: publication?.recordSha256,
    });
    expect(body.entries[1]).toMatchObject({
      publicId: publication?.publicId,
      correction: {
        action: 'withdraw',
        reason: 'evidence_invalidated',
        publicationRecordSha256: publication?.recordSha256,
      },
    });
    expect(text).not.toContain(reportId);
    expect(text).not.toContain('private-origin.example');
    expect(text).not.toContain('custodian-alpha');
  }, 15_000);

  it('rejects browser origins, malformed queries, and unsupported methods', async () => {
    const reportingEnvironment = environment();
    expect(
      (
        await handleReportingFeed(
          feedRequest('', { headers: { Origin: 'https://attacker.example' } }),
          { environment: reportingEnvironment, database },
        )
      ).status,
    ).toBe(403);
    for (const query of [
      '?unknown=true',
      '?limit=101',
      '?format=xml',
      '?cursor=not_base64!',
      '?limit=1&limit=2',
    ]) {
      expect(
        (
          await handleReportingFeed(feedRequest(query), {
            environment: reportingEnvironment,
            database,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      handleReportingFeedUnsupportedMethod(feedRequest(), {
        environment: reportingEnvironment,
        database,
      }).status,
    ).toBe(405);
  });

  it('fails verification for changed bytes or an untrusted fingerprint', async () => {
    const reportingEnvironment = environment();
    await publishReport(database, reportingEnvironment);
    const response = await handleReportingFeed(feedRequest(), {
      environment: reportingEnvironment,
      database,
      now: () => Date.parse('2026-09-02T19:00:00.000Z'),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = responseSignature(response, bytes);
    const changed = Uint8Array.from(bytes);
    changed[changed.length - 1] ^= 1;
    expect(
      verifyReportingFeedBytes({
        bytes: changed,
        expectedPublicKeySpkiSha256: trustedFingerprint,
        ...signature,
      }),
    ).toBe(false);
    expect(
      verifyReportingFeedBytes({
        bytes,
        expectedPublicKeySpkiSha256: '0'.repeat(64),
        ...signature,
      }),
    ).toBe(false);
  });
});
