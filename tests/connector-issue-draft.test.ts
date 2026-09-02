import { describe, expect, it } from 'vitest';

import {
  createPrivacySafeIssueDraft,
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
} from '../products/connector/issue-draft';

const publicDraft = {
  context: 'public-web',
  category: 'unexpected-tool-change',
  severity: 'high',
  stage: 'registration',
  siteOrigin: 'https://shop.example.com',
} as const;

describe('privacy-safe connector issue drafts', () => {
  it('creates a bounded public observation that still requires human review', () => {
    const draft = createPrivacySafeIssueDraft(publicDraft);

    expect(draft).toEqual({
      schemaVersion: 'leftout.issue-draft/1',
      ...publicDraft,
      submission: {
        submittable: false,
        disposition: 'human-review-required',
      },
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    });
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.submission)).toBe(true);
  });

  it.each([
    ['context', { ...publicDraft, context: 'customer-production' }],
    ['category', { ...publicDraft, category: 'Something looked suspicious' }],
    ['severity', { ...publicDraft, severity: 'urgent please investigate' }],
    ['stage', { ...publicDraft, stage: 'while I was browsing' }],
  ])('rejects unbounded %s text', (_field, input) => {
    expect(() => createPrivacySafeIssueDraft(input)).toThrow(
      'supported values',
    );
  });

  it('rejects unknown fields instead of retaining free text', () => {
    expect(() =>
      createPrivacySafeIssueDraft({
        ...publicDraft,
        description: 'Copied page content must never enter the draft.',
      }),
    ).toThrow('unknown field: description');
  });

  it.each([
    'http://public.example.com',
    'https://localhost',
    'https://service.local',
    'https://service.internal',
    'https://intranet',
    'https://127.0.0.1',
    'https://10.2.3.4',
    'https://203.0.113.8',
    'https://[::1]',
    'https://user:password@public.example.com',
    'https://public.example.com:8443',
    'https://public.example.com/',
    'https://public.example.com/private/path',
    'https://public.example.com?account=123',
    'https://public.example.com#tool-name',
  ])('blocks identifying or non-public origin input %s', (siteOrigin) => {
    expect(() =>
      createPrivacySafeIssueDraft({ ...publicDraft, siteOrigin }),
    ).toThrow();
  });

  it.each([
    ['synthetic-lab', 'synthetic-not-submittable'],
    ['local-exercise', 'local-exercise-not-submittable'],
  ] as const)(
    'marks %s observations explicitly non-submittable',
    (context, disposition) => {
      const draft = createPrivacySafeIssueDraft({
        context,
        category: 'annotation-mismatch',
        severity: 'informational',
        stage: 'discovery',
      });

      expect(draft).not.toHaveProperty('siteOrigin');
      expect(draft.submission).toEqual({
        submittable: false,
        disposition,
      });
      expect(() =>
        createPrivacySafeIssueDraft({
          context,
          category: 'annotation-mismatch',
          severity: 'informational',
          stage: 'discovery',
          siteOrigin: 'https://public.example.com',
        }),
      ).toThrow('cannot include a site origin');
    },
  );

  it('rejects missing fields and non-object input', () => {
    expect(() => createPrivacySafeIssueDraft(undefined)).toThrow(
      'must be an object',
    );
    expect(() =>
      createPrivacySafeIssueDraft({
        context: 'public-web',
        category: 'annotation-mismatch',
        severity: 'medium',
        siteOrigin: 'https://public.example.com',
      }),
    ).toThrow('Issue stage');
  });
});
