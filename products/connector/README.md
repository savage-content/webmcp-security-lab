# LeftOut WebMCP capability connector

This is a local MVP that joins three otherwise separate surfaces:

1. a user-selected browser tab running the Scenario 1 WebMCP negotiator;
2. a tool-only MCP server for ChatGPT/Codex or MCP Inspector; and
3. a local receipt-reporting dashboard backed by an append-only JSONL hash
   chain.

It is intentionally a **tool-only** MCP app. The reporting UI is an ordinary
read-only local web page, not an in-chat widget. The connector does not create
approval, generate a capability, or invoke the broad source/proposal tools.

## Live validation status

**2026-09-01: PASS for one dated local Scenario 1 session.** Extension `0.1.3`
paired a fresh `http://localhost:3001/` document to exact loopback bridge
`http://127.0.0.1:48788`. The connector verified an empty hash chain, discovered
generated zero-input capability
`get_training_1042_eligibility_once_f7d2fa4e8e8d1e03`, and requested exactly one
authorized invocation with no retry. Receipt
`d421aaaf-262d-4fbe-81ab-e93acb5efce9` returned through the bridge and was
validated and committed as entry `abc6b79c-c4fc-44b4-b2ce-5da7e525b5fa`.

The invocation response, JSONL ledger, `list_capability_receipts`,
`get_capability_receipt_summary`, and the HTTP 200 dashboard report agreed on
the receipt, contract, receipt, and entry hashes. The dashboard enforced
`script-src 'none'`. Recorded before and after state were byte identical with
state hash
`21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`;
the required result and baseline matched, controlled-handler violations and
side effects were empty, call number was one, authority was consumed, and fresh
post-run discovery returned zero tools.

Two earlier no-retry attempts remain valid failure evidence: both produced
page-side `PASS` receipts but did not complete the connector return path. Their
one-use grants remain consumed and must not be retried. The successful run does
not prove cross-version, crash-atomic, hosted, or universal-client behavior.
This connector remains a local MVP and has not been publicly deployed.

The successful session used post-`f7290d9` page and extension content. The
running connector came from `f7290d9`; connector source is unchanged by the
later UI and extension validation fixes. The successful browser version was
not recaptured, and the future final commit itself was not live-run.

## Security shape

- The browser bridge defaults to `127.0.0.1:8788`; `48788` is the extension's
  one approved conflict fallback. An explicit
  `BRIDGE_HOST=::1` selects IPv6 loopback; non-loopback bridge binds are
  rejected.
- The MCP/report server binds to `127.0.0.1:8787` by default and requires a
  randomly generated access token.
- The extension has exact loopback host permissions and pairs a user-selected
  tab with a one-time eight-digit code.
- MCP inspection performs discovery only.
- Invocation accepts only
  `get_training_1042_eligibility_once_<16 lowercase hex characters>` and
  supplies an empty object. The page must already have registered that tool
  after its own exact human approval.
- A returned receipt is fully schema-, contract-, chronology-, state-, and
  hash-validated before it is appended to the connector ledger.
- The connector returns safe receipt summaries to the model. The dashboard can
  display the full validated synthetic JSON locally.

## Delivery durability boundary

Bridge result delivery is retry-safe, not end-to-end crash-atomic. The bridge
keeps a command in flight until it accepts an exact session- and origin-bound
completion, and it accepts an identical retry if the HTTP acknowledgement is
lost. The extension retains that completion until it receives the explicit
acknowledgement.

For an invocation result, the connector does not acknowledge the bridge
request until it has validated and appended the receipt. The MCP response then
reads that already-recorded entry. This closes the former
acknowledgement-before-ledger gap while preserving exact-result retry behavior
within the running local connector. A commitment timeout returns no success
acknowledgement but keeps the canonical result latched, observes a late commit,
and blocks command redelivery; the extension can retry the same saved result
without invoking the page again. Exact duplicate receipt commits for the same
session and page are idempotent. Terminal receipt-validation failures release
the session without accepting a substituted result. The MVP still does not
claim a transactional outbox, durable command queue, cross-process retry, or
crash-atomic ledger persistence.

Model-visible connector summaries omit raw page URLs and all page- or
receipt-supplied client labels. Any retained normalized origin is explicitly
marked as untrusted provenance data, not instructions.

## Run locally

Use Node.js 24 from the repository root:

```bash
npm ci
npm run connector
```

The process prints four values:

- the authenticated MCP URL;
- the authenticated receipt-dashboard URL;
- the loopback browser-bridge URL; and
- the current one-time browser pairing code.

Load the unpacked extension from `products/extension`, open the local lab at
`http://localhost:3000`, and pair that tab with the printed code. Each
successful pairing rotates the code.

For MCP Inspector, select Streamable HTTP and use the complete printed MCP URL,
including its `access_token` query parameter. The tool sequence is:

1. `list_paired_pages`
2. `inspect_paired_webmcp_page`
3. complete the exact approval in the browser page
4. inspect again and copy the generated tool name
5. `invoke_approved_one_use_capability`
6. `get_capability_receipt_summary` or open the dashboard

The repository also includes a small SDK client for reproducible live calls.
In PowerShell, set the complete connector URL printed by `npm run connector`,
then list or invoke tools:

```powershell
$env:MCP_URL = 'http://127.0.0.1:8787/mcp?access_token=REPLACE_WITH_CURRENT_TOKEN'
npm run mcp:list-tools
npm run mcp:call -- list_paired_pages
npm run mcp:call -- inspect_paired_webmcp_page '{"session_id":"REPLACE_WITH_SESSION_UUID"}'
npm run mcp:call -- invoke_approved_one_use_capability '{"session_id":"REPLACE_WITH_SESSION_UUID","tool_name":"REPLACE_WITH_NEW_APPROVED_TOOL"}'
npm run mcp:call -- list_capability_receipts
```

For a connector `PASS`, the invocation response, JSONL ledger, dashboard,
`list_capability_receipts`, and `get_capability_receipt_summary` must all agree
on the newly generated receipt ID and hashes. Preserve the exact browser
version, extension version, connector commit, origin, UTC time, and any
transport error. A page-side receipt alone does not meet this gate.

## ChatGPT developer connection

OpenAI's current MCP quickstart requires a public HTTPS URL for ChatGPT. Expose
only port 8787 through a temporary HTTPS tunnel and connect with the full
`/mcp?access_token=...` URL. Never expose bridge port 8788 or 48788. Refresh the ChatGPT app
connection after changing tool metadata.

This access-token URL is a local-development safeguard, not production
authentication. A hosted version requires OAuth, per-user authorization,
rate limiting, durable transactional storage, secret rotation, monitoring, and
a separate security/privacy review before public use.

Current OpenAI references:

- [MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Define tools and safety annotations](https://developers.openai.com/plugins/plan/tools)
- [Plugin reference](https://developers.openai.com/plugins/reference)

## Evidence boundary

The JSONL chain can detect edits, reordering, duplication, or gaps in the
retained local file. It is not signed, externally timestamped, independently
anchored, server-atomic across hosts, or protected from wholesale deletion and
replacement by an administrator of the same machine.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
