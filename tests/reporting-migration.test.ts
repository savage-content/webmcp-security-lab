import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationUrls = [
  new URL('../drizzle/0002_furry_miss_america.sql', import.meta.url),
  new URL('../drizzle/0003_mixed_nightmare.sql', import.meta.url),
  new URL('../drizzle/0004_colossal_tenebrous.sql', import.meta.url),
  new URL('../drizzle/0005_fine_toad.sql', import.meta.url),
];

async function applyReportingMigration(database: D1Database) {
  const statements = (
    await Promise.all(migrationUrls.map((url) => readFile(url, 'utf8')))
  ).flatMap((sql) =>
    sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean),
  );
  await database.batch(
    statements.map((statement) => database.prepare(statement)),
  );
}

describe('reporting database migration', () => {
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
    await applyReportingMigration(database);
  });

  afterEach(async () => {
    await miniflare?.dispose();
  });

  it('installs fail-closed checks and append-only moderation triggers', async () => {
    const objects = await database
      .prepare(
        `SELECT type, name FROM sqlite_master
         WHERE name LIKE 'trg_leftout_report_%'
         ORDER BY name`,
      )
      .all<{ type: string; name: string }>();
    expect(objects.results).toEqual([
      { name: 'trg_leftout_report_event_chain', type: 'trigger' },
      { name: 'trg_leftout_report_event_snapshot', type: 'trigger' },
      { name: 'trg_leftout_report_events_no_delete', type: 'trigger' },
      { name: 'trg_leftout_report_events_no_update', type: 'trigger' },
      { name: 'trg_leftout_report_idempotency_no_delete', type: 'trigger' },
      { name: 'trg_leftout_report_idempotency_no_update', type: 'trigger' },
      {
        name: 'trg_leftout_report_intake_quota_exhausted',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_intake_quota_integrity',
        type: 'trigger',
      },
      { name: 'trg_leftout_report_publication_snapshot', type: 'trigger' },
      { name: 'trg_leftout_report_publications_no_delete', type: 'trigger' },
      { name: 'trg_leftout_report_publications_no_update', type: 'trigger' },
      { name: 'trg_leftout_report_records_no_delete', type: 'trigger' },
      { name: 'trg_leftout_report_retention_event_chain', type: 'trigger' },
      { name: 'trg_leftout_report_retention_event_snapshot', type: 'trigger' },
      {
        name: 'trg_leftout_report_retention_events_no_delete',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_retention_events_no_update',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_retention_state_integrity',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_retention_states_no_delete',
        type: 'trigger',
      },
    ]);

    await expect(
      database
        .prepare(
          `INSERT INTO leftout_report_records (
            id, schema_version, revision, state, received_at, updated_at,
            last_event_sha256, record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          'bad-revision',
          '1',
          0,
          'quarantined',
          '2026-09-02T19:00:00.000Z',
          '2026-09-02T19:00:00.000Z',
          'a'.repeat(64),
          '{}',
        )
        .run(),
    ).rejects.toThrow('CHECK constraint failed');

    const reportId = randomUUID();
    const eventId = randomUUID();
    const eventSha256 = 'b'.repeat(64);
    await database
      .prepare(
        `INSERT INTO leftout_report_records (
          id, schema_version, revision, state, received_at, updated_at,
          last_event_sha256, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        '1',
        1,
        'quarantined',
        '2026-09-02T19:00:00.000Z',
        '2026-09-02T19:00:00.000Z',
        eventSha256,
        '{}',
      )
      .run();
    await database
      .prepare(
        `INSERT INTO leftout_report_events (
          event_id, report_id, sequence, revision, at, actor_id, actor_role,
          request_id, from_state, to_state, payload_sha256,
          previous_event_sha256, event_sha256, event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        reportId,
        1,
        1,
        '2026-09-02T19:00:00.000Z',
        'invitation.test-alpha',
        'intake',
        randomUUID(),
        'received',
        'quarantined',
        'c'.repeat(64),
        null,
        eventSha256,
        '{}',
      )
      .run();

    await expect(
      database
        .prepare(
          'UPDATE leftout_report_events SET actor_id = ? WHERE event_id = ?',
        )
        .bind('substituted', eventId)
        .run(),
    ).rejects.toThrow('append_only');
    await expect(
      database
        .prepare('DELETE FROM leftout_report_records WHERE id = ?')
        .bind(reportId)
        .run(),
    ).rejects.toThrow('require_retention_workflow');

    const retentionEventId = randomUUID();
    const retentionEventSha256 = '9'.repeat(64);
    await database
      .prepare(
        `INSERT INTO leftout_report_retention_states (
          report_id, schema_version, revision, updated_at, legal_hold,
          retain_until, policy_version, last_event_sha256, state_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        'leftout.reporting-retention-state/1',
        1,
        '2026-09-02T19:00:00.000Z',
        0,
        '2026-12-01T19:00:00.000Z',
        'retention.private-v1',
        retentionEventSha256,
        '{}',
      )
      .run();
    await database
      .prepare(
        `INSERT INTO leftout_report_retention_events (
          event_id, report_id, revision, at, actor_id, actor_role,
          request_id, action, legal_hold, retain_until, policy_version,
          previous_event_sha256, event_sha256, event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        retentionEventId,
        reportId,
        1,
        '2026-09-02T19:00:00.000Z',
        'system.retention-policy',
        'system',
        randomUUID(),
        'policy_assigned',
        0,
        '2026-12-01T19:00:00.000Z',
        'retention.private-v1',
        null,
        retentionEventSha256,
        '{}',
      )
      .run();
    await expect(
      database
        .prepare(
          'UPDATE leftout_report_retention_states SET policy_version = ? WHERE report_id = ?',
        )
        .bind('retention.substituted', reportId)
        .run(),
    ).rejects.toThrow('retention_state_integrity');
    await expect(
      database
        .prepare(
          'DELETE FROM leftout_report_retention_events WHERE event_id = ?',
        )
        .bind(retentionEventId)
        .run(),
    ).rejects.toThrow('append_only');
    await expect(
      database
        .prepare(
          'DELETE FROM leftout_report_retention_states WHERE report_id = ?',
        )
        .bind(reportId)
        .run(),
    ).rejects.toThrow('require_retention_workflow');

    await database
      .prepare(
        `INSERT INTO leftout_report_intake_quotas (
          bucket_key, scope_type, scope_id_sha256, window_started_at,
          expires_at, count, max_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        'd'.repeat(64),
        'invitation',
        'e'.repeat(64),
        '2026-09-02T19:00:00.000Z',
        '2026-09-02T20:00:00.000Z',
        1,
        1,
      )
      .run();
    await expect(
      database
        .prepare(
          'UPDATE leftout_report_intake_quotas SET count = count + 1 WHERE bucket_key = ?',
        )
        .bind('d'.repeat(64))
        .run(),
    ).rejects.toThrow('quota_exhausted');

    await expect(
      database
        .prepare(
          `INSERT INTO leftout_report_publications (
            report_id, schema_version, published_at, publisher_id,
            source_revision, record_sha256, record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          reportId,
          'leftout.public-issue-feed/1',
          '2026-09-02T19:01:00.000Z',
          'publisher-alpha',
          2,
          'f'.repeat(64),
          '{}',
        )
        .run(),
    ).rejects.toThrow('publication_snapshot_mismatch');
  }, 15_000);
});
