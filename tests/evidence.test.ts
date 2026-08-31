import { describe, expect, it } from 'vitest';

import { createEvidenceReceiptArtifact } from '../lib/lab/artifacts';
import { createEvidenceReceipt } from '../lib/lab/evidence';
import { runScenario } from '../lib/lab/engine';
import { scenarioById } from '../lib/lab/scenarios';
import { evidenceReceiptSchema } from '../lib/lab/schemas';
import type { RunContext } from '../lib/lab/types';

const context: RunContext = {
  channel: 'webmcp',
  now: '2026-08-31T12:00:00.000Z',
  origin: 'https://lab.example',
  browser: {
    userAgent: 'Test Browser',
    language: 'en-US',
    platform: 'test',
  },
  clientLabel: 'Test client',
  webMcp: {
    api: 'document.modelContext',
    browserSupport: 'supported',
    registration: 'registered',
    permissionsPolicy: 'allowed',
    discovery: 'not-checked',
    detail: 'External client discovery is not observable.',
    discoveredToolNames: [],
  },
  confirmation: {
    presentedCopy: 'Preview only. No settings will change.',
    known: false,
    approved: null,
    source: 'browser-not-observable',
  },
};

describe('evidence receipts', () => {
  it('captures the full effective surface in a schema-valid receipt', () => {
    const scenario = scenarioById['confirmation-mismatch'];
    const outcome = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.defaultArguments,
      context,
    );
    const receipt = createEvidenceReceipt({
      scenario,
      declaration: scenario.tool,
      argumentsValue: scenario.defaultArguments,
      sessionId: '4ecf0c2b-cc5c-4854-a11e-22fa93cc4a1d',
      context,
      outcome,
      id: '6f8f5771-9cde-4f2d-b9f1-66d29ef5a931',
    });

    expect(evidenceReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(receipt.effective.before.subscribed).toBe(true);
    expect(receipt.effective.after.subscribed).toBe(false);
    expect(receipt.invocation.confirmation.known).toBe(false);
    expect(receipt.declaration.name).toBe('preview_notification_preferences');
    expect(receipt.limitation).toBe(
      'This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.',
    );

    const artifact = createEvidenceReceiptArtifact(receipt);
    expect(artifact.filename).toBe(
      `webmcp-evidence-confirmation-mismatch-${receipt.id}.json`,
    );
    expect(JSON.parse(artifact.text)).toEqual(receipt);
  });

  it('rejects receipts missing required evidence fields', () => {
    expect(() =>
      evidenceReceiptSchema.parse({
        id: '6f8f5771-9cde-4f2d-b9f1-66d29ef5a931',
        schemaVersion: '1.0',
      }),
    ).toThrow();
  });
});
