import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createReportingLedgerIntake,
  transitionReportingLedger,
} from '../products/reporting-service/ledger';
import { createReportingRetention } from '../products/reporting-service/retention-core';
import {
  ensureReportingStoreSchema,
  loadReportingLedger,
  loadReportingPublication,
  loadReportingRetention,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
  ReportingStoreQuotaError,
  saveReportingIntake,
  saveReportingTransition,
} from '../products/reporting-service/store';

const publicDraft = {
  context: 'public-web',
  category: 'unexpected-tool-change',
  severity: 'high',
  stage: 'registration',
  siteOrigin: 'https://shop.example.com',
} as const;

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function intake() {
  return createReportingLedgerIntake(
    publicDraft,
    {
      actor: { id: 'invitation.test-alpha', role: 'intake' },
      requestId: randomUUID(),
    },
    {
      id: randomUUID,
      eventId: randomUUID,
      now: () => Date.parse('2026-09-02T19:00:00.000Z'),
    },
  );
}

let idempotencySeed = '';

function idempotency(request = 'same-request') {
  return {
    invitationId: 'invitation.test-alpha',
    keySha256: digest(idempotencySeed),
    requestSha256: digest(request),
  };
}

describe('durable reporting store', () => {
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

  beforeEach(() => {
    idempotencySeed = randomUUID();
  });

  afterAll(async () => {
    await miniflare?.dispose();
  });

  it('atomically creates and rehydrates one quarantined intake', async () => {
    const created = intake();
    const result = await saveReportingIntake(database, created, idempotency());
    expect(result.disposition).toBe('created');
    expect(result.ledger.record).toEqual(created.record);
    expect(result.ledger.events).toEqual([created.event]);
    expect(
      await loadReportingLedger(database, created.record.moderation.id),
    ).toEqual(result.ledger);
  });

  it('atomically binds intake to its initial retention assignment', async () => {
    const created = intake();
    const retention = createReportingRetention(
      {
        reportId: created.record.moderation.id,
        receivedAt: created.record.moderation.receivedAt,
        retentionDays: 90,
        policyVersion: 'retention.private-v1',
        requestId: created.event.requestId,
      },
      { eventId: randomUUID },
    );
    const key = idempotency();
    const first = await saveReportingIntake(
      database,
      created,
      key,
      undefined,
      retention,
    );
    const replay = await saveReportingIntake(
      database,
      created,
      key,
      undefined,
      retention,
    );

    expect(first.disposition).toBe('created');
    expect(replay.disposition).toBe('existing');
    expect(
      await loadReportingRetention(database, created.record.moderation.id),
    ).toEqual({ state: retention.state, events: [retention.event] });
  });

  it('returns an identical idempotent intake and rejects conflicting reuse', async () => {
    const created = intake();
    await saveReportingIntake(database, created, idempotency());
    const duplicate = await saveReportingIntake(
      database,
      intake(),
      idempotency(),
    );
    expect(duplicate.disposition).toBe('existing');
    expect(duplicate.ledger.record).toEqual(created.record);
    await expect(
      saveReportingIntake(database, intake(), idempotency('changed-request')),
    ).rejects.toBeInstanceOf(ReportingStoreConflictError);
  });

  it('counts new intake atomically and does not charge an idempotent replay', async () => {
    const created = intake();
    const key = idempotency();
    const quota = {
      invitationId: key.invitationId,
      invitationLimit: 1,
      globalLimit: 1,
      now: Date.parse('2026-09-02T19:00:00.000Z'),
    };
    await saveReportingIntake(database, created, key, quota);
    const replay = await saveReportingIntake(database, intake(), key, quota);
    expect(replay.disposition).toBe('existing');

    idempotencySeed = randomUUID();
    await expect(
      saveReportingIntake(database, intake(), idempotency(), quota),
    ).rejects.toBeInstanceOf(ReportingStoreQuotaError);
    idempotencySeed = randomUUID();
    await expect(
      saveReportingIntake(database, intake(), idempotency(), {
        ...quota,
        invitationLimit: 2,
        globalLimit: 2,
      }),
    ).rejects.toBeInstanceOf(ReportingStoreQuotaError);
    const rows = await database
      .prepare(
        `SELECT scope_type AS scopeType, count
         FROM leftout_report_intake_quotas ORDER BY scope_type`,
      )
      .all<{ scopeType: string; count: number }>();
    expect(rows.results.slice(-2)).toEqual([
      { count: 1, scopeType: 'global' },
      { count: 1, scopeType: 'invitation' },
    ]);
  });

  it('commits one optimistic transition and rejects a stale competitor', async () => {
    const created = intake();
    await saveReportingIntake(database, created, idempotency());
    const reviewing = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T19:01:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: randomUUID(),
      },
    );
    const rejected = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T19:01:01.000Z', to: 'rejected' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: randomUUID(),
      },
    );
    const updated = await saveReportingTransition(database, reviewing);
    expect(updated.disposition).toBe('updated');
    expect(updated.ledger.record.revision).toBe(2);
    await expect(
      saveReportingTransition(database, rejected),
    ).rejects.toBeInstanceOf(ReportingStoreConflictError);
  });

  it('returns the committed transition for a semantically identical request retry', async () => {
    const created = intake();
    await saveReportingIntake(database, created, idempotency());
    const requestId = randomUUID();
    const first = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T19:02:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId,
      },
    );
    const retry = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T19:02:01.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId,
      },
    );
    expect((await saveReportingTransition(database, first)).disposition).toBe(
      'updated',
    );
    const replay = await saveReportingTransition(database, retry);
    expect(replay.disposition).toBe('existing');
    expect(replay.ledger.events[1]?.eventSha256).toBe(first.event.eventSha256);
  });

  it('atomically persists one immutable minimized publication record', async () => {
    const created = intake();
    await saveReportingIntake(database, created, idempotency());
    const reviewing = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T19:03:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: randomUUID(),
      },
    );
    await saveReportingTransition(database, reviewing);
    const accepted = transitionReportingLedger(
      reviewing.record,
      { at: '2026-09-02T19:04:00.000Z', to: 'accepted_private' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 2,
        requestId: randomUUID(),
      },
    );
    await saveReportingTransition(database, accepted);
    const published = transitionReportingLedger(
      accepted.record,
      {
        at: '2026-09-02T19:05:00.000Z',
        to: 'published',
        publication: {
          hostnameVisibility: 'withheld',
          hostnameConsent: 'not_granted',
          evidenceBasis: 'human_reproduced',
        },
      },
      {
        actor: { id: 'publisher-alpha', role: 'publisher' },
        expectedRevision: 3,
        requestId: randomUUID(),
      },
    );
    await saveReportingTransition(database, published);
    const publication = await loadReportingPublication(
      database,
      created.record.moderation.id,
    );
    expect(publication).toMatchObject({
      reportId: created.record.moderation.id,
      publisherId: 'publisher-alpha',
      sourceRevision: 4,
      record: {
        moderationState: 'published',
        hostnameVisibility: 'withheld',
      },
    });
    expect(JSON.stringify(publication)).not.toContain('shop.example.com');
    await expect(
      database
        .prepare(
          'UPDATE leftout_report_publications SET publisher_id = ? WHERE report_id = ?',
        )
        .bind('substituted', created.record.moderation.id)
        .run(),
    ).rejects.toThrow('immutable');
  });

  it('makes event and idempotency rows append-only at the database boundary', async () => {
    const created = intake();
    await saveReportingIntake(database, created, idempotency());
    await expect(
      database
        .prepare(
          'UPDATE leftout_report_events SET actor_id = ? WHERE event_id = ?',
        )
        .bind('substituted', created.event.eventId)
        .run(),
    ).rejects.toThrow('append_only');
    await expect(
      database
        .prepare(
          'DELETE FROM leftout_report_intake_idempotency WHERE report_id = ?',
        )
        .bind(created.record.moderation.id)
        .run(),
    ).rejects.toThrow('append_only');
  });

  it('rejects an event that is not backed by the matching record snapshot', async () => {
    await ensureReportingStoreSchema(database);
    const created = intake();
    await expect(
      database
        .prepare(
          `INSERT INTO leftout_report_events (
            event_id, report_id, sequence, revision, at, actor_id, actor_role,
            request_id, from_state, to_state, payload_sha256,
            previous_event_sha256, event_sha256, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          created.event.eventId,
          created.event.reportId,
          created.event.sequence,
          created.event.revision,
          created.event.at,
          created.event.actor.id,
          created.event.actor.role,
          created.event.requestId,
          created.event.from,
          created.event.to,
          created.event.payloadSha256,
          created.event.previousEventSha256,
          created.event.eventSha256,
          JSON.stringify(created.event),
        )
        .run(),
    ).rejects.toThrow('snapshot_mismatch');
  });

  it('detects database snapshot substitution during rehydration', async () => {
    const created = intake();
    await saveReportingIntake(database, created, idempotency());
    await database
      .prepare('UPDATE leftout_report_records SET record_json = ? WHERE id = ?')
      .bind(
        JSON.stringify({ ...created.record, revision: 7 }),
        created.record.moderation.id,
      )
      .run();
    await expect(
      loadReportingLedger(database, created.record.moderation.id),
    ).rejects.toBeInstanceOf(ReportingStoreIntegrityError);
  });
});
