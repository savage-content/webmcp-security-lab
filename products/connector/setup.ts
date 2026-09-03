import type { PairedPageSummary } from './bridge-coordinator';

const REPORT_LIMITATION =
  'This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface SetupDocumentInput {
  siteUrl: string;
  extensionPath: string;
  bridgeUrl: string;
  transport?: 'developer-loopback' | 'native-ipc';
  pages: PairedPageSummary[];
}

export function createSetupDocument(input: SetupDocumentInput) {
  const siteUrl = new URL(input.siteUrl);
  if (
    !['http:', 'https:'].includes(siteUrl.protocol) ||
    siteUrl.username ||
    siteUrl.password
  ) {
    throw new Error('The setup learning-range URL must be HTTP(S).');
  }
  const normalizedSiteUrl = siteUrl.toString();
  const nativeTransport = input.transport === 'native-ipc';
  const connected = input.pages.filter((page) => page.connected).length;
  const pageRows = input.pages.length
    ? input.pages
        .map(
          (page) =>
            `<tr><td>${escapeHtml(page.origin)}</td><td>${escapeHtml(
              new URL(page.pageUrl).pathname,
            )}</td><td>${page.connected ? 'Connected' : 'Idle'}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3">No browser tab is paired.</td></tr>';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebMCP desktop alpha setup</title><style>
:root{font-family:Inter,system-ui,sans-serif;color:#121817;background:#f5f1e8}*{box-sizing:border-box}body{margin:0}main{max-width:920px;margin:auto;padding:48px 24px}.eyebrow{font:700 11px ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase;color:#176b4b}h1{font-size:42px;letter-spacing:-.04em;margin:.35rem 0 1rem}.lede{max-width:660px;line-height:1.6;color:#45504c}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:28px 0}.card{border:1px solid #bac1bb;border-radius:12px;padding:18px;background:#fffaf1}.card h2{font-size:14px;margin:0 0 10px}.mono{font:12px ui-monospace,monospace;overflow-wrap:anywhere}.button{display:inline-block;border-radius:8px;padding:11px 15px;background:#121817;color:white;text-decoration:none;font-weight:700}.secondary{background:#e9eee9;color:#121817;border:1px solid #bac1bb}table{width:100%;border-collapse:collapse;background:#fffaf1;border:1px solid #bac1bb}th,td{text-align:left;padding:11px;border-bottom:1px solid #d9ddd9;font-size:13px}th{font:700 10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.notice{margin-top:26px;padding:14px;border-left:4px solid #176b4b;background:#e9f2ec;font-size:13px;line-height:1.5}
</style></head><body><main><p class="eyebrow">Left Out Security · local only</p><h1>Desktop alpha setup</h1>
<p class="lede">One local run starts the learning range and connector, then prepares the browser guard and validated receipt viewer. Begin on the learning page. Connecting the extension does not approve or run a site action.</p>
<div class="grid"><section class="card"><h2>1 · Start the lesson</h2><p>Learn what WebMCP offers, what approval means, and how to verify the effect using fake data.</p><a class="button" href="${escapeHtml(normalizedSiteUrl)}">Open the five-minute lesson</a></section>
<section class="card"><h2>2 · Install the browser guard once</h2><p>In the disposable Chrome profile, use <strong>Extensions → Developer mode → Load unpacked</strong> and choose:</p><p class="mono">${escapeHtml(input.extensionPath)}</p></section>
<section class="card"><h2>3 · Connect this practice tab</h2><p>${
    nativeTransport
      ? 'Open the signed Local Guard extension while the learning page is active, then choose <strong>Connect this practice tab</strong>. Chrome starts the identity-bound native host; no browser-accessible HTTP bridge or code is used.'
      : 'Open the extension while the learning page is active, then choose <strong>Connect this practice tab</strong>. A short-lived, one-use challenge binds the exact extension and page automatically—there is no code to copy.'
  }</p><p class="mono">Local helper: ${escapeHtml(input.bridgeUrl)}</p><p>${connected} connected of ${input.pages.length} paired tab${input.pages.length === 1 ? '' : 's'}.</p></section>
<section class="card"><h2>4 · Connect a local agent</h2><p>Add the authenticated MCP connector URL printed by the desktop alpha launcher to your local MCP-capable agent. This is separate from pairing the browser extension.</p><p>This alpha does not include the hosted HTTPS and OAuth connection required by cloud-only clients such as ChatGPT Work.</p></section>
<section class="card"><h2>5 · Evidence</h2><p>Connector-validated JSONL receipts remain separate from learning-range evidence.</p><a class="button secondary" href="/receipts">Open verified receipts</a></section></div>
<h2>Paired browser pages</h2><table><thead><tr><th>Origin</th><th>Path</th><th>Status</th></tr></thead><tbody>${pageRows}</tbody></table>
<p class="notice">${REPORT_LIMITATION}</p></main></body></html>`;

  return {
    html,
    contentSecurityPolicy:
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'",
  };
}
