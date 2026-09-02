import { createHash, randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createReportingLedgerIntake,
  transitionReportingLedger,
} from '../products/reporting-service/ledger';
import {
  ensureReportingStoreSchema,
  loadReportingLedger,
  ReportingStoreConflictError,
  ReportingStoreIntegrityError,
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
