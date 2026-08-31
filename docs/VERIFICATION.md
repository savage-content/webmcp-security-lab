# Verification report

**Report date:** 2026-08-31  
**Scope:** version 1.0.2 local release gate and focused in-app browser verification

This report separates deterministic code evidence, browser-observed behavior, and claims that remain outside the observed client and session.

## Clean release gate

| Check | Result | Evidence |
|---|---|---|
| Runtime | Pass | Node.js 24.19.0 |
| Dependency install | Pass | `npm ci` completed from the committed lockfile |
| Automated tests | Pass | 38 tests across 5 files |
| TypeScript | Pass | `npx tsc --noEmit` |
| Lint | Pass | `npm run lint` |
| Production build | Pass | Vinext generated `/` and `/api/evidence` |
| Scenario catalog | Pass | Five unique declarations; vulnerable and secure defaults validate |
| Receipt compatibility | Pass | Older receipts default missing WebMCP invocation state to `not-observed` |

## Evidence-integrity checks

| Scenario | Secure invariant evidence |
|---|---|
| 01 — Read-only claim | `PASS` requires a truthfully named read-only declaration, byte-identical before/after state, and zero side effects. |
| 02 — Over-broad schema | `PASS` requires one bounded 80-character `notice`, rejects hidden and unknown fields, and constrains changes to the profile banner. |
| 03 — Result injection | `PASS` requires `untrustedContentHint: true`, isolated carrier text, unchanged state, and no follow-on effect. |
| 04 — Confirmation mismatch | `PASS` requires a truthfully named mutation, `readOnlyHint: false`, exact affirmative On-to-Off approval, and a result matching applied state. Negated or vague approval fails. |
| 05 — Client variance | `PASS` requires a dated named-client observation, independently records API support, registration, policy, discovery, and invocation, and contains no universal-support claim. |

The scenario engine derives each verdict from those invariants. Choosing a secure fixture does not mechanically assign `PASS`.

## Focused browser verification

| Check | Result | Evidence |
|---|---|---|
| Local registration | Pass | `document.modelContext` registered the selected page tool and kept registration separate from discovery and invocation. |
| Fallback truthfulness | Pass | A confirmed fallback run produced a `lab-harness` receipt and visible state change while WebMCP invocation remained `not-observed`. |
| Scenario 04 approval | Pass | The UI displayed the exact Security lab digest On-to-Off write before the retest; receipt `73051546…` returned `PASS`. |
| Scenario 05 stages | Pass | The UI rendered five separate support rows and removed agent-supplied `discovered` authority from the secure schema. |
| Scenario 05 client scope | Pass | The retest named the observed Chromium client; receipt `04ba244a…` returned `PASS`. |
| Secure result treatment | Pass | Only invariant-backed results receive green success treatment; failed retests use warning treatment and cannot activate “Fix verified.” |
| Browser console | Pass | No warning or error was observed; development-only Vite and React informational messages were present. |
| Narrow layout | Pass | A 390 × 844 live check showed no horizontal overflow or clipped interactive controls. |

## WebMCP observation rules

- Only `document.modelContext` is feature-detected.
- Registration is attempted even when advisory policy enumeration is ambiguous.
- A resolved `registerTool()` proves registration for this document; a real `NotAllowedError` records policy denial.
- Discovery alone never counts as invocation.
- Only the registered WebMCP callback marks invocation `observed`; the fallback harness does not.
- Capability evidence is scoped to the named browser, client, session, and observation time. No other client is inferred or certified.

## Known limitations

- WebMCP remains unavailable in many ordinary browsers and clients.
- Page JavaScript cannot reliably observe every external browser-agent confirmation surface, so external calls may record confirmation as unknown.
- Native download UX must be checked in the exact target browser; the app always exposes selectable JSON and clipboard copy as an honest fallback.
- No claim is made about declarative forms, cross-origin iframe discovery, or a client not directly observed.
- Public rate limiting remains a hosting-layer concern; stored content is synthetic and session-isolated.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
