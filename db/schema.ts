import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const evidenceRuns = sqliteTable(
  'evidence_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    scenarioId: text('scenario_id').notNull(),
    scenarioVersion: text('scenario_version').notNull(),
    timestamp: text('timestamp').notNull(),
    origin: text('origin').notNull(),
    invocationChannel: text('invocation_channel').notNull(),
    verdict: text('verdict').notNull(),
    receiptJson: text('receipt_json').notNull(),
  },
  (table) => [
    index('idx_evidence_runs_timestamp').on(table.timestamp),
    index('idx_evidence_runs_session_timestamp').on(
      table.sessionId,
      table.timestamp,
    ),
    index('idx_evidence_runs_scenario_timestamp').on(
      table.scenarioId,
      table.timestamp,
    ),
  ],
);
