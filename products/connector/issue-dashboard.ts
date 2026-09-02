import {
  createSyntheticLessonIssueCandidate,
  type LocalIssueCandidate,
} from './issue-candidate';
import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from './issue-draft';
import type { LocalIssueReviewItem } from './issue-review';

export const ISSUE_PREVIEW_INCLUDED_FIELDS = [
  'schemaVersion',
  'context',
  'category',
  'severity',
  'stage',
  'submission.submittable',
  'submission.disposition',
  'assuranceLimitation',
] as const;

export const ISSUE_PREVIEW_CONDITIONAL_FIELDS = [
  'siteOrigin (public-web drafts only)',
] as const;

export const ISSUE_PREVIEW_EXCLUDED_FIELDS = [
  'pageUrl',
  'path',
  'query',
  'fragment',
  'ipAddress',
  'localHostname',
  'description',
  'pageContent',
  'screenshots',
  'toolArguments',
  'toolResult',
  'clientLabel',
  'receiptId',
  'receiptHashes',
  'capabilityPermit',
  'credentials',
  'contactInformation',
  'agentConversation',
] as const;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fieldList(fields: readonly string[]) {
  return fields
    .map((field) => `<li><code>${escapeHtml(field)}</code></li>`)
    .join('');
}

function sharedStyles() {
  return `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #07100d; color: #f0f6f2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 85% 0%, #17382d 0, transparent 32rem), #07100d; }
    main { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 64px; }
    header { display: grid; gap: 14px; margin-bottom: 26px; }
    .eyebrow { margin: 0; color: #a7f3d0; font: 700 12px/1.4 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 820px; font-size: clamp(34px, 6vw, 62px); line-height: 1; letter-spacing: -.045em; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    p { line-height: 1.6; }
    .lede { margin: 0; max-width: 760px; color: #b7c5be; font-size: 17px; }
    .status { display: inline-flex; width: fit-content; border: 1px solid #6b5b22; border-radius: 999px; padding: 8px 12px; background: #211c0d; color: #f8e49c; font: 800 12px ui-monospace, monospace; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .card { border: 1px solid #234b3d; border-radius: 18px; padding: 20px; background: rgba(8, 25, 19, .88); }
    .source { margin-bottom: 16px; border-color: #4d6a20; background: #101b0c; }
    .source p { margin: 8px 0 0; color: #c7d8cf; }
    ul { margin: 0; padding-left: 22px; columns: 2; }
    li { margin: 6px 0; break-inside: avoid; color: #d9e6df; }
    code, pre { font-family: ui-monospace, monospace; }
    code { color: #b7f7d5; font-size: 12px; }
    pre { overflow: auto; max-height: 430px; margin: 0; padding: 16px; border-radius: 12px; background: #030806; color: #b8c9c0; font-size: 11px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
    .notice { margin-top: 16px; border: 1px solid #5e4e20; border-radius: 12px; background: #211c0d; color: #f8e49c; padding: 14px 16px; }
    .steps { display: grid; gap: 10px; margin-top: 16px; }
    .step { margin: 0; border-left: 3px solid #315f4d; padding: 10px 14px; background: #0c1b16; color: #c7d8cf; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 20px; }
    button, .button { border: 1px solid #a3e635; border-radius: 9px; padding: 12px 16px; background: #a3e635; color: #102006; font: 800 14px/1.2 Inter, ui-sans-serif, system-ui, sans-serif; text-decoration: none; cursor: pointer; }
    .button.secondary { border-color: #315f4d; background: transparent; color: #c9fbe3; }
    .helper { margin: 0; max-width: 560px; color: #9bb0a5; font-size: 12px; }
    .queue { display: grid; gap: 14px; }
    .queue-item dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 14px; margin: 16px 0 0; }
    .queue-item dt { color: #7e958a; font: 700 11px ui-monospace, monospace; text-transform: uppercase; }
    .queue-item dd { margin: 0; color: #d9e6df; font: 13px ui-monospace, monospace; overflow-wrap: anywhere; }
    footer { margin-top: 28px; color: #7e958a; font-size: 12px; line-height: 1.6; }
    @media (max-width: 700px) { main { width: min(100% - 22px, 960px); padding-top: 28px; } .grid { grid-template-columns: 1fr; } ul { columns: 1; } .queue-item dl { grid-template-columns: 1fr; gap: 5px; } .queue-item dd { margin-bottom: 8px; } }
  `;
}

export interface IssueDashboardDocumentOptions {
  actionToken?: string;
  candidate?: Readonly<LocalIssueCandidate>;
}

/**
 * Scriptless preview of one bounded candidate. The only mutation available is
 * an explicit, one-use, connector-local save action.
 */
export function createIssueDashboardDocument(
  options: IssueDashboardDocumentOptions = {},
) {
  const candidate = options.candidate ?? createSyntheticLessonIssueCandidate();
  const draftJson = JSON.stringify(candidate.draft, null, 2);
  const saveMarkup = options.actionToken
    ? `<form method="post" action="/issues/save">
        <input type="hidden" name="action_token" value="${escapeHtml(options.actionToken)}">
        <button type="submit">Add practice report to local review list</button>
      </form>`
    : '<p class="helper">Local save is unavailable in this static preview.</p>';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Review a WebMCP safety concern · LeftOut Security</title>
  <style>${sharedStyles()}</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Local reporting workbench</p>
    <h1>Review a WebMCP safety concern.</h1>
    <p class="lede">Nothing has been sent. The full receipt stays on this device. Review the exact bounded draft before explicitly saving it to a local practice list.</p>
    <span class="status">Practice only · stays on this device</span>
  </header>
  <section class="card source" aria-labelledby="source-heading">
    <p class="eyebrow">${escapeHtml(candidate.sourceLabel)}</p>
    <h2 id="source-heading">${escapeHtml(candidate.title)}</h2>
    <p>${escapeHtml(candidate.explanation)}</p>
  </section>
  <div class="grid">
    <section class="card" aria-labelledby="included-heading">
      <h2 id="included-heading">Exactly included in this draft</h2>
      <ul>${fieldList(ISSUE_PREVIEW_INCLUDED_FIELDS)}</ul>
      <p class="helper">Conditional schema field: <code>${escapeHtml(ISSUE_PREVIEW_CONDITIONAL_FIELDS[0])}</code>. It is absent here because this is a synthetic lesson.</p>
    </section>
    <section class="card" aria-labelledby="excluded-heading">
      <h2 id="excluded-heading">Stays out of the draft</h2>
      <ul>${fieldList(ISSUE_PREVIEW_EXCLUDED_FIELDS)}</ul>
    </section>
  </div>
  <section class="card" aria-labelledby="preview-heading" style="margin-top:16px">
    <h2 id="preview-heading">Exact local draft</h2>
    <pre>${escapeHtml(draftJson)}</pre>
  </section>
  <p class="notice">${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</p>
  <section class="steps" aria-label="Reporting boundary">
    <p class="step"><strong>1 · Local save:</strong> only the displayed draft fields enter the temporary review list.</p>
    <p class="step"><strong>2 · Human review:</strong> no reviewer is connected in this build.</p>
    <p class="step"><strong>3 · Security feed:</strong> synthetic and local exercises are ineligible. Feed eligibility remains zero.</p>
  </section>
  <div class="actions">
    ${saveMarkup}
    <a class="button secondary" href="/issues/review">Open local review list</a>
    <p class="helper">Saving stays inside this loopback connector. It does not contact LeftOut Security, the site, or any feed.</p>
  </div>
  <footer>This workbench has no external submission or publication endpoint. The issue draft and detailed receipt remain separate.</footer>
</main>
</body>
</html>`;

  return {
    candidate,
    draft: candidate.draft,
    html,
    contentSecurityPolicy:
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; script-src 'none'",
  };
}

function renderQueueItems(items: readonly LocalIssueReviewItem[]) {
  if (items.length === 0) {
    return `<section class="card">
      <h2>No locally saved practice reports</h2>
      <p class="helper">Review a draft first, then explicitly add it to this temporary list.</p>
    </section>`;
  }
  return items
    .map(
      (item) => `<article class="card queue-item">
        <div class="status">Saved locally · not submitted</div>
        <dl>
          <dt>Context</dt><dd>${escapeHtml(item.draft.context)}</dd>
          <dt>Category</dt><dd>${escapeHtml(item.draft.category)}</dd>
          <dt>Severity</dt><dd>${escapeHtml(item.draft.severity)}</dd>
          <dt>Stage</dt><dd>${escapeHtml(item.draft.stage)}</dd>
          <dt>Disposition</dt><dd>${escapeHtml(item.draft.submission.disposition)}</dd>
          <dt>Review state</dt><dd>${escapeHtml(item.reviewState)}</dd>
        </dl>
      </article>`,
    )
    .join('');
}

export function createIssueReviewListDocument(
  items: readonly LocalIssueReviewItem[],
) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Local WebMCP review list · LeftOut Security</title>
  <style>${sharedStyles()}</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Local reporting workbench</p>
    <h1>Local review list</h1>
    <p class="lede">This is a temporary list inside your loopback connector, not LeftOut Security's inbox. Nothing has been sent to a person, site, or security feed.</p>
    <span class="status">${items.length} locally saved · 0 feed eligible</span>
  </header>
  <section class="grid" aria-label="Review and feed status">
    <div class="card"><h2>Human review</h2><p>No reviewer is connected. Every item remains <strong>local-only</strong>.</p></div>
    <div class="card"><h2>Security-tooling feed</h2><p><strong>0 eligible records.</strong> Synthetic and local exercises can never be published.</p></div>
  </section>
  <div class="queue" style="margin-top:16px">${renderQueueItems(items)}</div>
  <p class="notice">${escapeHtml(ISSUE_DRAFT_ASSURANCE_LIMITATION)}</p>
  <div class="actions"><a class="button secondary" href="/issues/preview">Review another practice draft</a><a class="button secondary" href="/receipts">Back to verified receipts</a></div>
  <footer>The list is held only in connector memory and clears when the connector stops or its bound pairing is revoked.</footer>
</main>
</body>
</html>`;
  return {
    html,
    contentSecurityPolicy:
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; script-src 'none'",
  };
}
