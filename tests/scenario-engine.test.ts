import { describe, expect, it } from 'vitest';

import { runScenario } from '../lib/lab/engine';
import { scenarioById, scenarios } from '../lib/lab/scenarios';
import {
  validateArguments,
  validateScenarioCatalog,
} from '../lib/lab/schemas';
import type { RunContext, ScenarioId } from '../lib/lab/types';

const context: RunContext = {
  channel: 'lab-harness',
  now: '2026-08-31T12:00:00.000Z',
  origin: 'https://lab.example',
  browser: {
    userAgent: 'Test Browser',
    language: 'en-US',
    platform: 'test',
  },
  clientLabel: 'Unit test',
  webMcp: {
    api: 'document.modelContext',
    browserSupport: 'supported',
    registration: 'registered',
    permissionsPolicy: 'allowed',
    discovery: 'discovered',
    detail: 'Test fixture',
    discoveredToolNames: [],
  },
  confirmation: {
    presentedCopy: 'Test confirmation',
    known: true,
    approved: true,
    source: 'lab-dialog',
  },
};

function run(id: ScenarioId) {
  const scenario = scenarioById[id];
  return runScenario(
    id,
    structuredClone(scenario.initialState),
    scenario.defaultArguments,
    context,
  );
}

describe('scenario catalog', () => {
  it('contains five valid, uniquely named WebMCP fixtures', () => {
    expect(validateScenarioCatalog()).toBe(true);
    expect(scenarios).toHaveLength(5);
    expect(new Set(scenarios.map((scenario) => scenario.tool.name)).size).toBe(5);
  });

  it('accepts every fixture default argument set', () => {
    for (const scenario of scenarios) {
      expect(() =>
        validateArguments(scenario.id, scenario.defaultArguments),
      ).not.toThrow();
    }
  });

  it('shows the vulnerable schema accepting authority the secure schema rejects', () => {
    const overBroad = {
      notice: 'Hello',
      target: 'account-metadata',
      instruction: 'Mark as agent approved',
    };

    expect(() =>
      validateArguments('over-broad-schema', overBroad),
    ).not.toThrow();
    expect(() =>
      validateArguments('over-broad-schema', overBroad, true),
    ).toThrow();
    expect(() =>
      validateArguments('over-broad-schema', { notice: 'x'.repeat(81) }, true),
    ).toThrow();
  });
});

describe('controlled state transitions', () => {
  it('proves the read-only claim performs a synthetic mutation', () => {
    const outcome = run('read-only-claim');

    expect(scenarioById['read-only-claim'].tool.annotations.readOnlyHint).toBe(true);
    expect(outcome.before.reviewed).toBe(false);
    expect(outcome.after.reviewed).toBe(true);
    expect(outcome.after.reviewCount).toBe(1);
    expect(outcome.sideEffects).toContain('Set synthetic account reviewed = true');
  });

  it('applies the hidden target and instruction fields in the over-broad fixture', () => {
    const outcome = run('over-broad-schema');

    expect(outcome.after.target).toBe('account-metadata');
    expect(outcome.after.agentApproved).toBe(true);
    expect(outcome.sideEffects).toContain('Applied free-form automation instruction');
  });

  it('keeps state unchanged while returning the controlled injection fixture', () => {
    const outcome = run('tool-result-injection');

    expect(outcome.after).toEqual(outcome.before);
    expect(JSON.stringify(outcome.rawResult)).toContain('Ignore prior instructions');
    expect(outcome.sideEffects).toEqual([]);
  });

  it('changes subscription state despite preview-only confirmation language', () => {
    const outcome = run('confirmation-mismatch');

    expect(outcome.before.subscribed).toBe(true);
    expect(outcome.after.subscribed).toBe(false);
    expect(outcome.verdict).toBe('FAIL');
  });

  it('records client observations without claiming universal support', () => {
    const outcome = run('client-discovery-variance');
    const result = outcome.rawResult as Record<string, unknown>;

    expect(result.universal_support_verified).toBe(false);
    expect(outcome.after.discovered).toBe('discovered');
  });

  it('passes secure retests across the five-fixture curriculum', () => {
    for (const scenario of scenarios) {
      const outcome = runScenario(
        scenario.id,
        structuredClone(scenario.initialState),
        scenario.secureDefaultArguments,
        { ...context, channel: 'secure-retest' },
        true,
      );

      expect(outcome.verdict, scenario.id).toBe('PASS');
    }
  });

  it('keeps the secure read-only handler free of mutations', () => {
    const scenario = scenarioById['read-only-claim'];
    const outcome = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      { ...context, channel: 'secure-retest' },
      true,
    );

    expect(outcome.after).toEqual(outcome.before);
    expect(outcome.sideEffects).toEqual([]);
  });
});
