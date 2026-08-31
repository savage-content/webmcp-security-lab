import { env } from 'cloudflare:workers';
import { and, desc, eq } from 'drizzle-orm';

import { parseEvidenceReceipt } from '@/lib/lab/schemas';
import type { EvidenceReceipt, ScenarioId } from '@/lib/lab/types';

import { getDb } from './index';
import { evidenceRuns } from './schema';

let schemaReady: Promise<void> | null = null;

export function ensureEvidenceSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    if (!env.DB) throw new Error('D1 evidence database is unavailable.');

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS evidence_runs (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      scenario_version TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      origin TEXT NOT NULL,
      invocation_channel TEXT NOT NULL,
      verdict TEXT NOT NULL,
      receipt_json TEXT NOT NULL
    )`).run();

    const columnResult = await env.DB
      .prepare('PRAGMA table_info(evidence_runs)')
      .all<{ name: string }>();
    if (!columnResult.results.some((column) => column.name === 'session_id')) {
      await env.DB
        .prepare(
          "ALTER TABLE evidence_runs ADD COLUMN session_id TEXT NOT NULL DEFAULT 'legacy-local-session'",
        )
        .run();
    }

    await env.DB.batch([
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_evidence_runs_timestamp ON evidence_runs(timestamp)',
      ),
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_evidence_runs_session_timestamp ON evidence_runs(session_id, timestamp)',
      ),
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_evidence_runs_scenario_timestamp ON evidence_runs(scenario_id, timestamp)',
      ),
    ]);

    await env.DB.prepare('PRAGMA optimize').run();
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

export async function appendEvidenceReceipt(receipt: EvidenceReceipt) {
  await ensureEvidenceSchema();
  await getDb().insert(evidenceRuns).values({
    id: receipt.id,
    sessionId: receipt.sessionId,
    scenarioId: receipt.scenario.id,
    scenarioVersion: receipt.scenario.version,
    timestamp: receipt.timestamp,
    origin: receipt.origin,
    invocationChannel: receipt.invocation.channel,
    verdict: receipt.verdict,
    receiptJson: JSON.stringify(receipt),
  });
}

export async function listEvidenceReceipts({
  limit = 20,
  scenarioId,
  sessionId,
}: {
  limit?: number;
  scenarioId?: ScenarioId;
  sessionId: string;
}) {
  await ensureEvidenceSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const baseQuery = getDb()
    .select({ receiptJson: evidenceRuns.receiptJson })
    .from(evidenceRuns);

  const rows = scenarioId
    ? await baseQuery
        .where(
          and(
            eq(evidenceRuns.sessionId, sessionId),
            eq(evidenceRuns.scenarioId, scenarioId),
          ),
        )
        .orderBy(desc(evidenceRuns.timestamp))
        .limit(safeLimit)
    : await baseQuery
        .where(eq(evidenceRuns.sessionId, sessionId))
        .orderBy(desc(evidenceRuns.timestamp))
        .limit(safeLimit);

  return rows.map((row) => parseEvidenceReceipt(JSON.parse(row.receiptJson)));
}
