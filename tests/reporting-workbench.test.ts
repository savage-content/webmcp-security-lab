import { describe, expect, it } from 'vitest';

import { createPrivacySafeIssueDraft } from '../products/connector/issue-draft';
import {
  createExternalReportFailureDocument,
  createExternalReportFormDocument,
  createExternalReportPreviewDocument,
  createExternalReportReceiptDocument,
  EXTERNAL_REPORT_EXCLUDED_FIELDS,
  EXTERNAL_REPORT_INCLUDED_FIELDS,
} from '../products/connector/reporting-workbench';

const disabled = {
  mode: 'disabled',
  acceptsExternalReports: false,
  automaticRetry: false,
  browserCredentialsExposed: false,
} as const;
const invited = {
  mode: 'invited',
  acceptsExternalReports: true,
  automaticRetry: false,
  browserCredentialsExposed: false,
  destinationOrigin: 'https://reports.example.com',
} as const;

const draft = createPrivacySafeIssueDraft({
  context: 'public-web',
  siteOrigin: 'https://shop.example.com',
  category: 'unexpected-tool-change',
  severity: 'medium',
  stage: 'registration',
});

describe('scriptless external reporting workbench', () => {
  it('uses closed controls, a server-bound origin, and no transmission surface on step one', () => {
    const document = createExternalReportFormDocument({
      actionToken: 'action-token-abcdefghijklmnopqrstuvwxyz',
      siteOrigin: 'https://shop.example.com',
      relayStatus: invited,
    });
    expect(document.html).toContain('Nothing is sent on this step');
    expect(document.html).toContain('https://shop.example.com');
    expect(document.html).toContain('name="category"');
    expect(document.html).toContain('name="severity"');
    expect(document.html).toContain('name="stage"');
    expect(document.html).not.toContain('name="siteOrigin"');
    expect(document.html).not.toContain('<textarea');
    expect(document.html).not.toContain('<script');
    expect(document.html.match(/<form\b/gu)).toHaveLength(1);
    expect(document.contentSecurityPolicy).toContain("connect-src 'none'");
  });

  it('shows exactly four fields and withholds send authority while disabled', () => {
    const document = createExternalReportPreviewDocument({
      draft,
      relayStatus: disabled,
    });
    for (const field of EXTERNAL_REPORT_INCLUDED_FIELDS) {
      expect(document.html).toContain(
        field === 'siteOrigin'
          ? 'Site origin'
          : field[0].toUpperCase() + field.slice(1),
      );
    }
    for (const field of EXTERNAL_REPORT_EXCLUDED_FIELDS) {
      expect(document.html).toContain(field);
    }
    expect(document.html).toContain('Sending unavailable');
    expect(document.html).not.toContain('/issues/public/submit');
    expect(document.html).not.toContain('<form');
    expect(document.contentSecurityPolicy).toContain("form-action 'none'");
  });

  it('adds exactly one explicit no-retry send action only for an invited relay', () => {
    const document = createExternalReportPreviewDocument({
      draft,
      relayStatus: invited,
      submissionToken: 'submit-token-abcdefghijklmnopqrstuvwxyz',
    });
    expect(document.html).toContain('Send this four-field report once');
    expect(document.html).toContain('There is no automatic retry');
    expect(document.html.match(/<form\b/gu)).toHaveLength(1);
    expect(document.html.match(/<button\b/gu)).toHaveLength(1);
    expect(document.html).not.toContain('<script');
  });

  it('renders bounded receipt and failure outcomes without echoing report input', () => {
    const receiptDocument = createExternalReportReceiptDocument({
      destinationOrigin: invited.destinationOrigin,
      receipt: {
        schemaVersion: 'leftout.reporting-intake-response/1',
        disposition: 'created',
        reportId: '923e4567-e89b-42d3-a456-426614174000',
        state: 'quarantined',
        revision: 1,
        receivedAt: '2026-09-03T03:00:00.000Z',
        assuranceLimitation:
          'This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.',
      },
    });
    expect(receiptDocument.html).toContain('received once');
    expect(receiptDocument.html).toContain('quarantined');
    expect(receiptDocument.html).not.toContain('shop.example.com');
    const failure = createExternalReportFailureDocument(
      '<script>remote text is display data</script>',
    );
    expect(failure.html).toContain('&lt;script&gt;remote text is display data');
    expect(failure.html).not.toContain('<script>');
    expect(failure.html).toContain('no automatic retry');
  });
});
