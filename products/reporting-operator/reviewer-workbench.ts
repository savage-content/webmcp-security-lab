import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../connector/issue-draft';
import type { IssueModerationState } from '../connector/issue-publication';
import type {
  ReportingReviewDetail,
  ReportingReviewListItem,
  ReportingReviewTransitionReceipt,
} from './reviewer-client';

const STATE_LABELS: Readonly<Record<IssueModerationState, string>> =
  Object.freeze({
    received: 'Received',
    quarantined: 'Quarantined',
    under_review: 'Under review',
    needs_evidence: 'Needs evidence',
    accepted_private: 'Accepted privately',
    duplicate: 'Duplicate',
    rejected: 'Rejected',
    published: 'Published',
  });

const ACTION_LABELS: Readonly<Partial<Record<IssueModerationState, string>>> =
  Object.freeze({
    under_review: 'Begin human review',
    needs_evidence: 'Mark as needing evidence',
    accepted_private: 'Accept privately for publisher review',
    duplicate: 'Close as duplicate',
    rejected: 'Reject report',
  });

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
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 64px; }
    header { display: grid; gap: 12px; margin-bottom: 24px; }
    .eyebrow { margin: 0; color: #a7f3d0; font: 700 12px/1.4 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 820px; font-size: clamp(32px, 6vw, 56px); line-height: 1; letter-spacing: -.045em; }
    h2 { margin: 0 0 10px; font-size: 20px; }
    h3 { margin: 0; font-size: 17px; }
    p { line-height: 1.6; }
    .lede { margin: 0; max-width: 760px; color: #b7c5be; font-size: 17px; }
    .status { display: inline-flex; width: fit-content; border: 1px solid #6b5b22; border-radius: 999px; padding: 7px 11px; background: #211c0d; color: #f8e49c; font: 800 11px/1.2 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .05em; }
    .card { margin-top: 16px; border: 1px solid #234b3d; border-radius: 18px; padding: 20px; background: rgba(8, 25, 19, .92); }
    .report { display: grid; gap: 16px; grid-template-columns: 1fr auto; align-items: center; }
    .report .meta { display: flex; flex-wrap: wrap; gap: 8px 18px; color: #a7b9b0; font-size: 13px; }
    .private { border-color: #6b5b22; background: #211c0d; color: #f8e49c; }
    .success { border-color: #638d28; background: #12200d; }
    .error { border-color: #8c3d3d; background: #271010; }
    .origin { margin: 7px 0 0; color: #d9f99d; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    dl { display: grid; grid-template-columns: 150px 1fr; gap: 9px 14px; margin: 0; }
    dt { color: #7e958a; font: 700 11px ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: 0; color: #d9e6df; overflow-wrap: anywhere; }
    ol { margin: 0; padding-left: 22px; }
    li { margin: 9px 0; color: #d9e6df; line-height: 1.45; }
    button, .button { display: inline-block; border: 1px solid #a3e635; border-radius: 9px; padding: 12px 16px; background: #a3e635; color: #102006; font: 800 14px/1.25 Inter, ui-sans-serif, system-ui, sans-serif; text-decoration: none; cursor: pointer; }
    .button.secondary { border-color: #315f4d; background: transparent; color: #c9fbe3; }
    .button.danger, button.danger { border-color: #fca5a5; background: #3a1414; color: #fecaca; }
    button:focus-visible, a:focus-visible { outline: 3px solid #f8e49c; outline-offset: 3px; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 20px; }
    .actions form { margin: 0; }
    .helper { margin: 7px 0 0; color: #9bb0a5; font-size: 13px; }
    footer { margin-top: 28px; color: #9bb0a5; font-size: 12px; line-height: 1.6; }
    @media (max-width: 680px) { main { width: min(100% - 22px, 1040px); padding-top: 28px; } .grid { grid-template-columns: 1fr; } .report { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; gap: 5px; } dd { margin-bottom: 8px; } button, .button { width: 100%; text-align: center; } .actions, .actions form { width: 100%; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
  `;
}

function documentShell(title: string, body: string, allowsForms: boolean) {
  return Object.freeze({
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
    contentSecurityPolicy: `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action ${allowsForms ? "'self'" : "'none'"}; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; script-src 'none'`,
  });
}

export interface ReviewerListRow {
  item: Readonly<ReportingReviewListItem>;
  viewToken: string;
}

export function createReviewerListDocument(input: {
  reports: readonly Readonly<ReviewerListRow>[];
  nextPageToken?: string;
  serviceOrigin: string;
}) {
  const reports = input.reports.length
    ? input.reports
        .map(
          ({ item, viewToken }) => `<article class="card report">
            <div>
              <p class="eyebrow">${escapeHtml(STATE_LABELS[item.state])} · revision ${escapeHtml(item.revision)}</p>
              <h2>${escapeHtml(item.draft.category)}</h2>
              <p class="origin">${escapeHtml(item.draft.siteOrigin)}</p>
              <div class="meta"><span>Severity: ${escapeHtml(item.draft.severity)}</span><span>Stage: ${escapeHtml(item.draft.stage)}</span><span>Updated: ${escapeHtml(item.updatedAt)}</span></div>
            </div>
            <a class="button secondary" href="/reviews/view?token=${encodeURIComponent(viewToken)}">Review this report</a>
          </article>`,
        )
        .join('')
    : `<section class="card"><h2>No reports in this page</h2><p>The private review queue returned no records.</p></section>`;
  const next = input.nextPageToken
    ? `<a class="button secondary" href="/reviews/page?token=${encodeURIComponent(input.nextPageToken)}">Open next queue page</a>`
    : '<span class="status">End of current queue</span>';
  return documentShell(
    'Private report review queue',
    `<main>
      <header>
        <p class="eyebrow">Left Out Security · local reviewer workbench</p>
        <h1>Review quarantined WebMCP reports.</h1>
        <p class="lede">This loopback-only page retrieves private queue data through a separately configured reviewer credential. It cannot publish.</p>
        <span class="status">Reviewer role · no publication authority</span>
      </header>
      <section class="card private" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Private operator data</h2>
        <p>Reported site origins and private report details appear only in this local workbench. Do not paste, screenshot, or transmit them outside the approved review process.</p>
        <p class="helper">Connected reporting service: ${escapeHtml(input.serviceOrigin)}</p>
      </section>
      ${reports}
      <nav class="actions" aria-label="Queue pagination">${next}</nav>
      <footer>${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</footer>
    </main>`,
    false,
  );
}

export function createReviewerDetailDocument(input: {
  detail: Readonly<ReportingReviewDetail>;
  actions: readonly Readonly<{ to: IssueModerationState; token: string }>[];
}) {
  const moderation = input.detail.record.moderation;
  const actionForms = input.actions.length
    ? input.actions
        .map(({ to, token }) => {
          const label = ACTION_LABELS[to] ?? `Move to ${STATE_LABELS[to]}`;
          const danger = ['duplicate', 'rejected'].includes(to)
            ? ' danger'
            : '';
          return `<form method="post" action="/reviews/transition">
            <input type="hidden" name="action_token" value="${escapeHtml(token)}">
            <button class="${danger.trim()}" type="submit">${escapeHtml(label)}</button>
          </form>`;
        })
        .join('')
    : '<p class="status">No reviewer transition is available</p>';
  const timeline = input.detail.events
    .map(
      (event) =>
        `<li><strong>${escapeHtml(STATE_LABELS[event.to])}</strong> at ${escapeHtml(event.at)} · ${escapeHtml(event.actor.role)} authority</li>`,
    )
    .join('');
  return documentShell(
    'Review one private report',
    `<main>
      <header>
        <p class="eyebrow">Left Out Security · exact report review</p>
        <h1>Decide the next private state.</h1>
        <p class="lede">Every button below changes this report exactly once at revision ${escapeHtml(input.detail.record.revision)}. A stale or repeated action is rejected. No reviewer action can publish.</p>
        <span class="status">${escapeHtml(STATE_LABELS[moderation.state])}</span>
      </header>
      <div class="grid">
        <section class="card" aria-labelledby="report-heading">
          <h2 id="report-heading">Submitted four-field report</h2>
          <dl>
            <dt>Site origin</dt><dd>${escapeHtml(moderation.draft.siteOrigin)}</dd>
            <dt>Category</dt><dd>${escapeHtml(moderation.draft.category)}</dd>
            <dt>Severity</dt><dd>${escapeHtml(moderation.draft.severity)}</dd>
            <dt>Stage</dt><dd>${escapeHtml(moderation.draft.stage)}</dd>
          </dl>
        </section>
        <section class="card" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">Verified private history</h2>
          <ol>${timeline}</ol>
        </section>
      </div>
      <section class="card private" aria-labelledby="decision-heading">
        <h2 id="decision-heading">Choose one explicit state change</h2>
        <p>These actions consume a short-lived local token before contacting the reporting service. A network failure will not retry automatically.</p>
        <div class="actions">${actionForms}</div>
      </section>
      <div class="actions"><a class="button secondary" href="/reviews">Return to queue without changing anything</a></div>
      <footer>${escapeHtml(input.detail.assuranceLimitation)}</footer>
    </main>`,
    input.actions.length > 0,
  );
}

export function createReviewerTransitionReceiptDocument(
  receipt: Readonly<ReportingReviewTransitionReceipt>,
) {
  return documentShell(
    'Private report state changed',
    `<main>
      <header aria-live="polite">
        <p class="eyebrow">Left Out Security · reviewer receipt</p>
        <h1>The private state changed once.</h1>
        <p class="lede">The reporting service committed the reviewer decision. Nothing was published and nothing will retry automatically.</p>
        <span class="status">${escapeHtml(STATE_LABELS[receipt.state])}</span>
      </header>
      <section class="card success" aria-labelledby="receipt-heading">
        <h2 id="receipt-heading">Transition receipt</h2>
        <dl>
          <dt>State</dt><dd>${escapeHtml(STATE_LABELS[receipt.state])}</dd>
          <dt>Revision</dt><dd>${escapeHtml(receipt.revision)}</dd>
          <dt>Updated</dt><dd>${escapeHtml(receipt.updatedAt)}</dd>
          <dt>Disposition</dt><dd>${escapeHtml(receipt.disposition)}</dd>
        </dl>
      </section>
      <div class="actions"><a class="button secondary" href="/reviews">Return to private queue</a></div>
      <footer>${escapeHtml(receipt.assuranceLimitation)}</footer>
    </main>`,
    false,
  );
}

export function createReviewerFailureDocument(message: string) {
  return documentShell(
    'Reviewer action stopped',
    `<main>
      <header>
        <p class="eyebrow">Left Out Security · reviewer action stopped</p>
        <h1>No automatic retry occurred.</h1>
        <p class="lede">Reload the current queue before making a new decision. The previous one-use local action cannot be replayed.</p>
        <span class="status">Stopped safely</span>
      </header>
      <section class="card error" aria-labelledby="error-heading">
        <h2 id="error-heading">Observed result</h2>
        <p>${escapeHtml(message)}</p>
      </section>
      <div class="actions"><a class="button secondary" href="/reviews">Reload private queue</a></div>
      <footer>${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</footer>
    </main>`,
    false,
  );
}
