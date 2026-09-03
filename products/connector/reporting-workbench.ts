import {
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
  ISSUE_DRAFT_CATEGORIES,
  ISSUE_DRAFT_SEVERITIES,
  ISSUE_DRAFT_STAGES,
  type PrivacySafeIssueDraft,
} from './issue-draft';
import type {
  ReportingRelayReceipt,
  ReportingRelayStatus,
} from './reporting-relay';

const CATEGORY_LABELS = Object.freeze({
  'annotation-mismatch': 'The safety label did not match the behavior',
  'excess-authority': 'The action accepted more authority than it needed',
  'untrusted-output': 'The result contained instruction-shaped content',
  'misleading-approval': 'The approval did not name the real effect',
  'support-overclaim': 'The site claimed broader client support than observed',
  'unexpected-tool-change': 'The offered actions changed unexpectedly',
  'unexpected-side-effect': 'The action caused an unexpected effect',
});

const STAGE_LABELS = Object.freeze({
  'api-support': 'Browser API support',
  registration: 'Page registration',
  policy: 'Browser or client policy',
  discovery: 'Agent discovery',
  approval: 'Human approval',
  invocation: 'Action invocation',
  result: 'Returned result',
  retirement: 'Permission retirement',
});

const SEVERITY_LABELS = Object.freeze({
  informational: 'Informational — useful signal, no observed harm',
  low: 'Low — limited concern',
  medium: 'Medium — meaningful security concern',
  high: 'High — serious potential impact',
  critical: 'Critical — immediate, severe potential impact',
});

export const EXTERNAL_REPORT_INCLUDED_FIELDS = [
  'siteOrigin',
  'category',
  'severity',
  'stage',
] as const;

export const EXTERNAL_REPORT_EXCLUDED_FIELDS = [
  'full page address, path, query, or fragment',
  'page content or form entries',
  'screenshots or files',
  'tool arguments or tool results',
  'receipt IDs, hashes, or capability permits',
  'agent conversation',
  'contact information',
  'credentials or browser identifiers',
  'free-form description',
] as const;

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function styles() {
  return `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #07100d; color: #f0f6f2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 85% 0%, #17382d 0, transparent 32rem), #07100d; }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 44px 0 64px; }
    header { display: grid; gap: 13px; margin-bottom: 24px; }
    .eyebrow { margin: 0; color: #a7f3d0; font: 700 12px/1.4 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 780px; font-size: clamp(34px, 6vw, 58px); line-height: 1; letter-spacing: -.045em; }
    h2 { margin: 0 0 10px; font-size: 20px; }
    p { line-height: 1.6; }
    .lede { margin: 0; max-width: 720px; color: #b7c5be; font-size: 17px; }
    .status { display: inline-flex; width: fit-content; border: 1px solid #6b5b22; border-radius: 999px; padding: 8px 12px; background: #211c0d; color: #f8e49c; font: 800 12px ui-monospace, monospace; }
    .card { margin-top: 16px; border: 1px solid #234b3d; border-radius: 18px; padding: 20px; background: rgba(8, 25, 19, .9); }
    .origin { border-color: #4d6a20; background: #101b0c; }
    .origin strong { display: block; margin-top: 8px; color: #d9f99d; overflow-wrap: anywhere; }
    fieldset { display: grid; gap: 10px; margin: 0 0 20px; padding: 0; border: 0; }
    legend { margin-bottom: 9px; font-size: 18px; font-weight: 800; }
    label { display: grid; gap: 7px; color: #d9e6df; font-weight: 700; }
    select { width: 100%; min-height: 46px; border: 1px solid #315f4d; border-radius: 9px; padding: 10px 12px; background: #091712; color: #eff8f3; font: inherit; }
    select:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid #f8e49c; outline-offset: 3px; }
    button, .button { border: 1px solid #a3e635; border-radius: 9px; padding: 12px 16px; background: #a3e635; color: #102006; font: 800 14px/1.25 Inter, ui-sans-serif, system-ui, sans-serif; text-decoration: none; cursor: pointer; }
    .button.secondary { border-color: #315f4d; background: transparent; color: #c9fbe3; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 20px; }
    .helper { margin: 0; max-width: 650px; color: #9bb0a5; font-size: 13px; }
    .notice { margin-top: 16px; border: 1px solid #5e4e20; border-radius: 12px; background: #211c0d; color: #f8e49c; padding: 14px 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    dl { display: grid; grid-template-columns: 145px 1fr; gap: 9px 14px; margin: 0; }
    dt { color: #7e958a; font: 700 11px ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: 0; color: #d9e6df; overflow-wrap: anywhere; }
    ul { margin: 0; padding-left: 22px; }
    li { margin: 7px 0; color: #d9e6df; }
    .success { border-color: #638d28; background: #12200d; }
    .error { border-color: #8c3d3d; background: #271010; }
    footer { margin-top: 28px; color: #7e958a; font-size: 12px; line-height: 1.6; }
    @media (max-width: 680px) { main { width: min(100% - 22px, 920px); padding-top: 28px; } .grid { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; gap: 5px; } dd { margin-bottom: 8px; } button, .button { width: 100%; text-align: center; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
  `;
}

function options(
  values: readonly string[],
  labels: Readonly<Record<string, string>>,
) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(labels[value])}</option>`,
    )
    .join('');
}

function relayExplanation(status: ReportingRelayStatus) {
  return status.acceptsExternalReports
    ? `If you approve the final preview, the local connector can send exactly four fields once to ${escapeHtml(status.destinationOrigin)}. The invitation credential stays outside the browser.`
    : 'External reporting is not connected in this build. You can inspect the privacy boundary, but no send button will appear.';
}

function documentShell(title: string, body: string, formAction: boolean) {
  return {
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} · Left Out Security</title>
  <style>${styles()}</style>
</head>
<body>${body}</body>
</html>`,
    contentSecurityPolicy: `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action ${formAction ? "'self'" : "'none'"}; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; script-src 'none'`,
  };
}

export function createExternalReportFormDocument(input: {
  actionToken: string;
  siteOrigin: string;
  relayStatus: ReportingRelayStatus;
}) {
  return documentShell(
    'Describe a bounded WebMCP concern',
    `<main>
      <header>
        <p class="eyebrow">Local Guard · report review</p>
        <h1>Describe the concern without exposing the page.</h1>
        <p class="lede">Choose three labels. The site origin is fixed by your paired tab. Nothing is sent on this step.</p>
        <span class="status">Step 1 of 2 · local preview only</span>
      </header>
      <section class="card origin" aria-labelledby="site-heading">
        <p class="eyebrow" id="site-heading">Site origin that would be included</p>
        <strong>${escapeHtml(input.siteOrigin)}</strong>
        <p class="helper">The path, query, fragment, page text, and full receipt stay out.</p>
      </section>
      <form class="card" method="post" action="/issues/public/preview">
        <input type="hidden" name="action_token" value="${escapeHtml(input.actionToken)}">
        <fieldset>
          <legend>What looks wrong?</legend>
          <label for="category">Concern category
            <select id="category" name="category">${options(ISSUE_DRAFT_CATEGORIES, CATEGORY_LABELS)}</select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Where in the WebMCP flow?</legend>
          <label for="stage">Observed stage
            <select id="stage" name="stage">${options(ISSUE_DRAFT_STAGES, STAGE_LABELS)}</select>
          </label>
        </fieldset>
        <fieldset>
          <legend>How serious might it be?</legend>
          <label for="severity">Potential severity
            <select id="severity" name="severity">${options(ISSUE_DRAFT_SEVERITIES, SEVERITY_LABELS)}</select>
          </label>
        </fieldset>
        <p class="notice">${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</p>
        <div class="actions">
          <button type="submit">Preview exactly what would be sent</button>
          <a class="button secondary" href="/receipts">Cancel</a>
        </div>
        <p class="helper">${relayExplanation(input.relayStatus)}</p>
      </form>
      <footer>No free text, uploads, contact details, page content, or tool payloads are accepted.</footer>
    </main>`,
    true,
  );
}

export function createExternalReportPreviewDocument(input: {
  draft: Readonly<PrivacySafeIssueDraft>;
  relayStatus: ReportingRelayStatus;
  submissionToken?: string;
}) {
  const sendAction =
    input.relayStatus.acceptsExternalReports && input.submissionToken
      ? `<form method="post" action="/issues/public/submit">
          <input type="hidden" name="action_token" value="${escapeHtml(input.submissionToken)}">
          <button type="submit">Send this four-field report once</button>
        </form>`
      : '<p class="status">Sending unavailable · no external destination configured</p>';
  return documentShell(
    'Review the exact report',
    `<main>
      <header>
        <p class="eyebrow">Local Guard · final review</p>
        <h1>Review the exact four fields.</h1>
        <p class="lede">Nothing has been sent. Sending, when available, creates a quarantined private report for human review. It does not publish a finding or notify the site.</p>
        <span class="status">Step 2 of 2 · explicit decision</span>
      </header>
      <div class="grid">
        <section class="card" aria-labelledby="included-heading">
          <h2 id="included-heading">Would be sent</h2>
          <dl>
            <dt>Site origin</dt><dd>${escapeHtml(input.draft.siteOrigin)}</dd>
            <dt>Category</dt><dd>${escapeHtml(CATEGORY_LABELS[input.draft.category])}</dd>
            <dt>Severity</dt><dd>${escapeHtml(SEVERITY_LABELS[input.draft.severity])}</dd>
            <dt>Stage</dt><dd>${escapeHtml(STAGE_LABELS[input.draft.stage])}</dd>
          </dl>
        </section>
        <section class="card" aria-labelledby="excluded-heading">
          <h2 id="excluded-heading">Will not be sent</h2>
          <ul>${EXTERNAL_REPORT_EXCLUDED_FIELDS.map((field) => `<li>${escapeHtml(field)}</li>`).join('')}</ul>
        </section>
      </div>
      <p class="notice">${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</p>
      <div class="actions">
        ${sendAction}
        <a class="button secondary" href="/issues/public/new">Go back without sending</a>
      </div>
      <p class="helper">There is no automatic retry. A network failure consumes this one-use action so a duplicate cannot be sent silently.</p>
      <footer>${relayExplanation(input.relayStatus)}</footer>
    </main>`,
    Boolean(input.relayStatus.acceptsExternalReports && input.submissionToken),
  );
}

export function createExternalReportReceiptDocument(input: {
  receipt: Readonly<ReportingRelayReceipt>;
  destinationOrigin: string;
}) {
  return documentShell(
    'Report received for human review',
    `<main>
      <header>
        <p class="eyebrow">Local Guard · reporting receipt</p>
        <h1>The report was received once.</h1>
        <p class="lede">It is quarantined for human review. It is not a published finding, site notification, endorsement, certification, or security guarantee.</p>
        <span class="status">Received · private review queue</span>
      </header>
      <section class="card success" aria-labelledby="receipt-heading">
        <h2 id="receipt-heading">Submission receipt</h2>
        <dl>
          <dt>Report ID</dt><dd>${escapeHtml(input.receipt.reportId)}</dd>
          <dt>Received</dt><dd>${escapeHtml(input.receipt.receivedAt)}</dd>
          <dt>State</dt><dd>${escapeHtml(input.receipt.state)}</dd>
          <dt>Disposition</dt><dd>${escapeHtml(input.receipt.disposition)}</dd>
          <dt>Destination</dt><dd>${escapeHtml(input.destinationOrigin)}</dd>
        </dl>
      </section>
      <p class="notice">${escapeHtml(input.receipt.assuranceLimitation)}</p>
      <div class="actions"><a class="button secondary" href="/receipts">Return to local receipts</a></div>
      <footer>The remote receipt intentionally does not echo the reported site origin.</footer>
    </main>`,
    false,
  );
}

export function createExternalReportFailureDocument(message: string) {
  return documentShell(
    'Report was not accepted',
    `<main>
      <header>
        <p class="eyebrow">Local Guard · reporting stopped</p>
        <h1>The report was not accepted.</h1>
        <p class="lede">Nothing will retry automatically. Review the connector configuration before starting a fresh report.</p>
        <span class="status">Stopped · no automatic retry</span>
      </header>
      <section class="card error" aria-labelledby="error-heading">
        <h2 id="error-heading">What the connector observed</h2>
        <p>${escapeHtml(message)}</p>
      </section>
      <p class="notice">${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</p>
      <div class="actions"><a class="button secondary" href="/receipts">Return to local receipts</a></div>
    </main>`,
    false,
  );
}
