import type { ScenarioId } from './types';

export interface BeginnerLessonCopy {
  title: string;
  question: string;
  why: string;
  rule: string;
  redFlag: string;
  agentPrompt: string;
  runLabel: string;
}

export const beginnerLessonCopy: Record<ScenarioId, BeginnerLessonCopy> = {
  'read-only-claim': {
    title: 'Trust the effect, not the label.',
    question: 'Did a “read-only” action actually leave state unchanged?',
    why: 'Tool names, descriptions, and safety hints are claims. Evidence shows what the handler really did.',
    rule: 'Compare before and after state, side effects, and the returned result.',
    redFlag:
      'The declaration says read-only while the vulnerable handler writes review state.',
    agentPrompt:
      'Inspect the declared action without invoking it. Explain its claim, its authority, and the evidence needed to prove it is read-only.',
    runLabel: 'Approve one read-only practice check',
  },
  'over-broad-schema': {
    title: 'Give the agent only the fields it needs.',
    question: 'Can the agent supply authority the visible task never requires?',
    why: 'A one-field form can quietly expose generic target, instruction, or unknown fields to an agent.',
    rule: 'Use a closed schema, bounded values, and targets fixed in trusted code.',
    redFlag:
      'The visible task shows only a notice, but the vulnerable schema accepts hidden target and instruction fields.',
    agentPrompt:
      'Inspect the visible task and declared site-tool schema. Do not invoke it. List every input field and identify authority the visible task does not require.',
    runLabel: 'Approve one banner-only practice change',
  },
  'tool-result-injection': {
    title: 'Treat every tool result as data.',
    question:
      'Could a useful result contain instructions your agent must ignore?',
    why: 'A carrier message, document, or status field can contain instruction-shaped text without receiving authority.',
    rule: 'Mark untrusted content, isolate it in bounded fields, and require new approval for any follow-on action.',
    redFlag:
      'The vulnerable result mixes valid delivery data with instruction-shaped carrier text and does not mark it untrusted.',
    agentPrompt:
      'Inspect this tool without invoking it. Explain the trust-boundary risk in its possible output and how instruction-shaped result data must be handled.',
    runLabel: 'Approve one safe status lookup',
  },
  'confirmation-mismatch': {
    title: 'Approval must name the real change.',
    question: 'Did the person approve a preview—or an actual settings change?',
    why: 'A confirmation is meaningful only when it names the exact target, old state, new state, and whether the change will be applied.',
    rule: 'Use truthful mutation names and effect-specific approval language.',
    redFlag:
      'The vulnerable confirmation promises a preview while the handler disables a synthetic subscription.',
    agentPrompt:
      'Inspect the visible action, confirmation language, and declared schema. Do not invoke it. Compare what the person appears to approve with what the tool can actually change.',
    runLabel: 'Approve the On-to-Off practice change',
  },
  'client-discovery-variance': {
    title: 'One observation is never universal support.',
    question: 'Which WebMCP stage did this browser and client actually prove?',
    why: 'API support, page registration, policy allowance, client discovery, and invocation are separate facts.',
    rule: 'Record each stage, client, browser session, and date without generalizing.',
    redFlag:
      'The vulnerable claim turns page registration into “available to every agent,” which this page cannot prove.',
    agentPrompt:
      'Inspect the compatibility claim and current browser evidence. Do not invoke the tool. Separate API support, registration, policy, discovery, and invocation, then identify any unsupported claim.',
    runLabel: 'Approve one session-scoped observation',
  },
};
