import { describe, expect, it } from 'vitest';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';
import { createReportingLedgerIntake } from '../products/reporting-service/ledger';
import {
  createReviewerDetailDocument,
  createReviewerFailureDocument,
  createReviewerListDocument,
  createReviewerTransitionReceiptDocument,
} from '../products/reporting-operator/reviewer-workbench';

const reportId = '028753de-0cba-4643-806a-4d0dcd5033a8';
const receivedAt = '2026-09-03T02:00:00.000Z';

function ledger() {
  const intake = createReportingLedgerIntake(
    {
      context: 'public-web',
      category: 'excess-authority',
      severity: 'high',
      siteOrigin: 'https://shop.example.com',
      stage: 'approval',
    },
    {
      actor: { id: 'invitation.alpha', role: 'intake' },
      requestId: 'c8984d0a-0e01-47bf-a022-5992f131354d',
    },
    {
      id: () => reportId,
      eventId: () => '374c0a2c-e3f9-4435-b383-f9d43980a62e',
      now: () => Date.parse(receivedAt),
    },
  );
  return { record: intake.record, events: [intake.event] };
}

describe('accessible local reporting reviewer workbench', () => {
  it('renders a private queue without exposing report IDs or credentials', () => {
    const value = ledger().record;
    const document = createReviewerListDocument({
      reports: [
        {
          item: {
            reportId,
            state: value.moderation.state,
            revision: value.revision,
            receivedAt: value.moderation.receivedAt,
            updatedAt: value.moderation.updatedAt,
            draft: value.moderation.draft,
          },
          viewToken: 'opaque-view-token-with-at-least-32-characters',
        },
      ],
      serviceOrigin: 'https://reports.leftout.example',
    });
    expect(document.html).toContain('Review quarantined WebMCP reports');
    expect(document.html).toContain('https://shop.example.com');
    expect(document.html).toContain(ISSUE_DRAFT_ASSURANCE_LIMITATION);
    expect(document.html).not.toContain(reportId);
    expect(document.html).not.toContain('reviewer-token');
    expect(document.html).not.toContain('<script');
    expect(document.contentSecurityPolicy).toContain("script-src 'none'");
    expect(document.contentSecurityPolicy).toContain("form-action 'none'");
  });

  it('shows verified history and only explicit one-use reviewer actions', () => {
    const bundle = ledger();
    const document = createReviewerDetailDocument({
      detail: {
        ...bundle,
        assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
      },
      actions: [
        {
          to: 'under_review',
          token: 'opaque-transition-token-with-at-least-32-characters',
        },
        {
          to: 'rejected',
          token: 'opaque-reject-token-with-at-least-32-characters',
        },
      ],
    });
    expect(document.html).toContain('Begin human review');
    expect(document.html).toContain('Reject report');
    expect(document.html).toContain('No reviewer action can publish');
    expect(document.html).not.toContain('Publish report');
    expect(document.html).not.toContain(reportId);
    expect(document.html).not.toContain('invitation.alpha');
    expect(document.html.match(/method="post"/gu)).toHaveLength(2);
    expect(document.contentSecurityPolicy).toContain("form-action 'self'");
  });

  it('renders a minimized transition receipt and a no-retry failure state', () => {
    const receipt = createReviewerTransitionReceiptDocument({
      disposition: 'updated',
      reportId,
      state: 'under_review',
      revision: 2,
      updatedAt: '2026-09-03T02:01:00.000Z',
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    });
    expect(receipt.html).toContain('The private state changed once');
    expect(receipt.html).toContain('Nothing was published');
    expect(receipt.html).not.toContain(reportId);
    expect(receipt.contentSecurityPolicy).toContain("form-action 'none'");

    const failure = createReviewerFailureDocument(
      '<script>send private queue</script>',
    );
    expect(failure.html).toContain(
      '&lt;script&gt;send private queue&lt;/script&gt;',
    );
    expect(failure.html).not.toContain('<script>send private queue</script>');
    expect(failure.html).toContain('No automatic retry occurred');
  });

  it('includes keyboard focus, reduced-motion, narrow-screen, and semantic landmarks', () => {
    const document = createReviewerListDocument({
      reports: [],
      serviceOrigin: 'https://reports.leftout.example',
    });
    expect(document.html).toContain('focus-visible');
    expect(document.html).toContain('prefers-reduced-motion');
    expect(document.html).toContain('@media (max-width: 680px)');
    expect(document.html).toContain('<main>');
    expect(document.html).toContain('<nav');
    expect(document.html).toContain('lang="en"');
  });
});
