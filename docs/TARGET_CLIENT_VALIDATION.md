# Target-client validation

**Observation date:** 2026-09-01
**Earlier direct-run client:** Codex in-app browser
**Earlier direct-run origin:** `http://localhost:3000`
**Branch:** `codex/capability-negotiator`
**Scope:** Scenario 1 direct-client evidence, two failed unpacked-extension
connector attempts, and one Chrome 152 compatibility candidate, one local
document at a time

This record captures direct observations through a client's WebMCP discovery
and invocation surface and separately records the later connector attempt. It
is evidence only for the named local runs, origin, branch, and sessions. It is
not evidence of universal browser or client support. The disposable browser
used for the connector attempt reported Chrome `152.0.7977.64`, Chromium
revision `506c834ecceaa943c5f41e6cfe7f68acb5c45346`. A fresh retest must record
its own exact client and browser version rather than inherit this observation.

## Successful one-use path

1. The page initially exposed the broad `check_training_eligibility` tool.
2. After the human locked intent, the client discovered
   `propose_training_1042_read_capability`.
3. The proposal bound account `TRAINING-1042`, operation
   `read-eligibility`, origin `http://localhost:3000`, `max_calls: 1`, a
   120-second TTL, the controlled-state baseline hash, three prohibited
   effects, and the required byte-identical postcondition. Invoking the
   proposal staged authority but did not invoke the source tool or mutate the
   account.
4. The human confirmation displayed the exact origin, source tool, expiry,
   baseline, prohibited effects, result requirement, approval nonce, and an
   empty generated input schema.
5. Approval removed the broad source and proposal tools. The client then
   discovered only `get_training_1042_eligibility_once_e965283a8ad85370`,
   whose schema was an object with no properties, no required fields, and
   `additionalProperties: false`.
6. The client invoked the generated tool once. Receipt
   `29bf9903-4dec-44e7-a147-8bb94c73850b` recorded `eligible`,
   `account_mutated: false`, `verification.passed: true`, matching baseline
   and observed state hashes, no controlled-handler violations, invalidation
   reason `consumed`, and persistence `local-export-only`.
7. A cached tool handle rejected replay as stale. After physical retirement in
   that earlier build, a fresh discovery returned no tools. This predates the
   Chrome 152 deferred-retirement candidate and does not validate its
   inert-during-grace or post-grace behavior.

## Independent invalidation runs

- **Source drift:** after approval, changing the source declaration removed
  `get_training_1042_eligibility_once_3ff961154025615c` before invocation.
  Fresh discovery returned no tools and the cached handle rejected as stale.
  The page reported source-authority drift and confirmed that no invocation
  occurred.
- **Expiry:** a fresh approved capability,
  `get_training_1042_eligibility_once_1f161ef352b0a294`, remained
  discoverable before its deadline and disappeared immediately after the
  120-second approval window. Fresh discovery returned no tools and the
  cached handle rejected as stale. The page confirmed that no invocation
  occurred.

## Browser quality checks

- The browser console contained no warnings or errors after the test runs.
- At a requested 390 × 844 viewport, the page's measured width was 375 CSS
  pixels and its scroll width was also 375, with no horizontal overflow.
- A read-only accessibility smoke check found no unlabeled interactive
  elements and no duplicate IDs.

## Client limitation observed

After several dynamic register/withdraw cycles in one document, this client
reported that the WebMCP configuration exceeded its supported limits. A clean
page reload restored operation. The independent drift and expiry cases were
therefore run in fresh document sessions. This is a client/session churn limit,
not evidence that long-lived repeated registration is supported.

## Connector end-to-end attempt

Later on 2026-09-01, the unpacked Manifest V3 extension and local connector
were used for an end-to-end attempt against a live local page. The request
reached the page's generated one-use capability. The page invoked it and
produced receipt `31cac0df-4849-42cc-8f44-05a6bdacd9ea` with verdict `PASS`.

The return path did not complete. Transporting the receipt back through the
extension/bridge to the connector failed before a successful connector
acknowledgement established that the receipt had been validated and appended.
That attempt therefore did **not** prove a connector ledger entry, dashboard
record, `list_capability_receipts` result, or
`get_capability_receipt_summary` result. The receipt ID is page-side evidence
only and must not be represented as an end-to-end connector `PASS`.

Because the generated capability was one-use and the page invocation consumed
it, that tool must not be retried. Revalidation requires a fresh document
session or clean reload, a newly locked intent, a new proposal and exact human
approval, and a newly generated tool. The next run must preserve the exact
browser/client version, page origin, extension version, connector commit, UTC
time, connector response, ledger entry ID, receipt hash, and any console or
transport error.

The current connector result is **FAIL; fresh approved retest required**. The
current MVP has not been publicly deployed.

## Hardened no-retry attempt and Chrome 152 result-return hypothesis

Later on 2026-09-01, Manifest V3 extension version `0.1.3` was loaded unpacked
in the same disposable Chrome `152.0.7977.64` profile. The active fresh page at
`http://localhost:3001/` was paired to the isolated loopback bridge at
`127.0.0.1:48788`. Connector session
`6c58399d-5a38-42b8-9d6a-94553a6f0b68` reported the normalized origin as
`http://localhost:3001`, `connected: true`, and omitted both the raw page URL
and client-supplied label from its model-visible summary.

Before page-tool invocation, `list_capability_receipts` reported zero receipts
with `chain_verified: true`. The human then approved registration and exactly
one no-retry invocation of the next fresh zero-input Scenario 1 capability for
synthetic `TRAINING-1042`. Discovery exposed only
`get_training_1042_eligibility_once_188cba7cc04e98ac`, bound by contract
SHA-256
`67a747e180ada33376ff9b8e47c91a0ca390937ff0c5b2a75aaa663ec1fb3c8e`.
The connector requested exactly one invocation and made no retry.

The page callback completed and created local-export-only receipt
`fe3d952f-db38-463c-9023-3d36f51bf863` with verdict `PASS`. It recorded the
required `eligible` result, byte-identical before/after state hash
`21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`,
no side effects, no controlled-handler violations, and logical authority
invalidation reason `consumed`.

The result did not cross the browser execution boundary. The extension observed
`document.modelContext.executeTool()` reject before it could persist a
completion; the connector returned a fixed page-command failure, and its JSONL
ledger remained empty. No connector acknowledgement, dashboard entry,
`list_capability_receipts` entry, or `get_capability_receipt_summary` result was
established. This run is page `PASS` / connector `FAIL`.

The observed rejection is consistent with synchronous AbortSignal-based
physical unregistration during an in-flight call, but the retained evidence
does not prove that cause. There is no immutable external-client transcript,
raw rejection value, or browser trace for this run, and the later automated
coverage uses mocked ModelContext behavior. Chrome's
[Imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api#unregister_tools)
states that non-cancelling in-flight unregistration begins in Chrome 153; the
underlying behavior is also recorded in
[WebMCP issue 218](https://github.com/webmachinelearning/webmcp/issues/218).
Those primary sources make the Chrome 152 unregistration race a leading
hypothesis, not proven causality for this particular failure. The candidate now
consumes logical authority synchronously and schedules physical retirement 50
ms after the page callback settles successfully; post-claim failures retire
immediately. The delay is a Chrome 152 compatibility shim. It does not observe
or prove browser/client delivery and is deterministic mocked-test evidence only
until a fresh live run verifies the external result, inert replay rejection
during the delay, and fresh discovery after retirement. Chrome 153's documented
platform behavior must be tested separately rather than inferred from the shim.

The authorized one call was consumed and was not retried. A fresh test requires
a new page document, locked intent, proposal, exact approval, generated
capability, verified empty connector baseline, and new one-call authorization.

## Exact-build conformance gates

Before a connector-success claim, a fresh run must retain the exact target
browser build, client/extension build, raw client response or rejection,
relevant console output, connector transcript, and resulting ledger state. It
must cover in-flight unregistration on that target, callback settlement, the
external result, replay during the 50 ms shim, fresh discovery after
retirement, and the extension's implemented top-level `MAIN`-world path.

Broader browser or cross-version compatibility claims require a separately
scoped matrix covering Chrome 153-or-later, rejection of circular or otherwise
non-JSON-serializable results, the current string/`DOMString` result contract,
Permissions Policy and origin-keyed-agent-cluster/`document.domain` denial,
duplicate/stale-signal ownership, and discovery/`toolchange` behavior across
document destruction, navigation, and BFCache suspension/restoration.
Isolated-world or Chrome DevTools Protocol access is not established by the
target-client run and must not be claimed without its own exact-build test.

Declarative form tools and sandbox behavior are outside this imperative lab
run. Chromium issue
[526451590](https://issues.chromium.org/issues/526451590) remains an upstream
risk, not a local PASS or a vulnerability demonstrated by this record.

## Claim boundary

The observation proves a same-document, local-origin one-use flow in the named
client. It does not prove cross-tab, reload, multi-client, server-atomic, or
universal-client replay resistance; executable-byte attestation; browser-level
network isolation; or durable independently attested receipts.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
