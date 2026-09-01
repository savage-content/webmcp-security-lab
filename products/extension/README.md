# LeftOut WebMCP Capability Bridge (desktop MVP)

This Chrome Manifest V3 extension pairs one user-selected HTTP(S) tab with the
local connector. It is a narrow transport adapter, not an approval surface.

**Validation status (2026-09-01):** Unpacked manifest `0.1.3` completed one
fresh external-Chrome, extension, loopback-connector run. After a bounded
cross-realm normalization fixed discovery of Chrome's `MAIN`-world inspection
envelope, the bridge discovered generated zero-input capability
`get_training_1042_eligibility_once_f7d2fa4e8e8d1e03` and invoked it exactly
once with no retry. Receipt `d421aaaf-262d-4fbe-81ab-e93acb5efce9` returned
through the bridge, passed connector validation, and was committed as entry
`abc6b79c-c4fc-44b4-b2ce-5da7e525b5fa`. Before and after state were byte
identical, the state hash remained
`21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`,
side effects were empty, call number was one, logical authority was consumed,
and post-run discovery returned zero tools.

Two earlier no-retry attempts produced page-side `PASS` receipts but did not
complete connector return transport. The latest earlier failure was consistent
with Chrome 152 cancelling an in-flight call after registration abort, but no
retained browser trace proves that cause. The later run completed successfully
with the 50 ms callback-settlement shim, but replay during that delay remains
mocked-test evidence and the successful browser version was not recaptured. It
does not establish universal compatibility. This remains an unpacked local
prototype, not a signed package, Chrome Web Store release, or public deployment.

## Load it unpacked

1. Start the local connector described in `../connector/README.md` and copy its
   current eight-digit one-time pairing code.
2. Open `chrome://extensions`, enable **Developer mode**, select **Load
   unpacked**, and choose this `products/extension` directory.
3. Open the WebMCP page, select the extension, choose the loopback connector,
   enter the one-time code, and select **Pair active tab**.

The popup deliberately clears the pairing code. The bridge token is kept in
`chrome.storage.local` and is never shown to the page or popup. The extension
badge reads `ON` while the local session is healthy and `!` after a bridge
error.

## Exact authority

The extension has only `activeTab`, `scripting`, and `storage`. Its host
permissions are limited to exact loopback endpoints on ports `8788` and
`48788`; it does not request `<all_urls>`.

Port `8788` is the default desktop-extension boundary. Port `48788` is the one
approved fallback for a local conflict. Start the connector on one of those
ports; every other port and every non-loopback host is rejected rather than
widening the bridge authority.

The injected isolated-world script contains no connector credential and reads
no page content. It only wakes the service worker once per second. The service
worker performs all loopback fetches and accepts two command shapes:

- `inspect-tools`: calls `document.modelContext.getTools()` in the top-level
  page's main world, returns the exact observed origin and sanitized tool
  declarations, and invokes nothing.
- `invoke-approved-capability`: accepts only a name matching
  `^get_training_1042_eligibility_once_[0-9a-f]{16}$`, verifies the discovered
  declaration has the expected zero-input schema and read-only annotation,
  then calls `document.modelContext.executeTool(tool, '{}')` once, matching
  Chrome's current JSON-string invocation contract. A stringified callback
  result is bounded and parsed as JSON before it crosses the bridge; a direct
  structured result from a transition-era implementation is accepted without
  retrying the one-use invocation.

The bridge never calls `registerTool`, never clicks an approval control, never
invents approval, and cannot invoke `check_training_eligibility` or the
proposal tool. Origin and tool identity are checked again before a result is
returned to the connector.

## Threat model and limitations

- **Explicit document grant:** opening the popup grants `activeTab` only for the
  visible tab. The stored pairing, poll sender, and every MAIN-world injection
  are bound to that top-level document ID. Navigation invalidates the local
  pairing even when the new document has the same origin and path.
- **One-time bootstrap:** the connector consumes and rotates its pairing code.
  The code is not persisted by this extension.
- **Retry-safe result delivery:** each tab has an independently serialized
  extension-local record. A sanitized command result is saved before delivery,
  retried before another poll, and removed only after the connector explicitly
  acknowledges it. Navigation clears both the pairing and any undelivered
  result.
- **Loopback trust boundary:** the MVP uses unauthenticated HTTP for the first
  pairing request, so malware already controlling the local machine or
  loopback traffic remains out of scope. The post-pair bridge token
  authenticates each poll and result.
- **Page declarations are untrusted:** inspection strings are transported as
  data and are never evaluated as instructions. The uniquely named invocation
  is still implemented by the paired page, so the connector must verify the
  returned receipt and bound origin.
- **Browser API variance:** this requires the experimental
  `document.modelContext.getTools()` and `executeTool()` methods. Registration
  alone does not prove discovery or invocation support.
- **Local storage:** Chrome protects extension storage from ordinary page
  JavaScript, but it is not an encrypted secret store. A compromised browser
  profile is out of scope.
- **No server-side revoke:** **Forget local pairing** deletes the browser token
  and stops useful polling, but this MVP has no connector revocation endpoint.
  Restart the connector to invalidate orphaned sessions.
- **Desktop prototype:** this directory is unpacked-development software, not a
  Chrome Web Store package, signed release, mobile extension, or universal
  compatibility claim.

The bridge reports evidence from one named browser session. It does not prove
that a page, client, or tool is safe.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
