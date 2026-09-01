# MVP Publish-Readiness Decision

**Decision date:** 2026-09-01

**Branch:** `codex/capability-negotiator`

**Decision:** **NO-GO for publishing the current working tree as a validated
MVP, public deployment, demo recording, or contest submission.**

**Permitted next state:** continued local review and a fresh, approved
connector end-to-end retest.

This decision does not withdraw the already-public frozen version 1 demo. The
public URL in the README serves that earlier baseline, not the capability
negotiator, connector, unpacked extension, or Android conformance work covered
here.

## Component decision matrix

| Component or claim                                  | Status on 2026-09-01               | Evidence boundary                                                                                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen version 1 web demo                           | Published baseline                 | The existing public URL is not evidence that this working MVP was deployed.                                                                                                                                                                   |
| Scenario 1 page capability                          | **PASS, local only**               | Two live page invocations produced `PASS` receipts, most recently `fe3d952f-db38-463c-9023-3d36f51bf863`. Each records only its bounded page-side invocation, not connector delivery.                                                            |
| Connector receipt path                              | **FAIL; fresh retest required**    | Both page receipts failed to complete the extension/bridge return path. The latest Chrome 152 rejection is consistent with an in-flight registration abort, but the cause lacks a retained browser trace; the compatibility shim is not yet live-validated. |
| Browser extension                                   | **Unpacked development prototype** | Manifest V3 versions `0.1.1` and `0.1.3` carried the two failed attempts. Version `0.1.3` remains unpacked and unsigned; neither is a signed package or Chrome Web Store release.                                                               |
| Android work                                        | **Conformance only**               | The JVM core and API-36 boundary compile checks do not establish AppFunction metadata generation, device discovery, policy allowance, or invocation.                                                                                          |
| Public deployment of this MVP                       | **Not performed**                  | No public build or deployment of the current working tree has been validated.                                                                                                                                                                 |
| Novelty, patentability, or freedom-to-operate claim | **NO-GO**                          | The technical prior-art review found substantial overlap. It supports no originality, patentability, or freedom-to-operate clearance claim and is not a legal infringement opinion.                                                           |

## Evidence that is complete

- The public version 1 baseline is frozen at
  `21cff1267a467074dc3f5586584e4a6474190aa7`; the working slice remains
  isolated on its own branch.
- [PRIOR_ART.md](../PRIOR_ART.md) records the recoverable chronology, primary
  prior art, comparison limitations, and the independent technical review's
  NO-GO claim boundary.
- Scenario 1 implements the page-session lifecycle: lock intent, inspect,
  propose, approve, revalidate, withdraw broad authority, register a unique
  no-input capability, atomically consume logical authority once, verify and
  return from the page callback, then schedule retirement of the inert
  registration after a 50 ms Chrome 152 compatibility delay. The timer does
  not observe or prove browser/client delivery.
- Earlier direct target-client runs demonstrated source and proposal
  withdrawal, cached-handle replay rejection, fresh-discovery removal,
  source-drift invalidation, and timed expiry. Those bounded observations are
  retained in [TARGET_CLIENT_VALIDATION.md](TARGET_CLIENT_VALIDATION.md). The
  immediate-disappearance observation predates the deferred-retirement
  compatibility candidate.
- Two connector attempts reached the page callback and produced page-side
  `PASS` receipts. Neither completed the connector receipt path. The latest
  no-retry run used tool
  `get_training_1042_eligibility_once_188cba7cc04e98ac` and preserved the
  exact state hash
  `21269d7ff6b8067868112955cc7b8301bf74a7d165cd109ecd336260bc8bd481`.
- Hardened extension `0.1.3` was loaded in the disposable Chrome profile and
  paired the fresh `http://localhost:3001/` document to isolated bridge port
  `48788`. The connector reported one connected session and a valid empty
  receipt chain before invocation. The one authorized call was consumed
  without retry; the extension observed Chrome 152 reject before persistence,
  so the connector ledger remained empty. An in-flight registration abort is
  the leading hypothesis, not proven causality for this run.

## Why the decision remains NO-GO

1. **Connector end-to-end evidence failed twice.** A page-side `PASS` is not a
   connector `PASS`. Receipt delivery, validation, append, acknowledgement,
   dashboard visibility, and MCP summary must succeed in one fresh run.
2. **The one-use grant was consumed.** Retesting must start from a new page
   session or clean reload and a new locked intent, proposal, exact approval,
   and generated capability. The consumed tool must not be retried.
3. **There is no current public deployment evidence.** Hosting configuration
   and a successful local production build do not prove deployment or the
   behavior of a deployed origin.
4. **The release is not anchored yet.** Final verification must be tied to a
   clean commit containing the connector, extension, Android conformance,
   tests, documentation, and lockfile used for the run.
5. **The authority remains document-local.** Consumption is atomic only in
   one JavaScript realm. Reload, another tab, another client, hostile
   same-origin script, and process-level crash recovery remain outside the
   demonstrated guarantee.
6. **The source binding remains descriptive.** SHA-256 covers declarations,
   origin, and declared handler-version labels; it does not attest executable
   bytes or a deployment.
7. **Prior art prohibits release claims of originality or legal clearance.**
   The review is complete, but its outcome is a NO-GO for novelty,
   patentability, clean-room, or freedom-to-operate claims. It does not
   conclude that the project infringes any right.
8. **Exact-target-build conformance is incomplete.** Mocked lifecycle tests do
   not establish the selected Chrome target's result wire handling or the
   implemented extension-world behavior. Chrome 153 and the wider lifecycle,
   permission, and origin matrix remain separate gates for any broader browser
   compatibility claim; they are not substitutes for the required target run.

## Required evidence before another decision

- Start a fresh document session and complete a new intent, proposal, exact
  approval, and uniquely named one-use capability.
- Pin and retain the exact target Chrome build. Verify that the logical gate
  rejects replay while registration is inert, preserve the raw external result
  or rejection, and confirm fresh discovery after retirement.
- Verify the implemented selected-tab, top-level `MAIN`-world extension path.
  Do not claim isolated-world ModelContext or CDP/`chrome.debugger` access; the
  extension intentionally has no `debugger` permission.
- Invoke it through the unpacked extension and connector.
- Confirm that the MCP invocation returns success only after the connector
  validates and appends the exact receipt.
- Confirm the same receipt ID and hashes through the JSONL ledger, receipt
  dashboard, `list_capability_receipts`, and
  `get_capability_receipt_summary`.
- Record the exact browser/client version, page origin, extension version,
  connector commit, UTC timestamp, full receipt ID, and any observed console
  or transport errors.
- Run `npm ci` and `npm run verify` with Node.js 24 or newer against the final
  candidate, then capture the clean commit and diff status.
- Before making any broader browser or cross-version compatibility claim,
  separately verify Chrome 153-or-later, circular-result rejection and the
  string/`DOMString` boundary, Permissions Policy and origin isolation,
  duplicate/stale-signal ownership, document destruction, navigation, and
  BFCache suspension/restoration. Those claims remain out of scope for a
  target-client-only MVP decision.
- If public deployment is later proposed, validate that exact deployed build
  and origin separately. Do not treat the frozen version 1 URL as this proof.
- Keep all public copy within the claim boundary in `PRIOR_ART.md`.

Extension, connector, reporting, and Android conformance work may continue
locally. This record authorizes no public deployment, store publication,
Android integration claim, demo recording, or contest submission.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
