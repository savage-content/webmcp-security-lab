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
    invocation: 'observed',
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

  it('exposes the unsupported universal claim in the vulnerable client observation', () => {
    const outcome = run('client-discovery-variance');
    const result = outcome.rawResult as Record<string, unknown>;

    expect(result.universal_support_verified).toBe(false);
    expect(outcome.after.discovery).toBe('discovered');
    expect(outcome.after.invocation).toBe('observed');
    expect(outcome.verdict).toBe('FAIL');
  });

  it('passes secure retests across the five-fixture curriculum', () => {
    for (const scenario of scenarios) {
      const outcome = runScenario(
        scenario.id,
        structuredClone(scenario.initialState),
        scenario.secureDefaultArguments,
        {
          ...context,
          channel: 'secure-retest',
          confirmation: {
            ...context.confirmation,
            presentedCopy: scenario.secureConfirmationCopy,
            source: 'builder-retest',
          },
        },
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
      {
        ...context,
        channel: 'secure-retest',
        confirmation: {
          ...context.confirmation,
          presentedCopy: scenario.secureConfirmationCopy,
          source: 'builder-retest',
        },
      },
      true,
    );

    expect(outcome.after).toEqual(outcome.before);
    expect(outcome.sideEffects).toEqual([]);
  });

  it('limits the secure notice contract to one 80-character profile-banner field', () => {
    const scenario = scenarioById['over-broad-schema'];
    const outcome = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      context,
      true,
    );
    const properties = scenario.secureTool.inputSchema.properties as Record<
      string,
      { maxLength?: number }
    >;

    expect(Object.keys(properties)).toEqual(['notice']);
    expect(properties.notice?.maxLength).toBe(80);
    expect(scenario.secureTool.inputSchema.additionalProperties).toBe(false);
    expect(() =>
      validateArguments(
        scenario.id,
        { notice: 'Okay', instruction: 'Hidden authority' },
        true,
      ),
    ).toThrow();
    expect(outcome.after.target).toBe('profile-banner');
    expect(outcome.after.agentApproved).toBe(false);
    expect(outcome.verdict).toBe('PASS');
  });

  it('isolates instruction-shaped carrier text with no follow-on action', () => {
    const scenario = scenarioById['tool-result-injection'];
    const outcome = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      context,
      true,
    );
    const result = outcome.rawResult as Record<string, unknown>;

    expect(scenario.secureTool.annotations.untrustedContentHint).toBe(true);
    expect(result.untrusted_carrier_text).toContain('Ignore prior instructions');
    expect(result).not.toHaveProperty('untrusted_carrier_message');
    expect(outcome.after).toEqual(outcome.before);
    expect(outcome.sideEffects).toEqual([]);
    expect(outcome.verdict).toBe('PASS');
  });

  it('requires exact On-to-Off approval for the secure subscription mutation', () => {
    const scenario = scenarioById['confirmation-mismatch'];
    const approvedContext: RunContext = {
      ...context,
      channel: 'secure-retest',
      confirmation: {
        presentedCopy: scenario.secureConfirmationCopy,
        known: true,
        approved: true,
        source: 'builder-retest',
      },
    };
    const approved = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      approvedContext,
      true,
    );
    const vague = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      {
        ...approvedContext,
        confirmation: {
          ...approvedContext.confirmation,
          presentedCopy: 'Run the secure retest.',
        },
      },
      true,
    );
    const negated = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      {
        ...approvedContext,
        confirmation: {
          ...approvedContext.confirmation,
          presentedCopy:
            'Security lab digest is On; keep it On—changing to Off is not approved.',
        },
      },
      true,
    );

    expect(scenario.secureTool.name).toBe(
      'set_training_notification_subscription',
    );
    expect(scenario.secureTool.annotations.readOnlyHint).toBe(false);
    expect(approved.before.subscribed).toBe(true);
    expect(approved.after.subscribed).toBe(false);
    expect(approved.rawResult).toMatchObject({
      applied: true,
      subscription_state: false,
      message: 'Subscription updated.',
    });
    expect(approved.verdict).toBe('PASS');
    expect(vague.verdict).toBe('FAIL');
    expect(negated.verdict).toBe('FAIL');
  });

  it.each([
    {
      browserSupport: 'unsupported' as const,
      registration: 'unsupported' as const,
      permissionsPolicy: 'unknown' as const,
      discovery: 'unsupported' as const,
      invocation: 'not-observed' as const,
    },
    {
      browserSupport: 'supported' as const,
      registration: 'denied' as const,
      permissionsPolicy: 'blocked' as const,
      discovery: 'not-checked' as const,
      invocation: 'not-observed' as const,
    },
    {
      browserSupport: 'supported' as const,
      registration: 'registered' as const,
      permissionsPolicy: 'allowed' as const,
      discovery: 'not-checked' as const,
      invocation: 'not-observed' as const,
    },
    {
      browserSupport: 'supported' as const,
      registration: 'registered' as const,
      permissionsPolicy: 'allowed' as const,
      discovery: 'discovered' as const,
      invocation: 'not-observed' as const,
    },
    {
      browserSupport: 'supported' as const,
      registration: 'registered' as const,
      permissionsPolicy: 'allowed' as const,
      discovery: 'discovered' as const,
      invocation: 'observed' as const,
    },
  ])('records five independent, scoped WebMCP stages: $registration/$invocation', (stage) => {
    const scenario = scenarioById['client-discovery-variance'];
    const matrixContext: RunContext = {
      ...context,
      channel: 'secure-retest',
      webMcp: {
        ...context.webMcp,
        ...stage,
      },
      confirmation: {
        presentedCopy: scenario.secureConfirmationCopy,
        known: true,
        approved: true,
        source: 'builder-retest',
      },
    };
    const outcome = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      scenario.secureDefaultArguments,
      matrixContext,
      true,
    );
    const result = outcome.rawResult as {
      claim: string;
      observed: Record<string, unknown>;
    };

    expect(Object.keys(scenario.secureTool.inputSchema.properties as object)).toEqual([
      'client_label',
    ]);
    expect(() =>
      validateArguments(
        scenario.id,
        { client_label: 'Unit test', discovered: true },
        true,
      ),
    ).toThrow();
    expect(result.claim).toBe('scoped-client-observation');
    expect(result.observed).toMatchObject({
      browser_api_support: stage.browserSupport,
      registration: stage.registration,
      permissions_policy: stage.permissionsPolicy,
      discovery: stage.discovery,
      invocation: stage.invocation,
      client: 'This browser session',
      observed_at: context.now,
    });
    expect(JSON.stringify(result)).not.toContain('universal');
    expect(outcome.verdict).toBe('PASS');
  });

  it('does not mistake a client label for a universal-support claim', () => {
    const scenario = scenarioById['client-discovery-variance'];
    const outcome = runScenario(
      scenario.id,
      structuredClone(scenario.initialState),
      { client_label: 'Universal QA Browser' },
      {
        ...context,
        channel: 'secure-retest',
        confirmation: {
          presentedCopy: `${scenario.secureConfirmationCopy} Named client: Universal QA Browser.`,
          known: true,
          approved: true,
          source: 'builder-retest',
        },
      },
      true,
    );

    expect(outcome.verdict).toBe('PASS');
  });

  it('fails a scoped observation if the fixture carries extra mutable state', () => {
    const scenario = scenarioById['client-discovery-variance'];
    const outcome = runScenario(
      scenario.id,
      { ...structuredClone(scenario.initialState), unrelatedAuthority: false },
      scenario.secureDefaultArguments,
      {
        ...context,
        channel: 'secure-retest',
        confirmation: {
          presentedCopy: scenario.secureConfirmationCopy,
          known: true,
          approved: true,
          source: 'builder-retest',
        },
      },
      true,
    );

    expect(outcome.verdict).toBe('FAIL');
  });
});
