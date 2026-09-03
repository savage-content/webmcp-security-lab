import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';
import { handleReportingIntake } from '../products/reporting-service/intake';
import {
  loadReportingLedger,
  loadReportingRetention,
} from '../products/reporting-service/store';

const invitationToken = 'invitation-token-with-at-least-32-characters';

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function invitationId() {
  return `invitation.${randomUUID().replaceAll('-', '')}`;
}

function invitedEnvironment(
  id: string,
  overrides: Readonly<Record<string, string>> = {},
) {
  return {
    LEFTOUT_REPORTING_MODE: 'invited',
    LEFTOUT_REPORTING_INTAKE: 'true',
    LEFTOUT_REPORTING_MODERATION: 'false',
    LEFTOUT_REPORTING_PUBLICATION: 'false',
    LEFTOUT_REPORTING_FEED: 'false',
    LEFTOUT_REPORTING_LIFECYCLE: 'false',
    LEFTOUT_REPORTING_INVITATION_ID: id,
    LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(invitationToken),
    LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '20',
    LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
    ...overrides,
  };
}

function lifecycleEnvironment(id: string) {
  return invitedEnvironment(id, {
    LEFTOUT_REPORTING_LIFECYCLE: 'true',
    LEFTOUT_REPORTING_RETENTION_DAYS: '90',
    LEFTOUT_REPORTING_RETENTION_POLICY_VERSION: 'retention.private-v1',
    LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
      {
        id: 'custodian-alpha',
        role: 'custodian',
        tokenSha256: digest('custodian-token-with-at-least-32-characters'),
      },
    ]),
  });
}

function reportBody(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    category: 'unexpected-tool-change',
    severity: 'high',
    siteOrigin: 'https://shop.example.com',
    stage: 'registration',
    ...overrides,
  };
}

function request(
  body: unknown = reportBody(),
  options: {
    token?: string;
    idempotencyKey?: string;
    headers?: Readonly<Record<string, string>>;
  } = {},
) {
  return new Request('https://reports.example.test/api/reports/intake', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token ?? invitationToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey ?? randomUUID(),
      ...options.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('invited reporting intake', () => {
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

  it('is indistinguishable from a missing route while disabled', async () => {
    const response = await handleReportingIntake(request(), {
      environment: {},
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  });

  it('rejects missing authority before parsing or storing input', async () => {
    const response = await handleReportingIntake(
      request('{not-json', {
        token: 'unknown-token-with-at-least-32-characters',
      }),
      {
        environment: invitedEnvironment(invitationId()),
        database,
      },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('accepts four high-level fields and returns only quarantine metadata', async () => {
    const id = invitationId();
    const response = await handleReportingIntake(request(), {
      environment: invitedEnvironment(id),
      database,
      now: () => Date.parse('2026-09-02T20:15:00.000Z'),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      schemaVersion: 'leftout.reporting-intake-response/1',
      disposition: 'created',
      state: 'quarantined',
      revision: 1,
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    });
    expect(body).not.toHaveProperty('siteOrigin');
    const stored = await loadReportingLedger(database, String(body.reportId));
    expect(stored?.record.moderation.draft).toMatchObject({
      context: 'public-web',
      siteOrigin: 'https://shop.example.com',
      submission: { disposition: 'human-review-required', submittable: false },
    });
    expect(stored?.events[0]?.actor).toEqual({ id, role: 'intake' });
  });

  it('returns the original report for an exact retry without charging quota', async () => {
    const id = invitationId();
    const key = randomUUID();
    const dependencies = {
      environment: invitedEnvironment(id),
      database,
      now: () => Date.parse('2026-09-02T21:15:00.000Z'),
    };
    const first = await handleReportingIntake(
      request(reportBody(), { idempotencyKey: key }),
      dependencies,
    );
    const firstBody = (await first.json()) as Record<string, unknown>;
    const second = await handleReportingIntake(
      request(reportBody(), { idempotencyKey: key }),
      dependencies,
    );
    const secondBody = (await second.json()) as Record<string, unknown>;
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondBody).toMatchObject({
      disposition: 'existing',
      reportId: firstBody.reportId,
    });
    const quota = await database
      .prepare(
        `SELECT count FROM leftout_report_intake_quotas
         WHERE scope_type = 'invitation' AND scope_id_sha256 = ?`,
      )
      .bind(digest(id))
      .first<{ count: number }>();
    expect(quota?.count).toBe(1);
  });

  it('creates an immutable retention assignment in the intake transaction', async () => {
    const id = invitationId();
    const response = await handleReportingIntake(request(), {
      environment: lifecycleEnvironment(id),
      database,
      now: () => Date.parse('2026-09-02T20:15:00.000Z'),
    });
    const body = (await response.json()) as Record<string, unknown>;
    const retained = await loadReportingRetention(
      database,
      String(body.reportId),
    );

    expect(response.status).toBe(201);
    expect(retained?.state).toMatchObject({
      legalHold: false,
      retainUntil: '2026-12-01T20:15:00.000Z',
      policyVersion: 'retention.private-v1',
      revision: 1,
    });
    expect(retained?.events).toHaveLength(1);
    expect(retained?.events[0]?.action).toBe('policy_assigned');
  });

  it('returns the original lifecycle report on an exact retry without replacing its retention assignment', async () => {
    const id = invitationId();
    const key = randomUUID();
    const first = await handleReportingIntake(
      request(reportBody(), { idempotencyKey: key }),
      {
        environment: lifecycleEnvironment(id),
        database,
        now: () => Date.parse('2026-09-02T20:15:00.000Z'),
      },
    );
    const firstBody = (await first.json()) as Record<string, unknown>;
    const second = await handleReportingIntake(
      request(reportBody(), { idempotencyKey: key }),
      {
        environment: invitedEnvironment(id, {
          LEFTOUT_REPORTING_LIFECYCLE: 'true',
          LEFTOUT_REPORTING_RETENTION_DAYS: '30',
          LEFTOUT_REPORTING_RETENTION_POLICY_VERSION: 'retention.private-v2',
          LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
            {
              id: 'custodian-alpha',
              role: 'custodian',
              tokenSha256: digest(
                'custodian-token-with-at-least-32-characters',
              ),
            },
          ]),
        }),
        database,
        now: () => Date.parse('2026-10-02T20:15:00.000Z'),
      },
    );
    const secondBody = (await second.json()) as Record<string, unknown>;
    const retained = await loadReportingRetention(
      database,
      String(firstBody.reportId),
    );
    const quota = await database
      .prepare(
        `SELECT count FROM leftout_report_intake_quotas
         WHERE scope_type = 'invitation' AND scope_id_sha256 = ?`,
      )
      .bind(digest(id))
      .first<{ count: number }>();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondBody).toMatchObject({
      disposition: 'existing',
      reportId: firstBody.reportId,
    });
    expect(retained?.state).toMatchObject({
      retainUntil: '2026-12-01T20:15:00.000Z',
      policyVersion: 'retention.private-v1',
      revision: 1,
    });
    expect(retained?.events).toHaveLength(1);
    expect(quota?.count).toBe(1);
  });

  it('rejects conflicting reuse, hidden fields, browser origins, and broad media types', async () => {
    const id = invitationId();
    const key = randomUUID();
    const dependencies = {
      environment: invitedEnvironment(id),
      database,
      now: () => Date.parse('2026-09-02T22:15:00.000Z'),
    };
    expect(
      (
        await handleReportingIntake(
          request(reportBody(), { idempotencyKey: key }),
          dependencies,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await handleReportingIntake(
          request(reportBody({ severity: 'low' }), { idempotencyKey: key }),
          dependencies,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handleReportingIntake(
          request(reportBody({ state: 'published' })),
          dependencies,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReportingIntake(
          request(reportBody(), {
            headers: { Origin: 'https://evil.example' },
          }),
          dependencies,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleReportingIntake(
          request(reportBody(), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }),
          dependencies,
        )
      ).status,
    ).toBe(415);
  });

  it('enforces byte limits and atomically rejects quota overflow', async () => {
    const id = invitationId();
    const environment = invitedEnvironment(id, {
      LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '1',
      LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '1',
    });
    const dependencies = {
      environment,
      database,
      now: () => Date.parse('2026-09-02T23:15:00.000Z'),
    };
    const oversized = await handleReportingIntake(
      request(`{"padding":"${'x'.repeat(2_100)}"}`),
      dependencies,
    );
    expect(oversized.status).toBe(413);

    const before = await database
      .prepare('SELECT count(*) AS count FROM leftout_report_records')
      .first<{ count: number }>();
    expect((await handleReportingIntake(request(), dependencies)).status).toBe(
      201,
    );
    const limited = await handleReportingIntake(
      request(reportBody({ category: 'untrusted-output' })),
      dependencies,
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    const after = await database
      .prepare('SELECT count(*) AS count FROM leftout_report_records')
      .first<{ count: number }>();
    expect(after?.count).toBe((before?.count ?? 0) + 1);
  });
});
