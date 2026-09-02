import { describe, expect, it } from 'vitest';

import {
  createIssueDashboardDocument,
  createIssueReviewListDocument,
  ISSUE_PREVIEW_CONDITIONAL_FIELDS,
  ISSUE_PREVIEW_EXCLUDED_FIELDS,
  ISSUE_PREVIEW_INCLUDED_FIELDS,
} from '../products/connector/issue-dashboard';
import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';

describe('scriptless privacy-safe issue preview', () => {
  it('shows the exact practice-draft field boundary and local-only gates', () => {
    const document = createIssueDashboardDocument({
      actionToken: 'bounded-action-token-abcdefghijklmnopqrstuvwxyz',
    });

    expect(document.draft).toMatchObject({
      context: 'synthetic-lab',
      submission: {
        submittable: false,
        disposition: 'synthetic-not-submittable',
      },
    });
    for (const field of ISSUE_PREVIEW_INCLUDED_FIELDS) {
      expect(document.html).toContain(`<code>${field}</code>`);
    }
    for (const field of ISSUE_PREVIEW_EXCLUDED_FIELDS) {
      expect(document.html).toContain(`<code>${field}</code>`);
    }
    for (const field of ISSUE_PREVIEW_CONDITIONAL_FIELDS) {
      expect(document.html).toContain(`<code>${field}</code>`);
    }
    expect(document.html).toContain(ISSUE_DRAFT_ASSURANCE_LIMITATION);
    expect(document.html).toContain('Nothing has been sent');
    expect(document.html).toContain(
      '<strong>2 · Human review:</strong> no reviewer is connected',
    );
    expect(document.html).toContain('Feed eligibility remains zero');
    expect(document.html).toContain('action="/issues/save"');
    expect(document.html).toContain('name="action_token"');
    expect(document.html).toContain('href="/issues/review"');
  });

  it('contains one explicit local form but no script, free text, or outbound surface', () => {
    const document = createIssueDashboardDocument({
      actionToken: 'bounded-action-token-abcdefghijklmnopqrstuvwxyz',
    });

    expect(document.html).not.toContain('<script');
    expect(document.html.match(/<form\b/gu)).toHaveLength(1);
    expect(document.html.match(/<button\b/gu)).toHaveLength(1);
    expect(document.html).not.toContain('<textarea');
    expect(document.html).not.toContain('http://');
    expect(document.html).not.toContain('https://');
    expect(document.contentSecurityPolicy).toContain("connect-src 'none'");
    expect(document.contentSecurityPolicy).toContain("script-src 'none'");
    expect(document.contentSecurityPolicy).toContain("form-action 'self'");
  });

  it('renders an honest local list with zero feed eligibility', () => {
    const preview = createIssueDashboardDocument();
    const document = createIssueReviewListDocument([
      {
        schemaVersion: 'leftout.local-issue-review/1',
        id: '4c9d9484-514c-451d-9468-e60579053978',
        savedAt: '2026-09-01T12:00:00.000Z',
        reviewState: 'local-only',
        draft: preview.draft,
      },
    ]);

    expect(document.html).toContain("not LeftOut Security's inbox");
    expect(document.html).toContain('1 locally saved · 0 feed eligible');
    expect(document.html).toContain('<strong>0 eligible records.</strong>');
    expect(document.html).toContain('Saved locally · not submitted');
    expect(document.html).toContain(ISSUE_DRAFT_ASSURANCE_LIMITATION);
    expect(document.html).not.toContain('4c9d9484-514c-451d-9468-e60579053978');
    expect(document.html).not.toContain('<script');
    expect(document.html).not.toContain('<form');
    expect(document.html).not.toContain('http://');
    expect(document.html).not.toContain('https://');
    expect(document.contentSecurityPolicy).toContain("form-action 'none'");
  });
});
