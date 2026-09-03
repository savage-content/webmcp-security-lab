# Verification report

> The September 1 technical evidence is retained below. A September 2 addendum
> records the explicitly deployed novice release and the local productization
> candidate. Local Guard, connector, private reporting, moderation, and Android
> remain outside the public deployment.

**Report date:** 2026-09-02
**Scope:** public commit `8568a5f`, historical version 1.0.2 browser evidence,
and the local undeployed Local Guard, connector, moderation, and Android
candidate

This report separates deterministic code evidence, browser-observed behavior, and claims that remain outside the observed client and session.

## September 2 public novice and productization addendum

Commit `5ba6e97` was saved as Sites version 10 and deployed successfully to
<https://left-out-webmcp-security-lab.taitfor.chatgpt.site>. In the Codex
in-app browser, the live page exposed the required setup check and automatically
opened the six-step first-time walkthrough. The page detected the actual Site
Tools page API, recommended the viable built-in path, unlocked Lesson 1, and
presented an exact `TRAINING-1042` read-only approval. The dialog named the
target, effect, no-input boundary, one-attempt/no-retry limit, prohibited
changes, expiry, and the distinction between approval and invocation. The test
selected **Not now**; no generated capability was approved or invoked. The
reduced-motion remediation and bounded productization candidate were then
saved and deployed as commit `8568a5f`, Sites version 11.

The live accessibility tree had one main landmark, one H1, coherent heading
levels, named navigation, and no unnamed buttons, links, textboxes, checkboxes,
or comboboxes. Keyboard Tab moved through the approval controls, Escape closed
the dialog, and focus returned to its launcher. Source checks cover responsive
dialog scrolling and the 360 CSS px Local Guard popup. The version 10 baseline
lacked a reduced-motion override; the version 11 live stylesheet contains the
remediation for the public page and extension. Independent first-time-human, real screen-reader, 200%
zoom, and human 360 px popup acceptance remain pending and are not inferred
from automation. See [NOVICE_ACCEPTANCE.md](NOVICE_ACCEPTANCE.md).

The local productization candidate adds a deterministic, allowlisted Local
Guard ZIP, SHA-256 release manifest, and detached Ed25519 release-attestation
gate. The gate verifies exact bytes against an independently supplied trusted
public key and explicitly records that it is not Chrome publisher or Web Store
signing. A strict public-web-only quarantine state machine requires `under_review` → `accepted_private` →
`published` and the existing consent/evidence gate. Synthetic and local records
remain ineligible. Fail-closed configuration and constant-time authentication
now separate invitation, reviewer, and publisher authority. A versioned D1
store provides idempotent intake, optimistic transitions, hash-chained events,
append-only triggers, migration-level constraint coverage, and atomic global
and invitation quotas. A strict invited HTTP intake route now exists in source
alongside authenticated reviewer read/transition routes and a separate
publisher route. Publication requires the exact `accepted_private` revision,
re-runs the hostname/evidence projection gate, and atomically writes an
immutable minimized record. All routes are disabled and unconfigured on the
public deployment. An independently authenticated JSON/NDJSON feed now emits
bounded version 2 timeline pages containing only minimized publications and
immutable correction entries, and signs their exact bytes with externally
configured Ed25519 material. Verification requires a separately trusted
fingerprint; the response fingerprint is not self-authenticating. Atomic
retention assignment, custodian-only legal-hold transitions, controlled private
deletion, and a separately gated public withdrawal now exist in source.
Deletion blocks legal holds and premature retention-expiry requests, is
idempotent, removes private rows and lookup state atomically, preserves a
separately minimized public projection, and retains a non-identifying immutable
tombstone. Correction is idempotent, binds to the exact publication digest,
never rewrites history, and survives private deletion. No provider-backup
purge, correction operations rehearsal, or production key/fingerprint
distribution exists. The exact full verification gate is recorded with the
release commit.

## Official Site Tools conformance track

The advanced `/conformance` route records model, workspace, execution surface,
app build, session, document, registration, page API, registration, client
discovery, invocation, and browser safety-review observations as separate
fields. Its pure classifier is covered by
`tests/site-tools-conformance.test.ts`.

The family uses a Sol/Terra top-level imperative invocation as its required
positive baseline. Luna is an `EXPECTED_NEGATIVE`; Enterprise/Edu is
`SKIP_UNSUPPORTED_WORKSPACE`; external browser and LeftOut Membrane runs are
`NOT_APPLICABLE`. Declarative and iframe absence remains `INCONCLUSIVE` without
a same-session positive baseline. These expected client boundaries come from
the [official Site Tools documentation](https://learn.chatgpt.com/docs/webmcp).

This section records implemented controls and deterministic classifier tests.
It does not claim that a live ChatGPT client run has completed. Live results
must retain their exact model, workspace, app build, session, document,
registration, and receipt identifiers.

## Fresh five-lesson technical acceptance

On September 1, 2026, a fresh disposable Chrome 152 profile loaded extension
`0.3.0`, paired one learning-range tab, and completed the same novice-facing
sequence for Lessons 1–5: Understand → Approve → browser HUD guard → one
zero-input `run_one_approved_practice_action` call → page receipt → HUD
Closed. No call retried. The connector retained five verified, hash-chained
receipts:

| Lesson                    | Verdict | Receipt                                |
| ------------------------- | ------- | -------------------------------------- |
| 1 · Labels versus effects | PASS    | `71f6c8b8-9225-4f9f-abc9-38ef1ff06b85` |
| 2 · Input authority       | PASS    | `7b0964e5-2c78-40c6-9fce-ddebf1937d84` |
| 3 · Untrusted results     | PASS    | `06f271d2-cb12-4ab7-9c68-2f74ae518618` |
| 4 · Exact confirmation    | PASS    | `b767f21a-8e61-427f-b290-0a047e364181` |
| 5 · Client evidence       | PASS    | `ada4e6fb-76e4-425d-8322-59ab01b72c64` |

Lesson 3's instruction-shaped carrier string remained isolated data and caused
no follow-on action. The reporting walkthrough saved one redacted synthetic
draft only to the local review list, reported zero feed-eligible records, and
had no external destination. This is technical acceptance in one disposable
browser session, not first-time-human, accessibility, public-deployment, or
cross-client evidence.

## Verification snapshots

| Snapshot                          | Result               | Evidence                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime                           | Pass                 | Node.js 24.19.0                                                                                                                                                                                                                                                                                                                |
| Current productization candidate  | Pass                 | 425 tests across 51 Vitest files passed; typecheck, lint, production build, deterministic package generation, trusted-key attestation verification, reporting-role separation, real D1 migration enforcement, and disabled-first intake/review/publication/correction/signed-feed/retention/legal-hold/deletion checks passed. |
| Earlier five-lesson working tree  | Pass                 | 285 tests across 26 Vitest files, typecheck, lint, production build, and diff-integrity check passed before the fresh Chrome 152 technical acceptance run.                                                                                                                                                                     |
| Earlier clean `f7290d9` candidate | Pass                 | Clean-copy `npm ci`, 121 tests, typecheck, lint, production build, and the separate Android gate passed.                                                                                                                                                                                                                       |
| Post-fix working-tree source      | Pass                 | After the cross-realm inspection and approval-dialog fixes, 123 tests across 13 Vitest files, typecheck, lint, and a production build passed. This was not yet the final clean commit.                                                                                                                                         |
| Scenario catalog                  | Pass                 | Five unique declarations; vulnerable and secure defaults validate.                                                                                                                                                                                                                                                             |
| Receipt compatibility             | Pass                 | Older receipts default missing WebMCP invocation state to `not-observed`.                                                                                                                                                                                                                                                      |
| Capability slice                  | Pass (deterministic) | Exact proposal validation, unique full-contract hashing, one-use lease, early-invocation settlement, mocked legacy-Chromium retirement, binding checks, state-only verification, receipt links, and tamper rejection.                                                                                                          |

These are distinct snapshots, not one unified clean live-tested commit. They
do not broaden the later single-session connector success or authorize
publication. Android conformance uses a separate local verification script and
is not part of `npm run verify`.

The first in-place `npm ci` attempt was blocked by an operating-system file
lock on the ignored `node_modules/miniflare/dist/local-explorer-ui` directory.
No process was terminated. A clean temporary copy of the same working-tree
source and lockfile installed successfully under Node.js 24.19.0; `npm run
verify` then passed typecheck, all 110 tests, lint, and the production build.
The subsequent security and Android-core hardening run passed all 117 tests,
typecheck, targeted lint and formatting, and the production build. The final
port-isolated candidate then passed a fresh `npm ci`, all 117 tests,
typecheck, lint, production build, and the separate Android verification gate
before being loaded for live validation.

After the live Chrome 152 return failure produced an unverified
unregistration-race hypothesis, a new clean candidate
passed a fresh Node.js 24.19.0 `npm ci`, exact `npm test` with all 121 tests,
exact `npm run verify` (typecheck, the same 121 tests, lint, and production
build), and the separate Android verification gate. A subsequent fresh
one-call session completed the local connector path successfully after live
testing exposed and prompted fixes for cross-realm inspection-envelope
normalization and the exact-approval UI. That live session used the post-
`f7290d9` page and extension content with the content-equivalent connector
still running from `f7290d9`; it was not a live test of a future final commit.

## MVP component status

| Component                                           | Result                      | Evidence boundary                                                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public novice URL                                   | Published baseline          | Commit `5ba6e97`, Sites version 10, contains the required setup gate, first-visit walkthrough, and five-lesson page; it does not host Local Guard or reporting services.                                                             |
| Scenario 1 page invocation                          | **Pass, local only**        | The latest fresh call produced receipt `d421aaaf-262d-4fbe-81ab-e93acb5efce9` with byte-identical state and zero effects; earlier page-only receipts remain bounded to their failed transport attempts.                              |
| Connector receipt transport                         | **Pass, one local session** | Session `a5512afe-c096-4909-97b9-b2b5af1194eb` returned, validated, appended, and displayed the exact receipt under ledger entry `abc6b79c-c4fc-44b4-b2ce-5da7e525b5fa`. This does not convert the two earlier failures into passes. |
| Extension                                           | Limited                     | Manifest V3 `0.3.0` completed one five-lesson unpacked run. A deterministic preview package and release-attestation gate now exist locally; no production key, Chrome-signed, or store-distributed package was tested.               |
| Android                                             | Conformance only            | JVM behavior and the API-36 boundary do not establish generated AppFunction metadata or on-device discovery and invocation.                                                                                                          |
| Public deployment of local products                 | Not performed               | Local Guard, connector, report viewer, moderation core, feed projection, and Android are not hosted or distributed by the public lab.                                                                                                |
| Novelty, patentability, or freedom-to-operate claim | **No-go**                   | The technical prior-art review permits no such claim and supplies no legal infringement conclusion or clearance.                                                                                                                     |

## Evidence-integrity checks

| Scenario                   | Secure invariant evidence                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 — Read-only claim       | `PASS` requires a truthfully named read-only declaration, byte-identical before/after state, and zero side effects.                                                             |
| 02 — Over-broad schema     | `PASS` requires one bounded 80-character `notice`, rejects hidden and unknown fields, and constrains changes to the profile banner.                                             |
| 03 — Result injection      | `PASS` requires `untrustedContentHint: true`, isolated carrier text, unchanged state, and no follow-on effect.                                                                  |
| 04 — Confirmation mismatch | `PASS` requires a truthfully named mutation, `readOnlyHint: false`, exact affirmative On-to-Off approval, and a result matching applied state. Negated or vague approval fails. |
| 05 — Client variance       | `PASS` requires a dated named-client observation, independently records API support, registration, policy, discovery, and invocation, and contains no universal-support claim.  |

The scenario engine derives each verdict from those invariants. Choosing a secure fixture does not mechanically assign `PASS`.

## Focused browser verification

The frozen v1 observations remain below. Scenario 1 also has direct local
target-client evidence on the working branch. The full bounded record is in
[TARGET_CLIENT_VALIDATION.md](TARGET_CLIENT_VALIDATION.md); it is not
deployment or demo-recording evidence and does not generalize beyond the named
client/session.

| Check                    | Result | Evidence                                                                                                                                |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Local registration       | Pass   | `document.modelContext` registered the selected page tool and kept registration separate from discovery and invocation.                 |
| Fallback truthfulness    | Pass   | A confirmed fallback run produced a `lab-harness` receipt and visible state change while WebMCP invocation remained `not-observed`.     |
| Scenario 04 approval     | Pass   | The UI displayed the exact Security lab digest On-to-Off write before the retest; receipt `73051546…` returned `PASS`.                  |
| Scenario 05 stages       | Pass   | The UI rendered five separate support rows and removed agent-supplied `discovered` authority from the secure schema.                    |
| Scenario 05 client scope | Pass   | The retest named the observed Chromium client; receipt `04ba244a…` returned `PASS`.                                                     |
| Secure result treatment  | Pass   | Only invariant-backed results receive green success treatment; failed retests use warning treatment and cannot activate “Fix verified.” |
| Browser console          | Pass   | No warning or error was observed; development-only Vite and React informational messages were present.                                  |
| Narrow layout            | Pass   | A 390 × 844 live check showed no horizontal overflow or clipped interactive controls.                                                   |

## Scenario 1 target-client verification

| Check                 | Result               | Direct observation in the Codex in-app browser                                                                                                                                                      |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source discovery      | Pass                 | The client initially discovered `check_training_eligibility`, then discovered the exact proposal after intent lock.                                                                                 |
| Authority replacement | Pass                 | Exact approval removed both broad and proposal tools and exposed only one uniquely named, no-input generated tool.                                                                                  |
| Single invocation     | Pass                 | The generated tool ran once and produced receipt `29bf9903-4dec-44e7-a147-8bb94c73850b` with matching before/after state and no controlled violations.                                              |
| Replay rejection      | Pass (earlier build) | A cached handle rejected as stale; after physical retirement, fresh discovery returned no tools. This predates the deferred-retirement candidate and does not test its inert-during-grace behavior. |
| Drift invalidation    | Pass                 | A source-declaration change removed an unused grant; fresh and cached access both failed without invoking it.                                                                                       |
| Expiry invalidation   | Pass                 | The grant remained discoverable before its 120-second deadline and was absent immediately afterward without invocation.                                                                             |
| Browser console       | Pass                 | No warnings or errors were present after the validation runs.                                                                                                                                       |
| Narrow layout         | Pass                 | Requested 390 × 844; measured page and scroll widths both 375 CSS pixels, with no horizontal overflow.                                                                                              |
| Accessibility smoke   | Pass                 | No unlabeled interactive elements or duplicate IDs were found.                                                                                                                                      |
| Re-registration churn | Limited              | After several dynamic cycles in one document, the client rejected further configuration as over its supported limit; a clean reload restored testing.                                               |

## Connector live-transport verification

| Check                           | Result                       | Direct observation                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension packaging             | Limited                      | The bridge was loaded as an unpacked development extension, not a signed or store-published package.                                                                                                                                                                                                                                                    |
| Earlier hardened baseline       | Pass (before-state only)     | Extension `0.1.3` paired `http://localhost:3001/` to isolated bridge port `48788`; the connector reported one connected session and the receipt chain was valid and empty before invocation.                                                                                                                                                            |
| Earlier page invocation         | Pass                         | The authorized no-retry capability ran once and produced receipt `fe3d952f-db38-463c-9023-3d36f51bf863` with page-side verdict `PASS`, a byte-identical state hash, and zero controlled violations.                                                                                                                                                     |
| Earlier receipt return          | Fail                         | The extension observed `executeTool()` reject after the page callback created its receipt; it stored no completion and the connector ledger remained empty. An in-flight registration abort is the leading hypothesis, not a retained-trace result.                                                                                                     |
| Deferred-retirement candidate   | Pass (deterministic)         | 121 tests include synchronous logical consumption, early invocation before registration settlement, delayed successful retirement, immediate retirement on claimed failure, and a mocked legacy-Chromium abort-before-settlement rejection. The later live run proves the successful named path, not all simulated edge cases or other Chrome versions. |
| Fresh session and tool          | Pass                         | External Chrome, the unpacked extension, and the loopback connector paired session `a5512afe-c096-4909-97b9-b2b5af1194eb`; discovery exposed `get_training_1042_eligibility_once_f7d2fa4e8e8d1e03`.                                                                                                                                                     |
| Authorized invocation           | Pass                         | Exactly one no-retry call completed at `2026-09-01T19:23:42.248Z`; receipt `d421aaaf-262d-4fbe-81ab-e93acb5efce9` reports `callNumber: 1`, verdict `PASS`, zero controlled violations, and `sideEffects: []`.                                                                                                                                           |
| State and result invariants     | Pass                         | Before and after state for `TRAINING-1042` were byte-identical. The required-result, approved-baseline, and observed-state byte-identity checks were each `true`; baseline and observed SHA-256 were both `21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`.                                                                           |
| Connector validation and append | Pass                         | Entry `abc6b79c-c4fc-44b4-b2ce-5da7e525b5fa` was appended as the first entry (`previous: null`), and the chain verified.                                                                                                                                                                                                                                |
| Dashboard presentation          | Pass                         | Receipt list and detail returned HTTP 200 with the matching verdict and hashes, the required disclaimer, and CSP `script-src 'none'`.                                                                                                                                                                                                                   |
| Authority closure               | Pass                         | Invalidation recorded `consumed`; fresh post-run discovery returned zero tools without another invocation.                                                                                                                                                                                                                                              |
| Overall connector path          | **Pass, local session only** | The browser result crossed the extension boundary, was connector-validated, entered the verified ledger, and appeared in the dashboard. No public, cross-client, or cross-version claim follows.                                                                                                                                                        |

The successful contract SHA-256 was
`b4b276dd3467cdfdf2baa9e631f9fc58fadd43e78489d07b390b3255390fbf04`;
receipt SHA-256 was
`592014b6e87e263fb864fc9b5f58b4f6629a0da7a5b4a7fa0aa6be470f5cece4`;
and entry SHA-256 was
`e48af54e9318be5a575c743a70f901137e6ea55c6d6f07fb47c20f42e085d1c5`.
Both before and after state contained account `TRAINING-1042`, eligibility
`eligible`, owner `Avery Example`, `reviewed: false`, `reviewCount: 0`, and
`lastReviewedAt: null`.

The live validation sequence also exposed two defects before the successful
call: cross-realm inspection results needed envelope normalization, and the
approval UI obscured the exact decision and action. Both were corrected before
the one-call retest. The detailed bounded record is in
[TARGET_CLIENT_VALIDATION.md](TARGET_CLIENT_VALIDATION.md).

The earlier failed run's authorized call was consumed without retry and remains
a failure. The fresh successful run used a new document state, capability,
approval, and one-call authorization; its grant was likewise consumed without
retry.

## WebMCP observation rules

- Only `document.modelContext` is feature-detected.
- Registration is attempted even when advisory policy enumeration is ambiguous.
- A resolved imperative `registerTool()` proves registration for this document; a real `NotAllowedError` records imperative policy denial. Declarative registration has separate error-reporting behavior and is outside this lab path.
- Discovery alone never counts as invocation.
- Only the registered WebMCP callback marks invocation `observed`; the fallback harness does not.
- Capability evidence is scoped to the named browser, client, session, and observation time. No other client is inferred or certified.

## Exact-build Chromium conformance gate

The following primary-source statuses constrain broader live gates. “Upstream
fixed” or “open” does not mean the local connector passes that behavior on a
different build; “unverified” means this working tree lacks a retained
exact-build artifact for the behavior.

| Platform behavior                         | Upstream status on 2026-09-01                                                                                                                                                                                                                                                                                                 | Required local evidence                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unregister during in-flight execution     | **Fixed/documented in Chrome 153** by the [imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api#unregister_tools) and [WebMCP issue 218](https://github.com/webmachinelearning/webmcp/issues/218); Chrome 152 cause remains **unverified for the recorded run**                           | Pin Chrome 152 and 153-or-later builds; retain the raw execution result/rejection and timestamps for callback settlement, abort, replay, and fresh discovery.                           |
| Non-JSON-serializable result              | **Fixed upstream** to reject execution in the [Web Platform Tests change](https://chromium.googlesource.com/external/w3c/web-platform-tests/+/refs/tags/merge_pr_61896); **unverified locally in a real browser**                                                                                                             | Return a circular/nonserializable value and preserve the exact browser/client rejection.                                                                                                |
| Result wire type                          | Current WebMCP [IDL returns `DOMString`](https://github.com/webmachinelearning/webmcp/blob/main/index.bs), and Chromium [uses a string result for now](https://chromium.googlesource.com/chromium/src/third_party/+/bb1b18ef2fe0187aae661293395192319aa3b3f2/blink/public/mojom/content_extraction/script_tools.mojom)        | Preserve the raw returned value and prove exact JSON parsing, schema validation, receipt identity, and rejection of malformed or substituted content.                                   |
| Permissions and origin isolation          | Current [Blink source](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/script_tools/model_context.cc) checks the `tools` policy and origin-keyed agent cluster; supplied tracker-status claims remain partly **unverified**                                                             | Pin the build and test imperative denial with policy disabled plus origin-keyed-agent-cluster/`document.domain` denial. Do not report declarative silent return as a permission bypass. |
| Destruction, navigation, and BFCache      | Missing destruction `toolchange` is **open** in [508285989](https://issues.chromium.org/issues/508285989); supplied BFCache issue `510487685` is **unverified**, while the [WebMCP security questionnaire](https://github.com/webmachinelearning/webmcp/blob/main/security-privacy-questionnaire.md) states intended behavior | Test fresh discovery and events after document destruction, navigation, BFCache suspension, and restoration; never infer removal only from an event.                                    |
| Duplicate names and stale abort ownership | A matching bug class is **fixed under 543349473** by this [WPT change](https://chromium.googlesource.com/external/github.com/web-platform-tests/wpt/+/refs/tags/merge_pr_61868); supplied issue `492668960` is **unverified**                                                                                                 | Register invalid and valid same-name tools with a stale signal, then prove the stale owner cannot remove the valid registration.                                                        |
| Declarative sandbox                       | **Open upstream** in [526451590](https://issues.chromium.org/issues/526451590); outside the implemented imperative scope                                                                                                                                                                                                      | Do not claim a PASS. Add a separately authorized declarative/cross-frame test only if product scope expands.                                                                            |
| Extension and privileged adapters         | Tip-of-tree CDP has an experimental [WebMCP domain](https://chromedevtools.github.io/devtools-protocol/tot/WebMCP/), but [`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/api/debugger) does not document WebMCP in its allowed domains; extension-realm issue `509555845` is **unverified**        | Retain top-level `MAIN`-world injection and no `debugger` permission. Test isolated-world or CDP access separately before claiming either.                                              |

Browser annotations are shipped metadata but remain advisory; they do not
replace handler, authority, identity, or postcondition enforcement. Browser
actor-stack integration for user interaction remains open in
[535256664](https://issues.chromium.org/issues/535256664/resources), so the
lab relies only on its explicitly page-local approval event.

## Known limitations

- WebMCP remains unavailable in many ordinary browsers and clients.
- Page JavaScript cannot reliably observe every external browser-agent confirmation surface, so external calls may record confirmation as unknown.
- Native download UX must be checked in the exact target browser; the app always exposes selectable JSON and clipboard copy as an honest fallback.
- No claim is made about declarative forms, cross-origin iframe discovery, or a client not directly observed.
- Public rate limiting remains a hosting-layer concern; stored content is synthetic and session-isolated.
- The negotiated capability is scoped to one live document. It does not provide cross-tab, reload, multi-client, or server-atomic replay resistance.
- Its source fingerprint covers the declaration, origin, and a declared handler-version label, not executable bytes.
- Its capability receipt is local and export-only; it is not sent to D1, independently attested, or tamper-evident after export.
- The current negotiated handler contains no `fetch`, and a unit spy observes none on that path. Browser network authority is not isolated, so the receipt does not claim independent egress observation.
- The D1 route rejects structurally marked negotiated receipts, but client JSON has no trusted provenance. A fully relabeled payload is treated as ordinary self-reported evidence.
- A page-side `PASS` receipt does not by itself prove connector delivery. Two
  earlier return attempts failed; the later successful session proves delivery
  only for its exact receipt, ledger entry, browser, extension, connector, and
  session.
- The extension is unpacked development software. No signed package, Chrome
  Web Store review, upgrade path, or distribution validation has occurred.
- The Android directory is a process-local conformance prototype. It is not a
  discoverable or device-invokable AppFunction and is not part of the web MVP.
- The novice learning MVP is publicly deployed; the Local Guard and reporting
  productization candidate remains local and disabled.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
