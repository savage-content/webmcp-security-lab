import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationUrls = [
  new URL('../drizzle/0002_furry_miss_america.sql', import.meta.url),
  new URL('../drizzle/0003_mixed_nightmare.sql', import.meta.url),
  new URL('../drizzle/0004_colossal_tenebrous.sql', import.meta.url),
  new URL('../drizzle/0005_fine_toad.sql', import.meta.url),
  new URL('../drizzle/0006_silly_talkback.sql', import.meta.url),
];

async function applyReportingMigration(
  database: D1Database,
  urls: readonly URL[] = migrationUrls,
) {
  const statements = (
    await Promise.all(urls.map((url) => readFile(url, 'utf8')))
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
      {
        name: 'trg_leftout_report_deletion_authorization_snapshot',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_deletion_authorizations_no_update',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_deletion_tombstones_no_delete',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_deletion_tombstones_no_update',
        type: 'trigger',
      },
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
      {
        name: 'trg_leftout_report_publication_link_snapshot',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_publication_links_no_delete',
        type: 'trigger',
      },
      {
        name: 'trg_leftout_report_publication_links_no_update',
        type: 'trigger',
      },
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

    await expect(
      database
        .prepare(
          `INSERT INTO leftout_report_deletion_authorizations (
            report_id, request_id, request_sha256, custodian_id,
            expected_retention_revision, authorized_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          reportId,
          randomUUID(),
          '7'.repeat(64),
          'custodian-alpha',
          2,
          '2026-09-02T19:01:00.000Z',
        )
        .run(),
    ).rejects.toThrow('deletion_authorization_snapshot_mismatch');

    const authorizationRequestId = randomUUID();
    await database
      .prepare(
        `INSERT INTO leftout_report_deletion_authorizations (
          report_id, request_id, request_sha256, custodian_id,
          expected_retention_revision, authorized_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        authorizationRequestId,
        '7'.repeat(64),
        'custodian-alpha',
        1,
        '2026-09-02T19:01:00.000Z',
      )
      .run();
    await expect(
      database
        .prepare(
          `UPDATE leftout_report_deletion_authorizations
           SET custodian_id = ? WHERE report_id = ?`,
        )
        .bind('custodian-substituted', reportId)
        .run(),
    ).rejects.toThrow('deletion_authorizations_immutable');
    await database
      .prepare(
        'DELETE FROM leftout_report_deletion_authorizations WHERE report_id = ?',
      )
      .bind(reportId)
      .run();

    const heldRetentionSha256 = '8'.repeat(64);
    await database
      .prepare(
        `UPDATE leftout_report_retention_states
         SET revision = 2, updated_at = ?, legal_hold = 1,
             last_event_sha256 = ?
         WHERE report_id = ?`,
      )
      .bind('2026-09-02T19:02:00.000Z', heldRetentionSha256, reportId)
      .run();
    await expect(
      database
        .prepare(
          `INSERT INTO leftout_report_deletion_authorizations (
            report_id, request_id, request_sha256, custodian_id,
            expected_retention_revision, authorized_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          reportId,
          randomUUID(),
          '7'.repeat(64),
          'custodian-alpha',
          2,
          '2026-09-02T19:03:00.000Z',
        )
        .run(),
    ).rejects.toThrow('deletion_authorization_snapshot_mismatch');

    const tombstoneId = randomUUID();
    await database
      .prepare(
        `INSERT INTO leftout_report_deletion_tombstones (
          tombstone_id, schema_version, deleted_at, reason, policy_version,
          public_id, publication_survives, moderation_event_count,
          retention_event_count, last_moderation_event_sha256,
          last_retention_event_sha256, custodian_id, request_id,
          request_sha256, tombstone_sha256, tombstone_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tombstoneId,
        'leftout.reporting-deletion-tombstone/1',
        '2026-09-02T19:03:00.000Z',
        'data_subject_request',
        'retention.private-v1',
        null,
        0,
        1,
        1,
        'a'.repeat(64),
        'b'.repeat(64),
        'custodian-alpha',
        randomUUID(),
        'c'.repeat(64),
        'd'.repeat(64),
        '{}',
      )
      .run();
    await expect(
      database
        .prepare(
          `UPDATE leftout_report_deletion_tombstones
           SET custodian_id = ? WHERE tombstone_id = ?`,
        )
        .bind('custodian-substituted', tombstoneId)
        .run(),
    ).rejects.toThrow('deletion_tombstones_immutable');
    await expect(
      database
        .prepare(
          'DELETE FROM leftout_report_deletion_tombstones WHERE tombstone_id = ?',
        )
        .bind(tombstoneId)
        .run(),
    ).rejects.toThrow('deletion_tombstones_immutable');

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

    const publicId = randomUUID();
    await database
      .prepare(
        `INSERT INTO leftout_report_publications (
          public_id, schema_version, published_at, publisher_id,
          source_revision, record_sha256, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        publicId,
        'leftout.public-issue-feed/1',
        '2026-09-02T19:01:00.000Z',
        'publisher-alpha',
        2,
        'f'.repeat(64),
        '{}',
      )
      .run();
    await expect(
      database
        .prepare(
          `INSERT INTO leftout_report_publication_links (report_id, public_id)
           VALUES (?, ?)`,
        )
        .bind(reportId, publicId)
        .run(),
    ).rejects.toThrow('publication_link_snapshot_mismatch');
  }, 15_000);

  it('migrates existing publications to public IDs without losing private links', async () => {
    const legacyMiniflare = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default { fetch() { return new Response("ok"); } }',
        d1Databases: { REPORTS: randomUUID() },
      }),
    );
    try {
      const legacyDatabase = (await legacyMiniflare.getD1Database(
        'REPORTS',
      )) as unknown as D1Database;
      await applyReportingMigration(legacyDatabase, migrationUrls.slice(0, -1));
      const reportId = randomUUID();
      const firstEventId = randomUUID();
      const publicId = randomUUID();
      const firstSha = '1'.repeat(64);
      const publicSha = '2'.repeat(64);
      await legacyDatabase
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
          firstSha,
          '{}',
        )
        .run();
      await legacyDatabase
        .prepare(
          `INSERT INTO leftout_report_events (
            event_id, report_id, sequence, revision, at, actor_id, actor_role,
            request_id, from_state, to_state, payload_sha256,
            previous_event_sha256, event_sha256, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          firstEventId,
          reportId,
          1,
          1,
          '2026-09-02T19:00:00.000Z',
          'invitation.test-alpha',
          'intake',
          randomUUID(),
          'received',
          'quarantined',
          '3'.repeat(64),
          null,
          firstSha,
          '{}',
        )
        .run();
      await legacyDatabase
        .prepare(
          `UPDATE leftout_report_records
           SET revision = 2, state = 'published', updated_at = ?,
               last_event_sha256 = ? WHERE id = ?`,
        )
        .bind('2026-09-02T19:01:00.000Z', publicSha, reportId)
        .run();
      await legacyDatabase
        .prepare(
          `INSERT INTO leftout_report_events (
            event_id, report_id, sequence, revision, at, actor_id, actor_role,
            request_id, from_state, to_state, payload_sha256,
            previous_event_sha256, event_sha256, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          publicId,
          reportId,
          2,
          2,
          '2026-09-02T19:01:00.000Z',
          'publisher-alpha',
          'publisher',
          randomUUID(),
          'accepted_private',
          'published',
          '4'.repeat(64),
          firstSha,
          publicSha,
          '{}',
        )
        .run();
      await legacyDatabase
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
          '5'.repeat(64),
          '{}',
        )
        .run();

      await applyReportingMigration(legacyDatabase, migrationUrls.slice(-1));
      expect(
        await legacyDatabase
          .prepare(
            `SELECT publication.public_id AS publicId, link.report_id AS reportId
             FROM leftout_report_publications AS publication
             JOIN leftout_report_publication_links AS link
               ON link.public_id = publication.public_id`,
          )
          .first(),
      ).toEqual({ publicId, reportId });
      const columns = await legacyDatabase
        .prepare('PRAGMA table_info(leftout_report_publications)')
        .all<{ name: string }>();
      expect(columns.results.map((column) => column.name)).not.toContain(
        'report_id',
      );
    } finally {
      await legacyMiniflare.dispose();
    }
  }, 15_000);
});
