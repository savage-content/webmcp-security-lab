import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../drizzle/0002_furry_miss_america.sql',
  import.meta.url,
);

async function applyReportingMigration(database: D1Database) {
  const sql = await readFile(migrationUrl, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
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
      { name: 'trg_leftout_report_records_no_delete', type: 'trigger' },
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
  }, 15_000);
});
