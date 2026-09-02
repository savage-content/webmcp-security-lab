import { REPORT_LIMITATION, type ConnectorReceiptEntry } from './receipt-store';

export interface DashboardDocumentOptions {
  entries: readonly ConnectorReceiptEntry[];
  selectedEntryId?: string;
  loadError?: string;
}

type DashboardText = string | number | boolean | null | undefined;

function escapeHtml(value: DashboardText) {
  const text = value == null ? 'Not recorded' : String(value);
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function reportRow(label: string, value: DashboardText) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

/**
 * Pure, server-side renderer for already verified connector entries. Keeping
 * receipt data out of executable script preserves its status as untrusted
 * display data and makes the evidence view deterministic to test.
 */
export function renderDashboardReports(
  entries: readonly ConnectorReceiptEntry[],
  selectedEntryId?: string,
) {
  if (entries.length === 0) {
    return '<article><h2>No receipt has been recorded yet.</h2></article>';
  }

  return [...entries]
    .reverse()
    .map((entry) => {
      const selected = entry.entryId === selectedEntryId;
      const verdictClass = entry.receipt.verdict === 'PASS' ? 'pass' : 'fail';
      const capability = entry.receipt.capability;
      const receiptJson = JSON.stringify(entry.receipt, null, 2);
      return `<article${selected ? ' class="selected"' : ''}>
        <div class="report-head">
          <h2>${escapeHtml(entry.receiptId)}</h2>
          <span class="verdict ${verdictClass}">${escapeHtml(entry.receipt.verdict)}</span>
        </div>
        <dl>
          ${reportRow('Recorded', entry.recordedAt)}
          ${reportRow('Origin', entry.connection.origin)}
          ${reportRow('Observed browser', entry.receipt.client.label)}
          ${reportRow('Bridge client', entry.connection.clientLabel)}
          ${reportRow('Tool', entry.receipt.declaration.name)}
          ${reportRow('Contract SHA-256', capability?.contract.contractHash)}
          ${reportRow('Extension permit SHA-256', entry.adapter?.capabilityPermitSha256)}
          ${reportRow('Extension enforcement', entry.adapter?.enforcement ?? 'Not recorded')}
          ${reportRow('Permit consumed', entry.adapter?.consumedAt)}
          ${reportRow('Invalidation', capability?.invalidation.reason)}
          ${reportRow('Receipt SHA-256', entry.receiptHash)}
          ${reportRow('Ledger entry SHA-256', entry.entryHash)}
          ${reportRow('Previous entry', entry.previousEntryHash ?? 'Genesis entry')}
        </dl>
        <details>
          <summary>Show validated local evidence JSON</summary>
          <pre>${escapeHtml(receiptJson)}</pre>
        </details>
        <div class="report-actions">
          <a class="button" href="/issues/preview/${escapeHtml(entry.entryId)}">Review a privacy-safe practice report</a>
        </div>
      </article>`;
    })
    .join('');
}

export function createDashboardDocument({
  entries,
  selectedEntryId,
  loadError,
}: DashboardDocumentOptions) {
  const countText = loadError
    ? 'Reports unavailable'
    : `${entries.length} verified report${entries.length === 1 ? '' : 's'}`;
  const chainText = loadError ? 'Chain not verified' : 'Hash chain verified';
  const reportMarkup = loadError
    ? `<article><h2>${escapeHtml(loadError)}</h2></article>`
    : renderDashboardReports(entries, selectedEntryId);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Capability receipt reports · LeftOut Security</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #07100d; color: #f0f6f2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 85% 0%, #17382d 0, transparent 32rem), #07100d; }
    main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 64px; }
    header { display: grid; gap: 14px; margin-bottom: 30px; }
    .eyebrow { margin: 0; color: #a7f3d0; font: 700 12px/1.4 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 850px; font-size: clamp(34px, 6vw, 66px); line-height: .98; letter-spacing: -.045em; }
    .lede { margin: 0; max-width: 760px; color: #b7c5be; font-size: 17px; line-height: 1.65; }
    .status { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0; }
    .pill { border: 1px solid #315f4d; border-radius: 999px; padding: 8px 12px; background: #0c1b16; color: #c9fbe3; font: 700 12px ui-monospace, monospace; }
    .notice { border: 1px solid #5e4e20; border-radius: 12px; background: #211c0d; color: #f8e49c; padding: 14px 16px; line-height: 1.5; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 0; }
    .button { display: inline-block; border: 1px solid #315f4d; border-radius: 9px; padding: 11px 14px; color: #c9fbe3; font-weight: 750; text-decoration: none; }
    #reports { display: grid; gap: 16px; margin-top: 24px; }
    article { border: 1px solid #234b3d; border-radius: 18px; padding: 20px; background: rgba(8, 25, 19, .88); box-shadow: 0 24px 70px rgba(0,0,0,.22); }
    article.selected { outline: 2px solid #a3e635; outline-offset: 2px; }
    .report-head { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; }
    h2 { margin: 0; font-size: 19px; overflow-wrap: anywhere; }
    .verdict { border-radius: 999px; padding: 6px 10px; font: 800 12px ui-monospace, monospace; }
    .pass { color: #d9f99d; background: #294513; }
    .fail { color: #fecaca; background: #511d1d; }
    dl { display: grid; grid-template-columns: minmax(120px, .35fr) 1fr; gap: 9px 16px; margin: 18px 0 0; }
    dt { color: #78968a; font: 700 11px ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: 0; color: #d9e6df; font: 12px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
    details { margin-top: 16px; border-top: 1px solid #1e3b31; padding-top: 14px; }
    summary { cursor: pointer; color: #b7f7d5; font-weight: 700; }
    pre { overflow: auto; max-height: 420px; padding: 14px; border-radius: 10px; background: #030806; color: #b8c9c0; font: 11px/1.55 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .report-actions { margin-top: 16px; }
    footer { margin-top: 28px; color: #7e958a; font-size: 12px; line-height: 1.6; }
    @media (max-width: 600px) { main { width: min(100% - 22px, 1120px); padding-top: 28px; } dl { grid-template-columns: 1fr; gap: 5px; } dd { margin-bottom: 8px; } }
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Local connector evidence</p>
    <h1>Capability receipt reports</h1>
    <p class="lede">A read-only view of locally recorded guided-lesson capability receipts. Each entry is schema-checked and linked into an append-only SHA-256 chain.</p>
  </header>
  <div class="status" aria-live="polite">
    <span class="pill" id="count">${escapeHtml(countText)}</span>
    <span class="pill" id="chain">${escapeHtml(chainText)}</span>
    <span class="pill">Local-only MVP</span>
  </div>
  <p class="notice" id="notice">${escapeHtml(REPORT_LIMITATION)}</p>
  <nav class="actions" aria-label="Local reporting views">
    <a class="button" href="/issues/preview">Open the local reporting walkthrough</a>
    <a class="button" href="/issues/review">Open the local review list</a>
  </nav>
  <section id="reports" aria-label="Capability receipt reports">${reportMarkup}</section>
  <footer>Hash chaining detects edits, reordering, and gaps in the retained local file. It is not a signature, external timestamp, immutable anchor, or independent attestation.</footer>
</main>
</body>
</html>`;

  return {
    html,
    contentSecurityPolicy:
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'",
  };
}
