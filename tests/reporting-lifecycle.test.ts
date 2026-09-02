import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleReportingIntake } from '../products/reporting-service/intake';
import {
  handleReportingLifecycleRead,
  handleReportingLifecycleTransition,
} from '../products/reporting-service/lifecycle';
import { loadReportingRetention } from '../products/reporting-service/store';

const invitationToken = 'invitation-token-with-at-least-32-characters';
const custodianToken = 'custodian-token-with-at-least-32-characters';

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function environment(overrides: Readonly<Record<string, string>> = {}) {
  return {
    LEFTOUT_REPORTING_MODE: 'invited',
    LEFTOUT_REPORTING_INTAKE: 'true',
    LEFTOUT_REPORTING_MODERATION: 'false',
    LEFTOUT_REPORTING_PUBLICATION: 'false',
    LEFTOUT_REPORTING_FEED: 'false',
    LEFTOUT_REPORTING_LIFECYCLE: 'true',
    LEFTOUT_REPORTING_INVITATION_ID: 'invitation.lifecycle-alpha',
    LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(invitationToken),
    LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '20',
    LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_RETENTION_DAYS: '90',
    LEFTOUT_REPORTING_RETENTION_POLICY_VERSION: 'retention.private-v1',
    LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
      {
        id: 'custodian-alpha',
        role: 'custodian',
        tokenSha256: digest(custodianToken),
      },
    ]),
    ...overrides,
  };
}

function intakeRequest() {
  return new Request('https://reports.example.test/api/reports/intake', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${invitationToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      category: 'unexpected-tool-change',
      severity: 'high',
      siteOrigin: 'https://shop.example.com',
      stage: 'registration',
    }),
  });
}

function lifecycleRequest(
  reportId: string,
  options: {
    body?: unknown;
    idempotencyKey?: string;
    method?: 'GET' | 'POST';
    origin?: string;
    token?: string;
  } = {},
) {
  const method = options.method ?? 'POST';
  return new Request(
    `https://reports.example.test/api/reports/lifecycle/${reportId}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${options.token ?? custodianToken}`,
        ...(method === 'POST'
          ? {
              'Content-Type': 'application/json',
              'Idempotency-Key': options.idempotencyKey ?? randomUUID(),
            }
          : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
      },
      ...(method === 'POST'
        ? {
            body: JSON.stringify(
              options.body ?? { expectedRevision: 1, legalHold: true },
            ),
          }
        : {}),
    },
  );
}

describe('reporting lifecycle authority', () => {
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
    const response = await handleReportingIntake(intakeRequest(), {
      environment: environment(),
      database,
      now: () => Date.parse('2026-09-02T20:15:00.000Z'),
    });
    const body = (await response.json()) as { reportId: string };
    expect(response.status).toBe(201);
    return body.reportId;
  }

  it('is absent when lifecycle is disabled and rejects non-custodians', async () => {
    const missing = await handleReportingLifecycleRead(
      lifecycleRequest(randomUUID(), { method: 'GET' }),
      { environment: {} },
    );
    expect(missing.status).toBe(404);

    const unauthorized = await handleReportingLifecycleRead(
      lifecycleRequest(randomUUID(), {
        method: 'GET',
        token: 'reviewer-token-with-at-least-32-characters',
      }),
      { environment: environment(), database },
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('reads only the retained lifecycle projection', async () => {
    const reportId = await createReport();
    const response = await handleReportingLifecycleRead(
      lifecycleRequest(reportId, { method: 'GET' }),
      { environment: environment(), database },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schemaVersion: 'leftout.reporting-lifecycle-response/1',
      reportId,
      revision: 1,
      legalHold: false,
      policyVersion: 'retention.private-v1',
    });
    expect(body).not.toHaveProperty('draft');
    expect(body).not.toHaveProperty('siteOrigin');
  });

  it('sets one legal hold atomically and returns exact retries', async () => {
    const reportId = await createReport();
    const key = randomUUID();
    const dependencies = {
      environment: environment(),
      database,
      now: () => Date.parse('2026-09-03T20:15:00.000Z'),
    };
    const first = await handleReportingLifecycleTransition(
      lifecycleRequest(reportId, { idempotencyKey: key }),
      dependencies,
    );
    const replay = await handleReportingLifecycleTransition(
      lifecycleRequest(reportId, { idempotencyKey: key }),
      dependencies,
    );

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      disposition: 'updated',
      revision: 2,
      legalHold: true,
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      disposition: 'existing',
      revision: 2,
      legalHold: true,
    });
    const cleared = await handleReportingLifecycleTransition(
      lifecycleRequest(reportId, {
        body: { expectedRevision: 2, legalHold: false },
      }),
      {
        ...dependencies,
        now: () => Date.parse('2026-09-04T20:15:00.000Z'),
      },
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({
      disposition: 'updated',
      revision: 3,
      legalHold: false,
    });
    const retained = await loadReportingRetention(database, reportId);
    expect(retained?.events).toHaveLength(3);
    expect(retained?.events[1]).toMatchObject({
      actor: { id: 'custodian-alpha', role: 'custodian' },
      action: 'legal_hold_set',
      legalHold: true,
    });
    expect(retained?.events[2]).toMatchObject({
      actor: { id: 'custodian-alpha', role: 'custodian' },
      action: 'legal_hold_cleared',
      legalHold: false,
    });
  });

  it('rejects stale, hidden, browser-origin, and conflicting requests', async () => {
    const reportId = await createReport();
    const key = randomUUID();
    const dependencies = { environment: environment(), database };
    expect(
      (
        await handleReportingLifecycleTransition(
          lifecycleRequest(reportId, {
            body: { expectedRevision: 2, legalHold: true },
          }),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingLifecycleTransition(
          lifecycleRequest(reportId, {
            body: {
              expectedRevision: 1,
              legalHold: true,
              deleteAfter: true,
            },
          }),
          dependencies,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReportingLifecycleTransition(
          lifecycleRequest(reportId, {
            origin: 'https://evil.example',
          }),
          dependencies,
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await handleReportingLifecycleTransition(
          lifecycleRequest(reportId, { idempotencyKey: key }),
          dependencies,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReportingLifecycleTransition(
          lifecycleRequest(reportId, {
            body: { expectedRevision: 1, legalHold: false },
            idempotencyKey: key,
          }),
          dependencies,
        )
      ).status,
    ).toBe(409);
  });
});
