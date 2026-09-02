# LeftOut WebMCP Safety (desktop prototype)

This Chrome Manifest V3 extension is the browser-owned **Protect** surface for
the beginner WebMCP lesson. It pairs one user-selected HTTP(S) tab with the
local connector, shows a fixed safety HUD, and enforces one row from a closed
five-lesson capability policy. It does not approve a page action for the user.

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
does not establish universal compatibility. This remains a local development
preview, not a signed package, Chrome Web Store release, or public deployment.
Manifest `0.3.0` adds the local safety HUD, one-click loopback challenge,
automatic untrusted permit handoff, exact browser-document/session binding,
connector-side revocation, and safe report opening. Those additions have
automated coverage but have not inherited the earlier live-browser result.
Consumed permit digests remain tombstoned until expiry, so removing or
re-importing a permit cannot restore its one-use authority.

## Load it unpacked

1. From the repository root, run `npm run desktop:alpha`.
2. Open `chrome://extensions`, enable **Developer mode**, select **Load
   unpacked**, and choose this `products/extension` directory.
3. Open the WebMCP page, select the extension, and select **Connect this
   practice tab**. The extension uses a short-lived loopback challenge bound to
   its own extension origin and the exact page.
4. Complete an exact lesson approval on the page. Only after approval and
   successful registration does the learning page offer its self-hashed permit
   to the paired extension through a one-way handoff. The extension treats that
   offer as untrusted narrowing data, revalidates it, and binds it to the exact
   tab, document, and bridge session. Manual JSON/file import remains under
   **Technical details and recovery**; it is not part of the learner path.

## Build the reviewable preview package

From the repository root, run:

```bash
npm run local-guard:package
```

The command writes a deterministic ZIP, release manifest, and `SHA256SUMS.txt`
under ignored `outputs/local-guard/`. It packages only the reviewed runtime
allowlist and fails on MV3 permission drift, host-permission drift, unexpected
service worker or popup references, symlinked inputs, or dynamic code. The
result is still an unsigned developer preview; reproducibility does not provide
a publisher identity or Chrome Web Store review.

The bridge token is kept in `chrome.storage.local` and is never shown to the
page or popup. The extension badge distinguishes observed, protected, changed,
receipt, and error states; the in-page HUD is advisory because a page can
imitate an overlay. Trust the extension icon and popup for browser-owned state,
not a page's claim that the offer was accepted.

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
- `invoke-approved-capability`: accepts only one of five generated tool-name
  patterns in `lesson-policy.js`, verifies the discovered
  declaration has the expected closed zero-input schema and exact annotations,
  verifies an unused origin-, path-, name-, observable-declaration-, and
  expiry-bound permit with structurally valid contract metadata, durably
  consumes that permit, then calls
  `document.modelContext.executeTool(tool, '{}')` once, matching
  Chrome's current JSON-string invocation contract. A stringified callback
  result is bounded and parsed as JSON before it crosses the bridge; a direct
  structured result from a transition-era implementation is accepted without
  retrying the one-use invocation.

Permit import never pairs, inspects, registers, approves, or invokes. The
permit's self-hash detects accidental alteration but is not a signature or
independent proof of approval; it can only narrow one row in the extension's
closed synthetic-lesson policy and cannot expand the accepted tool family.

The bridge never calls `registerTool`, never clicks an approval control, never
invents approval, and cannot invoke `check_training_eligibility` or the
proposal tool. Origin and tool identity are checked again before a result is
returned to the connector.

The advanced lab's direct **Run** or **WebMCP self-test** controls are not
mediated by this extension. The guided path has no direct page-run fallback.
Only an invocation delivered through the paired connector, consumed by the
service worker, and represented by a connector receipt may be described as
Membrane-protected. Direct page-local evidence must not claim extension
enforcement.

## Threat model and limitations

- **Explicit document grant:** opening the popup grants `activeTab` only for the
  visible tab. The stored pairing, poll sender, and every MAIN-world injection
  are bound to that top-level document ID. Navigation invalidates the local
  pairing even when the new document has the same origin and path.
- **One-click bootstrap:** the extension requests a random, short-lived,
  one-use challenge from the connector. The connector binds it to the exact
  extension origin, page origin and path, and client label, then consumes it at
  pairing. The beginner never copies a code.
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
- **Two-sided disconnect:** **Disconnect and revoke pairing** first invalidates
  the connector session, then deletes the extension record. Navigation and tab
  closure also attempt connector revocation before removing local state.
- **Safe report opening:** the popup requests a fresh one-use report ticket.
  The connector exchanges it for an HttpOnly, SameSite cookie and redirects to
  a token-free final `/receipts` URL. No report ticket appears in popup status
  or the page. The separate local issue preview is fixed, redacted, and
  non-submittable; no public intake or tooling feed is enabled.
- **Desktop prototype:** this directory is unpacked-development software, not a
  Chrome Web Store package, signed release, mobile extension, or universal
  compatibility claim.

The bridge reports evidence from one named browser session. It does not prove
that a page, client, or tool is safe.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
