import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { beginnerLessonCopy } from '../lib/lab/lesson-copy';
import { scenarios } from '../lib/lab/scenarios';

const guidedLessonSource = readFileSync(
  resolve('components/lab/guided-security-lesson.tsx'),
  'utf8',
);
const capabilityLessonSource = readFileSync(
  resolve('components/lab/capability-negotiator.tsx'),
  'utf8',
);
const generatedCapabilitySource = readFileSync(
  resolve('components/lab/use-generated-lesson-capability.ts'),
  'utf8',
);
const labAppSource = readFileSync(
  resolve('components/lab/lab-app.tsx'),
  'utf8',
);

describe('beginner WebMCP lesson path', () => {
  it('covers every fixture in the intended five-lesson order', () => {
    expect(Object.keys(beginnerLessonCopy)).toEqual(
      scenarios.map((scenario) => scenario.id),
    );
    expect(scenarios.map((scenario) => scenario.ordinal)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
    ]);
  });

  it.each(scenarios)(
    'gives Lesson $ordinal one plain question, rule, agent stop boundary, and exact approval label',
    (scenario) => {
      const copy = beginnerLessonCopy[scenario.id];
      expect(copy.title.length).toBeGreaterThan(10);
      expect(copy.question.endsWith('?')).toBe(true);
      expect(copy.rule.length).toBeGreaterThan(20);
      expect(copy.redFlag.length).toBeGreaterThan(20);
      expect(copy.agentPrompt).toMatch(/(?:do not|without) invok/iu);
      expect(copy.runLabel).toMatch(/^Approve one|^Approve the/iu);
      expect(scenario.secureTool.inputSchema.additionalProperties).toBe(false);
    },
  );

  it('teaches the five distinct security boundaries rather than one generic warning', () => {
    expect(beginnerLessonCopy['read-only-claim'].rule).toContain(
      'before and after',
    );
    expect(beginnerLessonCopy['over-broad-schema'].rule).toContain(
      'closed schema',
    );
    expect(beginnerLessonCopy['tool-result-injection'].rule).toContain(
      'untrusted content',
    );
    expect(beginnerLessonCopy['confirmation-mismatch'].rule).toContain(
      'approval language',
    );
    expect(beginnerLessonCopy['client-discovery-variance'].why).toContain(
      'separate facts',
    );
  });

  it('explains native Site Tools, the separate Local Guard, and the read-only path', () => {
    const normalizedGuide = guidedLessonSource.replace(/\s+/gu, ' ');
    expect(guidedLessonSource).toContain('First time here?');
    expect(guidedLessonSource).toContain('Use Site Tools directly');
    expect(guidedLessonSource).toContain('Use Sol or Terra');
    expect(guidedLessonSource).toContain('LeftOut Local Guard');
    expect(guidedLessonSource).toContain('Use the local relay');
    expect(normalizedGuide).toContain(
      'No LeftOut extension or local relay is required for the native Site Tools path',
    );
    expect(guidedLessonSource).toContain(
      'separate from native ChatGPT Site Tools',
    );
    expect(guidedLessonSource).toContain(
      'No agent-driven result is claimed on this path',
    );
  });

  it('keeps the guided route on the connected agent and the direct self-test in advanced controls', () => {
    expect(capabilityLessonSource).toContain(
      'Your agent in this built-in browser',
    );
    expect(capabilityLessonSource).toContain('Your connected local agent');
    expect(capabilityLessonSource).toContain(
      'The receipt will appear here automatically',
    );
    expect(capabilityLessonSource).not.toContain(
      'Run the approved WebMCP action once',
    );
    expect(capabilityLessonSource).toContain('Invoke through WebMCP');
    expect(capabilityLessonSource).toContain('Continue to Lesson 2');
    expect(capabilityLessonSource).toContain('In LeftOut Local Guard, confirm');
    expect(capabilityLessonSource).not.toContain(
      'Run local practice check once',
    );
  });

  it('gives Lesson 1 a copyable exact agent handoff instead of a dead-end instruction', () => {
    const normalizedCapability = capabilityLessonSource.replace(/\s+/gu, ' ');
    expect(normalizedCapability).toContain(
      'Run the one approved eligibility check for TRAINING-1042 once. Do not invoke another Site Tool and do not retry.',
    );
    expect(normalizedCapability).toContain(
      'Using the LeftOut local relay, run the one protected eligibility check for TRAINING-1042 once. Do not retry.',
    );
    expect(capabilityLessonSource).toContain('Copy request for my agent');
    expect(capabilityLessonSource).toContain("['3', 'Ask agent']");
    expect(capabilityLessonSource).toContain(
      'Copied — return to this browser’s chat and send it.',
    );
    expect(capabilityLessonSource).toContain(
      'Copy was blocked — select the exact request above',
    );
  });

  it('revokes live authority when the learner changes client paths', () => {
    expect(labAppSource).toContain('key={`${scenario.id}:${experienceMode}`}');
    expect(generatedCapabilitySource).toContain(
      "leaseRef.current?.invalidate('revoked')",
    );
    expect(generatedCapabilitySource).toContain(
      'if (sourceWithdrawnRef.current) onRestoreSourceTool()',
    );
  });

  it('does not offer retry-shaped handoff controls outside the ready state', () => {
    expect(guidedLessonSource).toContain(
      "const canRequestAgent = capability.status === 'ready'",
    );
    expect(guidedLessonSource).toContain("capability.status === 'failed'");
    expect(guidedLessonSource).toContain('Reset this synthetic lesson');
  });

  it('discards stale permit handoffs and late registration evidence', () => {
    const normalizedGenerated = generatedCapabilitySource.replace(/\s+/gu, ' ');
    expect(normalizedGenerated).toContain(
      "setStatus('offering'); setMessage( 'The exact action is registered.",
    );
    expect(normalizedGenerated).toContain(
      "leaseRef.current === lease && lease.state() === 'active'",
    );
    expect(normalizedGenerated).toContain('handoffIsCurrent');
    expect(
      normalizedGenerated.indexOf('setRegistration(statusResult)'),
    ).toBeGreaterThan(
      normalizedGenerated.indexOf(
        "if (settlement === 'discard-stale-registration')",
      ),
    );
  });

  it('compares current synthetic state again before a receipt commit', () => {
    const normalizedGenerated = generatedCapabilitySource.replace(/\s+/gu, ' ');
    expect(generatedCapabilitySource).toContain(
      'The consumed capability stopped because the synthetic state changed during verification.',
    );
    expect(generatedCapabilitySource).toContain(
      'The consumed capability stopped because the synthetic state changed after approval.',
    );
    expect(labAppSource).toContain(
      'The synthetic state changed while the receipt was being verified.',
    );
    expect(
      normalizedGenerated.indexOf('onCommitReceipt(payload, recorded)'),
    ).toBeGreaterThan(
      normalizedGenerated.indexOf(
        "throw new Error( 'The receipt arrived after this lesson was closed.'",
      ),
    );

    const scenarioOneCreatorStart = labAppSource.indexOf(
      'const createLocalCapabilityReceipt',
    );
    const scenarioOneCommitStart = labAppSource.indexOf(
      'const commitLocalCapabilityReceipt',
    );
    const scenarioOneCreator = labAppSource.slice(
      scenarioOneCreatorStart,
      scenarioOneCommitStart,
    );
    expect(scenarioOneCreator).not.toContain('setSecureReceiptMap');
    expect(scenarioOneCreator).not.toContain('setExecutionMessage');

    const normalizedScenarioOne = capabilityLessonSource.replace(/\s+/gu, ' ');
    expect(normalizedScenarioOne).toContain(
      'recorded = await onCreateLocalReceipt(payload)',
    );
    expect(
      normalizedScenarioOne.indexOf('onCommitLocalReceipt(payload, recorded)'),
    ).toBeGreaterThan(
      normalizedScenarioOne.indexOf(
        'Capability invocation was revoked during receipt validation.',
      ),
    );
    expect(labAppSource).toContain(
      'The Scenario 1 state changed while the receipt was being verified.',
    );
  });

  it('rechecks the frozen lesson after async approval validation and before activation', () => {
    const normalizedGenerated = generatedCapabilitySource.replace(/\s+/gu, ' ');
    const validation = normalizedGenerated.indexOf(
      'const beforeActivation = await validateLessonCapabilityBinding',
    );
    const secondStateCheck = normalizedGenerated.indexOf(
      'The frozen contract closed safely because the lesson changed during approval validation.',
    );
    const activation = normalizedGenerated.indexOf(
      'const activation = prepareOneUseActivation',
    );
    expect(validation).toBeGreaterThan(-1);
    expect(secondStateCheck).toBeGreaterThan(validation);
    expect(activation).toBeGreaterThan(secondStateCheck);
  });

  it('gives the human a plain-language agent handoff and a visible safety debrief', () => {
    const normalizedGuide = guidedLessonSource.replace(/\s+/gu, ' ');
    expect(normalizedGuide).toContain(
      'Run the one approved profile-banner update once. Do not invoke any other Site Tool and do not retry.',
    );
    expect(normalizedGuide).toContain(
      'Using the LeftOut local relay, run the one protected profile-banner update once. Do not retry.',
    );
    expect(guidedLessonSource).toContain('Copy request for my agent');
    expect(guidedLessonSource).toContain(
      'Copy was blocked — select the exact request above',
    );
    expect(guidedLessonSource).toContain('No tool IDs or hashes needed');
    expect(normalizedGuide).toContain(
      'If the page or action is ambiguous, it stops without invoking anything.',
    );
    expect(guidedLessonSource).not.toContain('Generated action');
    expect(guidedLessonSource).toContain('Technical binding details');
    expect(guidedLessonSource).toContain('compiled.toolName');
    expect(guidedLessonSource).toContain(
      'What was fixed — and why it is safer',
    );
    expect(guidedLessonSource).toContain('{copy.redFlag}');
    expect(guidedLessonSource).toContain('{copy.rule}');
    expect(guidedLessonSource).toContain('{copy.why}');
  });

  it('recovers from expired approval without a dead button or repeated lesson steps', () => {
    const normalizedGuide = guidedLessonSource.replace(/\s+/gu, ' ');
    expect(guidedLessonSource).toContain('getApprovalWindowStatus');
    expect(normalizedGuide).toContain('Approval expired before anything ran.');
    expect(guidedLessonSource).toContain('Create fresh approval review');
    expect(guidedLessonSource).toContain('Review a fresh approval');
    expect(generatedCapabilitySource).toContain('prepareFresh');
  });

  it('closes the approval dialog before revealing the agent handoff', () => {
    const normalizedGuide = guidedLessonSource.replace(/\s+/gu, ' ');
    expect(normalizedGuide).toContain(
      'const currentWindow = getApprovalWindowStatus( capability.contract?.compiled.expiresAt, Date.now(), );',
    );
    expect(normalizedGuide).toContain(
      'if (currentWindow.expired) { setClockMs(Date.now()); return; }',
    );
    expect(normalizedGuide).toContain(
      'setConfirmOpen(false); setStage(3); void capability.approveAndRegister();',
    );
    expect(guidedLessonSource).toContain('Technical binding details');
    expect(guidedLessonSource).toContain(
      'Approve banner update — does not run',
    );
  });
});
