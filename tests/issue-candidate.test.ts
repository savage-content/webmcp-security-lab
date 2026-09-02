import { describe, expect, it } from 'vitest';

import type { ScenarioId, Verdict } from '../lib/lab/types';
import {
  createIssueCandidateFromVerifiedReceipt,
  createSyntheticLessonIssueCandidate,
} from '../products/connector/issue-candidate';
import type { ConnectorReceiptEntry } from '../products/connector/receipt-store';
import { validCapabilityReceipt } from './fixtures/capability-receipt';

async function entryFor(scenarioId: ScenarioId, verdict: Verdict) {
  const receipt = await validCapabilityReceipt();
  receipt.scenario.id = scenarioId;
  receipt.scenario.title = '<script>page-controlled title</script>';
  receipt.verdict = verdict;
  receipt.debrief = 'Page-controlled debrief must stay out.';
  return {
    entryId: 'abc6b79c-c4fc-44b4-b2ce-5da7e525b5fa',
    receipt,
  } as ConnectorReceiptEntry;
}

describe('bounded local issue candidates', () => {
  it('creates a fixed synthetic lesson signal with no site identity', () => {
    const candidate = createSyntheticLessonIssueCandidate();

    expect(candidate.source).toEqual({ kind: 'synthetic-lesson' });
    expect(candidate.draft).toMatchObject({
      context: 'synthetic-lab',
      category: 'annotation-mismatch',
      severity: 'informational',
      stage: 'discovery',
      submission: {
        submittable: false,
        disposition: 'synthetic-not-submittable',
      },
    });
    expect(candidate.draft).not.toHaveProperty('siteOrigin');
  });

  it.each([
    ['read-only-claim', 'annotation-mismatch', 'result'],
    ['over-broad-schema', 'excess-authority', 'approval'],
    ['tool-result-injection', 'untrusted-output', 'result'],
    ['confirmation-mismatch', 'misleading-approval', 'approval'],
    ['client-discovery-variance', 'support-overclaim', 'discovery'],
  ] as const)(
    'maps %s using fixed category and stage copy only',
    async (scenarioId, category, stage) => {
      const candidate = createIssueCandidateFromVerifiedReceipt(
        await entryFor(scenarioId, 'FAIL'),
      );
      expect(candidate.draft).toMatchObject({
        context: 'synthetic-lab',
        category,
        severity: 'medium',
        stage,
      });
      const serialized = JSON.stringify(candidate);
      expect(serialized).not.toContain('page-controlled');
      expect(serialized).not.toContain('Page-controlled');
      expect(serialized).not.toContain('receiptHash');
      expect(serialized).not.toContain('rawResult');
    },
  );

  it.each([
    ['PASS', 'informational'],
    ['INCONCLUSIVE', 'low'],
    ['FAIL', 'medium'],
  ] as const)('bounds %s severity to %s', async (verdict, severity) => {
    const candidate = createIssueCandidateFromVerifiedReceipt(
      await entryFor('read-only-claim', verdict),
    );
    expect(candidate.draft.severity).toBe(severity);
  });
});
