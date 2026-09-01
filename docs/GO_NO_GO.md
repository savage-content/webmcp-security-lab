# MVP Publish-Readiness Decision

**Decision date:** 2026-09-01

**Branch:** `codex/capability-negotiator`

**Technical MVP decision:** **GO for a locally validated release candidate and
bounded Scenario 1 demonstration through the tested external-Chrome, unpacked-
extension, and loopback-connector path.**

**Public-release decision:** **NO-GO for deploying this working tree, publishing
the extension to a store, claiming Android device integration, or claiming
universal browser or client compatibility.** The already-public frozen version
1 demo remains unchanged.

**Prior-art claim decision:** **NO-GO for novelty, patentability, clean-room, or
freedom-to-operate claims.** This independent technical prior-art conclusion is
separate from the technical MVP GO and is not a legal infringement opinion.

**Live-run provenance:** the successful session used the post-`f7290d9` page
and extension content in this working tree. The running connector came from
`f7290d9`; connector source is unchanged by the later UI and cross-realm
validation fixes. The successful session did not retain a fresh browser-version
readout, and the future final commit itself was not the artifact live-run.

## Component decision matrix

| Component or claim                                  | Status on 2026-09-01             | Evidence boundary                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen version 1 web demo                           | Published baseline, unchanged    | The existing public URL is not the capability-negotiator release candidate and is not evidence that this working tree was deployed.                                                                                                                                                                                                 |
| Scenario 1 page capability                          | **PASS, local target session**   | One fresh generated zero-input capability for synthetic `TRAINING-1042` was invoked exactly once with no retry. Receipt `d421aaaf-262d-4fbe-81ab-e93acb5efce9` records byte-identical before/after state, state hash `21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`, zero side effects, and consumed authority. |
| Extension-to-connector receipt path                 | **PASS, tested path**            | The external Chrome page, unpacked extension, and loopback connector completed the return path. The connector validated and appended the receipt before acknowledgement; the JSONL ledger, list view, detail summary, and receipt dashboard agreed on the receipt and hashes.                                                       |
| Browser extension                                   | **Validated unpacked prototype** | The tested Manifest V3 extension is development software: unpacked, unsigned, and not a Chrome Web Store release. The result applies only to the tested top-level selected-tab `MAIN`-world path.                                                                                                                                   |
| Automated web/connector verification                | **PASS**                         | After the cross-realm result compatibility fix and approval-dialog UI fix, 123/123 tests, typecheck, lint, and the production build passed.                                                                                                                                                                                         |
| Android work                                        | **Conformance only**             | JVM/API conformance does not establish AppFunction metadata generation, device discovery, policy allowance, or invocation.                                                                                                                                                                                                          |
| Public deployment of this MVP                       | **Not performed**                | No public build or deployment of the working tree was performed; the frozen version 1 public site remains unchanged.                                                                                                                                                                                                                |
| Novelty, patentability, or freedom-to-operate claim | **NO-GO**                        | The technical prior-art review found substantial overlap. It supports no originality, patentability, clean-room, or freedom-to-operate clearance claim and is not a legal infringement opinion.                                                                                                                                     |

## Evidence supporting the technical MVP GO

- The public version 1 baseline is frozen at
  `21cff1267a467074dc3f5586584e4a6474190aa7`; the working slice remains
  isolated on `codex/capability-negotiator`.
- A disposable external Chrome profile loaded the unpacked extension, paired
  the active `http://localhost:3001/` document with the loopback connector, and
  discovered the page capability through the implemented top-level `MAIN`-
  world bridge.
- Human intent, the exact proposal, and exact approval produced a fresh,
  uniquely named, zero-input, one-use Scenario 1 capability bound to synthetic
  `TRAINING-1042`.
- The authorized run made exactly one call with no retry and invoked no other
  site capability. It returned receipt
  `d421aaaf-262d-4fbe-81ab-e93acb5efce9`.
- The receipt records identical before/after state with SHA-256
  `21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`,
  zero side effects, a `PASS` verdict, and consumed logical authority.
- The connector accepted success only after validating and appending the exact
  receipt. The receipt ID, contract links, receipt hash, ledger entry hash, and
  selection agreed across the invocation result, append-only JSONL ledger,
  `list_capability_receipts`, `get_capability_receipt_summary`, and the local
  dashboard.
- The generated authority was consumed once and was not retried. The broad
  proposal/source authority did not execute as part of the generated call.
- The cross-realm result validator and approval-dialog fixes are covered by the
  current automated suite. The post-fix working-tree source passed 123/123
  tests, typecheck, lint, and production build; this is separate from the
  earlier clean `f7290d9` candidate's 121-test gate.
- [PRIOR_ART.md](../PRIOR_ART.md) records the recoverable chronology, primary
  prior art, comparison limitations, and independent technical review. Its
  claim-level NO-GO remains in force and does not negate the bounded technical
  interoperability result.

## Limits of the GO

1. **It is target- and session-scoped.** The result establishes the tested
   external-Chrome, unpacked-extension, loopback-connector, page-origin, and
   document-session path. It is not evidence for other clients, browser
   versions, extension worlds, origins, tabs, reloads, or devices.
2. **The extension and connector remain development software.** The extension
   is unpacked and unsigned; the connector uses a loopback access-token and
   pairing design that is not a hosted-production security architecture.
3. **Authority is document-local.** Atomic one-use consumption is demonstrated
   in one JavaScript realm. Cross-tab coordination, reload recovery, hostile
   same-origin script, and process-crash recovery remain outside the guarantee.
4. **Source binding is descriptive.** SHA-256 binds declarations, origin, and
   declared handler-version labels; it does not attest executable bytes or a
   deployment artifact.
5. **The receipt is local evidence.** The validated JSONL ledger and dashboard
   establish the tested local connector path. They do not provide independent
   network observation, server-issued provenance, or durable hosted storage.
6. **Android remains a conformance prototype.** No Android extension is
   claimed, and no AppFunctions device discovery or invocation result is
   included in this decision.
7. **The prior-art NO-GO is unchanged.** No public or private release material
   may describe the work as novel, unique, first, invented, clean-room,
   patentable, or cleared for freedom to operate based on this technical test.

## Permitted next work

- Retain the successful local evidence bundle and use it for a bounded
  technical demonstration with the exact claim limits above.
- Anchor the final candidate to a clean commit and repeat `npm ci` followed by
  `npm run verify` with Node.js 24 before any later publication decision.
- Test Chrome 153-or-later, result serialization/string boundaries,
  Permissions Policy and origin isolation, duplicate registration ownership,
  document destruction, navigation, and BFCache behavior as separate
  compatibility claims.
- Build a signed-extension distribution and production connector threat model
  only under a separate release review.
- Validate Android AppFunctions metadata, device discovery, policy allowance,
  and invocation on an actual supported device before making an Android
  integration claim.
- If public deployment is later proposed, validate the exact deployed artifact
  and origin separately. Do not use the frozen version 1 URL as that proof.

This record does not authorize public deployment, store publication, Android
integration claims, universal compatibility claims, pricing, transaction
infrastructure, new public offers, or novelty/patent/freedom-to-operate claims.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
