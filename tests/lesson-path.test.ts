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
const experienceChooserSource = readFileSync(
  resolve('components/lab/experience-chooser.tsx'),
  'utf8',
);
const firstVisitTourSource = readFileSync(
  resolve('components/lab/first-visit-tour.tsx'),
  'utf8',
);
const conformanceSource = readFileSync(
  resolve('components/conformance/site-tools-conformance.tsx'),
  'utf8',
);
const demoScript = readFileSync(resolve('docs/DEMO_SCRIPT.md'), 'utf8');

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

  it('explains native Site Tools and the no-invocation learning path', () => {
    const normalizedGuide = guidedLessonSource.replace(/\s+/gu, ' ');
    expect(guidedLessonSource).toContain('First time here?');
    expect(guidedLessonSource).toContain('Use Site Tools directly');
    expect(guidedLessonSource).toContain('Allow one limited call');
    expect(normalizedGuide).toContain(
      'Client availability still depends on the exact model, workspace, rollout, page registration, and session',
    );
    expect(normalizedGuide).toContain(
      'The native Site Tools path uses this public page and a compatible built-in browser',
    );
    expect(guidedLessonSource).toContain(
      'No agent-driven result is claimed on this path',
    );
  });

  it('keeps the guided route on the connected agent and the direct self-test in advanced controls', () => {
    expect(capabilityLessonSource).toContain(
      'Copy this message into the chat that owns this browser',
    );
    expect(capabilityLessonSource).toContain(
      'If the agent calls the Site Tool, its receipt appears here',
    );
    expect(capabilityLessonSource).not.toContain(
      'Run the approved WebMCP action once',
    );
    expect(capabilityLessonSource).toContain('Invoke through WebMCP');
    expect(capabilityLessonSource).toContain('Continue to Lesson 2');
    expect(capabilityLessonSource).not.toContain(
      'Run local practice check once',
    );
  });

  it('gives Lesson 1 a copyable exact agent handoff instead of a dead-end instruction', () => {
    const normalizedCapability = capabilityLessonSource.replace(/\s+/gu, ' ');
    expect(normalizedCapability).toContain(
      'Run my approved TRAINING-1042 eligibility check once. Do not retry or use another Site Tool.',
    );
    expect(capabilityLessonSource).toContain('Copy request for my agent');
    expect(capabilityLessonSource).toContain(
      'do not trust a chat-only PASS or receipt ID',
    );
    expect(capabilityLessonSource).toContain("['3', 'Ask agent']");
    expect(capabilityLessonSource).toContain(
      'Copied — return to this browser’s chat and send it.',
    );
    expect(capabilityLessonSource).toContain(
      'Copy was blocked — select the exact request above',
    );
  });

  it('keeps Local Guard out of the public setup and judged demo path', () => {
    expect(labAppSource).not.toContain('Use the Local Guard');
    expect(experienceChooserSource).not.toContain('local-guard');
    expect(experienceChooserSource).not.toContain('Local Guard');
    expect(firstVisitTourSource).not.toContain('Local Guard');
    expect(guidedLessonSource).not.toContain('Local Guard');
    expect(capabilityLessonSource).not.toContain('Local Guard');
    expect(capabilityLessonSource).not.toContain('connected local agent');
    expect(labAppSource).not.toContain('window.postMessage');
    expect(labAppSource).not.toContain('createCapabilityPermitHandoff');
    expect(capabilityLessonSource).not.toContain('Export extension permit');
    expect(generatedCapabilitySource).not.toContain('onOfferPermit');
    expect(conformanceSource).not.toContain('External browser + Membrane');
    expect(conformanceSource).toContain(
      'Experimental browser-guard research is future work',
    );
    expect(demoScript).not.toContain('Local Guard');
    expect(labAppSource).toContain('Experimental developer preview');
    expect(labAppSource).toContain(
      'Local Guard is future work, not part of this judged flow.',
    );
  });

  it('records page-guided proposal provenance separately from a harness', () => {
    const registeredStart = capabilityLessonSource.indexOf(
      'const declaration = createProposalToolDeclaration(intent)',
    );
    const guidedStart = capabilityLessonSource.indexOf(
      'async function prepareGuidedApproval()',
    );
    const advancedStart = capabilityLessonSource.indexOf(
      'Stage exact proposal (harness)',
    );
    expect(registeredStart).toBeGreaterThan(-1);
    expect(guidedStart).toBeGreaterThan(registeredStart);
    expect(advancedStart).toBeGreaterThan(guidedStart);
    expect(
      capabilityLessonSource.slice(registeredStart, guidedStart),
    ).toContain("stageProposal(input, 'webmcp')");
    expect(capabilityLessonSource.slice(guidedStart, advancedStart)).toContain(
      "'page-lesson'",
    );
    expect(capabilityLessonSource.slice(advancedStart - 500)).toContain(
      "'fallback-harness'",
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

  it('starts each live lesson in a fresh browser document', () => {
    const normalizedApp = labAppSource.replace(/\s+/gu, ' ');
    expect(normalizedApp).toContain(
      "experienceMode === 'site-tools' && siteToolsSupport === 'available'",
    );
    expect(normalizedApp).toContain(
      'sourceRegistrationControllerRef.current?.abort();',
    );
    expect(normalizedApp).toContain('window.location.reload();');
    expect(normalizedApp.indexOf('JSON.stringify(checkpoint)')).toBeLessThan(
      normalizedApp.indexOf('window.location.reload();'),
    );
    expect(guidedLessonSource).toContain('the previous Site Tool is fully');
    expect(guidedLessonSource).toContain('your progress remains saved');
  });

  it('persists only the novice checkpoint and gates lessons on a viable setup', () => {
    expect(labAppSource).toContain('NOVICE_JOURNEY_STORAGE_KEY');
    expect(labAppSource).toContain('createNoviceJourneyCheckpoint');
    expect(labAppSource).toContain('Confirm a viable setup first.');
    expect(labAppSource).toContain(
      'No approval or live authority was restored.',
    );
    expect(labAppSource).toContain('Last receipt checkpoint:');
    expect(labAppSource).toContain('restoreNoviceJourneyCheckpoint');
    expect(labAppSource).toContain("recovery === 'retired-local-guard'");
    expect(labAppSource).toContain('Lesson progress was preserved');
    expect(labAppSource).toContain('Preview safe report');
    expect(labAppSource).toContain('Save full receipt');
  });

  it('does not offer retry-shaped handoff controls outside the ready state', () => {
    expect(guidedLessonSource).toContain(
      "const canRequestAgent = capability.status === 'ready'",
    );
    expect(guidedLessonSource).toContain("capability.status === 'failed'");
    expect(guidedLessonSource).toContain('Reset this synthetic lesson');
  });

  it('keeps the fallback learning path genuinely read-only', () => {
    expect(capabilityLessonSource).toContain(
      'This path stops before approval or registration of a',
    );
    expect(capabilityLessonSource).toContain('Read-only inspection complete');
  });

  it('discards stale registration settlements before showing the native action as ready', () => {
    const normalizedGenerated = generatedCapabilitySource.replace(/\s+/gu, ' ');
    expect(normalizedGenerated).toContain(
      "setStatus('ready'); setMessage( 'The exact one-use Site Tool is registered on this public page.",
    );
    expect(
      normalizedGenerated.indexOf('setRegistration(statusResult)'),
    ).toBeGreaterThan(
      normalizedGenerated.indexOf(
        "if (settlement === 'discard-stale-registration')",
      ),
    );
    expect(normalizedGenerated.indexOf("setStatus('ready')")).toBeGreaterThan(
      normalizedGenerated.indexOf('setRegistration(statusResult)'),
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
    expect(normalizedGuide).not.toContain('Using the Left Out local relay');
    expect(guidedLessonSource).toContain('Copy request for my agent');
    expect(guidedLessonSource).toContain(
      'Copy was blocked — select the exact request above',
    );
    expect(guidedLessonSource).toContain('No technical names needed');
    expect(guidedLessonSource).toContain(
      'Do not trust a chat-only PASS or receipt ID',
    );
    expect(normalizedGuide).toContain(
      'If it cannot find exactly one, it should stop without calling anything.',
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
