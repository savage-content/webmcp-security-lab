import { describe, expect, it } from 'vitest';

import { assessScenarioRisk, createPolicyArtifact } from '../lib/lab/risk';
import { scenarioById, scenarios } from '../lib/lab/scenarios';

describe('shared WebMCP awareness policy engine', () => {
  it.each([
    ['read-only-claim', 'WMC-001'],
    ['over-broad-schema', 'WMC-002'],
    ['tool-result-injection', 'WMC-003'],
    ['confirmation-mismatch', 'WMC-001'],
    ['client-discovery-variance', 'WMC-005'],
  ] as const)('fires the expected rule for %s', (scenarioId, ruleId) => {
    const assessment = assessScenarioRisk(scenarioById[scenarioId]);
    expect(assessment.findings.map((finding) => finding.ruleId)).toContain(
      ruleId,
    );
  });

  it('maps meaningful findings to ask and support overclaims to warn', () => {
    expect(
      assessScenarioRisk(scenarioById['read-only-claim']).policyAction,
    ).toBe('ask');
    expect(
      assessScenarioRisk(scenarioById['client-discovery-variance'])
        .policyAction,
    ).toBe('warn');
  });

  it('produces explicitly non-enforceable learning policies for every fixture', () => {
    for (const scenario of scenarios) {
      const assessment = assessScenarioRisk(scenario);
      const artifact = createPolicyArtifact(scenario, assessment);
      expect(artifact.enforceable).toBe(false);
      expect(artifact.purpose).toBe('learning-only');
      expect(artifact.match.toolName).toBe(scenario.tool.name);
      expect(artifact.decision.rules.length).toBeGreaterThan(0);
      expect(artifact.limitation).toContain('self-reported evidence readiness');
    }
  });
});
