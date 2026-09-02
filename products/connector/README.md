# LeftOut WebMCP capability connector

This local MVP connects the beginner-first product journey:

1. **Learn** — a five-lesson synthetic course teaches the shared Understand →
   Approve → Run → Verify method, with each lesson continuing through the
   browser-owned bridge;
2. **Protect** — the browser-owned extension HUD and loopback connector keep
   observation, guarded authority, invocation, and evidence separate; and
3. **Report** — a local receipt dashboard, separately redacted issue preview,
   explicit one-use save action, and temporary review list show the full
   reporting journey without enabling external submission or publication.

The connector also exposes a tool-only MCP server for ChatGPT/Codex or MCP
Inspector so an external agent can inspect the paired page and request the one
already-approved action.

It is intentionally a **tool-only** MCP app. The reporting UI is an ordinary
local web page, not an in-chat widget. Its only mutation is an explicit,
one-use save to the connector's temporary review list. The connector does not
create approval, generate a capability, invoke the broad source/proposal tools,
or submit anything externally.

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
The desktop-alpha launcher, permit evidence, report tickets, and revocation
controls added after that run have automated coverage but have not inherited
the dated live result.

The successful session used post-`f7290d9` page and extension content. The
running connector came from `f7290d9`; connector source is unchanged by the
later UI and extension validation fixes. The successful browser version was
not recaptured, and the future final commit itself was not live-run.

## Security shape

- The browser bridge defaults to `127.0.0.1:8788`; `48788` is the extension's
  one approved conflict fallback. An explicit
  `BRIDGE_HOST=::1` selects IPv6 loopback; non-loopback bridge binds are
  rejected.
- The MCP/report server binds to `127.0.0.1:8787` by default. MCP and receipt
  APIs require the randomly generated MCP token. Browser report pages use
  one-use launch tickets exchanged for an HttpOnly, SameSite cookie so the
  final report URL contains no token. Extension-issued report sessions are
  bound to their pairing, see only that pairing's receipts, and are invalidated
  when the pairing is revoked.
- The extension has exact loopback host permissions. One click obtains and
  consumes a short-lived, one-use connector challenge bound to the exact
  extension origin, page origin and path, and client label; the learner copies
  no pairing secret.
- MCP inspection performs discovery only.
- Invocation accepts only the five built-in generated families:
  `get_training_1042_eligibility_once_`, `update_profile_notice_once_`,
  `get_synthetic_delivery_status_safe_once_`,
  `set_training_notification_subscription_once_`, and
  `record_webmcp_capability_observation_once_`, each followed by exactly 16
  lowercase hexadecimal characters. Every bridge call supplies `{}`; approved
  task arguments remain frozen inside the capability contract.
- Scenario 1 keeps its v1 byte-identity receipt. Scenarios 2–5 use v2 receipts
  checked against a separate connector-owned profile table: exact source and
  handler binding, arguments, allowed and prohibited effects, result shape,
  before/after postcondition, chronology, and consumed identity must agree
  before the receipt is appended to the ledger.
- The connector returns safe receipt summaries to the model. The dashboard can
  display the full validated synthetic JSON locally.
- Receipts and issue drafts are separate stores and purposes. The scriptless
  local issue preview exposes only fixed, redacted synthetic fields. An exact,
  one-use action may save that displayed draft to a temporary, session-scoped
  review list; it cannot submit or publish it. A pure quarantine/moderation
  state machine and minimized published-record projection are implemented and
  tested, but they have no network or persistence route. A real intake,
  authenticated moderation service, durable audit store, or security-tooling
  feed requires a separate privacy and security review.

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
npm run desktop:alpha
```

The combined process starts the site on exact loopback port `3001`, starts the
connector and bridge, and writes a non-secret local runtime descriptor. It
makes these local destinations available:

- the authenticated MCP URL;
- one-use setup and receipt-viewer launch URLs;
- the loopback browser-bridge URL; and
- the five-minute learning page.

Load the unpacked extension from `products/extension`, open the printed local
lab URL, open the extension, and select **Connect this practice tab**. The
extension obtains its short-lived pairing challenge automatically. The
operator log also contains advanced local recovery material, but the beginner
path does not require copying any token, code, port, or JSON.

For MCP Inspector, select Streamable HTTP and use the complete printed MCP URL,
including its `access_token` query parameter. The beginner sequence is:

1. Complete the exact approval in the browser page.
2. Wait for the page's automatic one-way permit offer and confirm that the
   extension HUD says one exact action is protected
3. Tell the connected agent: “Use the LeftOut connector to run the one approved
   practice action. Run it once; do not retry.” The zero-input
   `run_one_approved_practice_action` helper discovers the sole connected page
   and sole approved action. The human never copies a session ID, generated
   tool name, or protocol data.
4. Use `get_capability_receipt_summary` or select **Review receipt or report a
   concern**
   in the extension

The helper fails closed before invocation if the page or action is ambiguous.
The lower-level list, inspect, and exact-name invocation tools remain available
for advanced diagnosis; they are not part of the beginner handoff.

The permit offer is not approval proof. The extension independently validates
and binds the untrusted permit to the paired tab, browser document, declaration,
and bridge session. Manual paste/file import is recovery-only.

The repository also includes a small SDK client for reproducible live calls.
In PowerShell, set the complete MCP URL printed by the running connector, then
list or invoke tools:

```powershell
$env:MCP_URL = 'http://127.0.0.1:8787/mcp?access_token=REPLACE_WITH_CURRENT_TOKEN'
npm run mcp:list-tools
npm run mcp:call -- run_one_approved_practice_action
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
