import { describe, expect, it } from 'vitest';

import { createSyntheticLessonIssueCandidate } from '../products/connector/issue-candidate';
import {
  IssueSaveActionManager,
  LocalIssueReviewStore,
} from '../products/connector/issue-review';

describe('session-scoped local issue review', () => {
  it('uses one-use, expiring save actions bound to one report scope', () => {
    let now = Date.parse('2026-09-01T12:00:00.000Z');
    const secrets = [
      'first-action-secret-abcdefghijklmnopqrstuvwxyz',
      'second-action-secret-abcdefghijklmnopqrstuvwxyz',
    ];
    const actions = new IssueSaveActionManager({
      now: () => now,
      secret: () =>
        secrets.shift() ?? 'unused-secret-abcdefghijklmnopqrstuvwxyz',
      ttlMs: 2_000,
    });
    const source = { kind: 'synthetic-lesson' } as const;
    const first = actions.issue('pairing:one', source);

    expect(() => actions.consume(first, 'pairing:two')).toThrow(
      'invalid or expired',
    );
    expect(() => actions.consume(first, 'pairing:one')).toThrow(
      'invalid or expired',
    );

    const second = actions.issue('pairing:one', source);
    now += 2_001;
    expect(() => actions.consume(second, 'pairing:one')).toThrow(
      'invalid or expired',
    );
  });

  it('stores only the strict synthetic draft in a bounded local scope', () => {
    const store = new LocalIssueReviewStore({
      id: () => '4c9d9484-514c-451d-9468-e60579053978',
      now: () => Date.parse('2026-09-01T12:00:00.000Z'),
    });
    const candidate = createSyntheticLessonIssueCandidate();
    const item = store.save('pairing:one', candidate.draft);

    expect(item).toEqual({
      schemaVersion: 'leftout.local-issue-review/1',
      id: '4c9d9484-514c-451d-9468-e60579053978',
      savedAt: '2026-09-01T12:00:00.000Z',
      reviewState: 'local-only',
      draft: candidate.draft,
    });
    expect(store.list('pairing:one')).toEqual([item]);
    expect(store.list('pairing:two')).toEqual([]);
    const serialized = JSON.stringify(item);
    for (const forbidden of [
      'entryId',
      'receiptId',
      'pageUrl',
      'toolArguments',
      'toolResult',
      'capabilityPermit',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    store.revokeScope('pairing:one');
    expect(store.list('pairing:one')).toEqual([]);
  });

  it('rejects a public-web or local-exercise draft from the practice list', () => {
    const store = new LocalIssueReviewStore();
    const base = {
      schemaVersion: 'leftout.issue-draft/1',
      category: 'annotation-mismatch',
      severity: 'informational',
      stage: 'discovery',
      assuranceLimitation:
        'This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.',
    } as const;

    expect(() =>
      store.save('scope', {
        ...base,
        context: 'local-exercise',
        submission: {
          submittable: false,
          disposition: 'local-exercise-not-submittable',
        },
      }),
    ).toThrow('synthetic lesson drafts only');
  });
});
