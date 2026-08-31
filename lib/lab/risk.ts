import { SELF_REPORTED_LIMITATION } from './constants';
import type {
  PolicyAction,
  RiskAssessment,
  RiskFinding,
  RiskLevel,
  ScenarioDefinition,
  ToolDeclaration,
} from './types';

const levelRank: Record<RiskLevel, number> = {
  informational: 0,
  caution: 1,
  meaningful: 2,
};

function schemaFields(tool: ToolDeclaration) {
  const properties = tool.inputSchema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return [];
  }
  return Object.keys(properties);
}

function highestLevel(findings: RiskFinding[]): RiskLevel {
  return findings.reduce<RiskLevel>(
    (highest, finding) =>
      levelRank[finding.level] > levelRank[highest] ? finding.level : highest,
    'informational',
  );
}

function policyFor(level: RiskLevel): PolicyAction {
  if (level === 'meaningful') return 'ask';
  if (level === 'caution') return 'warn';
  return 'allow';
}

export function assessScenarioRisk(
  scenario: ScenarioDefinition,
  tool: ToolDeclaration = scenario.tool,
): RiskAssessment {
  const fields = schemaFields(tool);
  const hiddenSchemaFields = fields.filter(
    (field) => !scenario.presented.inputFields.includes(field),
  );
  const findings: RiskFinding[] = [];

  if (tool.annotations.readOnlyHint && scenario.riskProfile.mutatesState) {
    findings.push({
      ruleId: 'WMC-001',
      level: 'meaningful',
      title: 'Read-only claim conflicts with a state change',
      why: 'The annotation can influence an agent’s approval behavior, but it does not constrain the handler.',
    });
  }

  if (
    hiddenSchemaFields.length > 0 ||
    tool.inputSchema.additionalProperties !== false
  ) {
    findings.push({
      ruleId: 'WMC-002',
      level: 'meaningful',
      title: 'The agent receives more authority than the interface shows',
      why:
        hiddenSchemaFields.length > 0
          ? `The declared schema adds ${hiddenSchemaFields.join(', ')} beyond the human-visible fields.`
          : 'The schema accepts undeclared properties, so its authority boundary is open-ended.',
    });
  }

  if (
    scenario.riskProfile.returnsInstructionShapedContent &&
    !tool.annotations.untrustedContentHint
  ) {
    findings.push({
      ruleId: 'WMC-003',
      level: 'meaningful',
      title: 'Instruction-shaped result content is not marked untrusted',
      why: 'A legitimate data result can carry text that an agent must treat as data, never as authority.',
    });
  }

  if (
    scenario.riskProfile.claimsPreviewOnly &&
    scenario.riskProfile.mutatesState
  ) {
    findings.push({
      ruleId: 'WMC-004',
      level: 'meaningful',
      title: 'Approval words do not describe the effective action',
      why: 'The person is asked to approve a preview while the known fixture behavior applies a persistent change.',
    });
  }

  if (scenario.riskProfile.claimsUniversalAvailability) {
    findings.push({
      ruleId: 'WMC-005',
      level: 'caution',
      title: 'Registration is being generalized into universal support',
      why: 'Browser support, policy, registration, client discovery, and invocation are separate observations.',
    });
  }

  const level = highestLevel(findings);
  const fallback: RiskFinding = {
    ruleId: 'WMC-005',
    level: 'informational',
    title: 'No known mismatch detected',
    why: 'The declaration and the known fixture contract are aligned.',
  };
  const primary = findings[0] ?? fallback;

  return {
    level,
    policyAction: policyFor(level),
    headline: primary.title,
    summary:
      level === 'meaningful'
        ? 'Pause before invocation and confirm the exact inputs, effects, and approval language.'
        : level === 'caution'
          ? 'The tool can be explored, but its availability claim should stay scoped to this observed client.'
          : 'The known declaration and effect are aligned for this controlled fixture.',
    findings,
    schemaFields: fields,
    hiddenSchemaFields,
  };
}

export function createPolicyArtifact(
  scenario: ScenarioDefinition,
  assessment: RiskAssessment,
) {
  return {
    schemaVersion: '1.0',
    kind: 'webmcp-awareness-policy',
    generatedAt: new Date().toISOString(),
    match: {
      toolName: scenario.tool.name,
      capabilityFields: assessment.schemaFields,
    },
    decision: {
      action: assessment.policyAction,
      level: assessment.level,
      rules: assessment.findings.map((finding) => finding.ruleId),
      reason: assessment.headline,
    },
    secureTarget: scenario.secureTool,
    testsToAdd: [scenario.builder.testToAdd],
    limitation: SELF_REPORTED_LIMITATION,
  };
}

export function downloadPolicyArtifact(
  scenario: ScenarioDefinition,
  assessment: RiskAssessment,
) {
  const artifact = createPolicyArtifact(scenario, assessment);
  const blob = new Blob([JSON.stringify(artifact, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `webmcp-policy-${scenario.id}.json`;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
