# Recording and Submission Decision

**Decision date:** 2026-09-01
**Branch:** `codex/capability-negotiator`
**Decision:** **NO-GO for recording, deployment, or submission.**
**Permitted next state:** continued local review and target-client testing only.

## What is complete

- The public v1 baseline is frozen at `21cff1267a467074dc3f5586584e4a6474190aa7`; the working slice is isolated on its own branch.
- [PRIOR_ART.md](../PRIOR_ART.md) records the recoverable source history, project chronology, primary prior art, exact-code/wording comparison, unsupported claim boundary, and audit limitations.
- Scenario 1 implements the full page-session path: lock intent → inspect → negotiate → approve → revalidate → withdraw broad source → dynamically register a unique no-input capability → invoke once → verify the required result and controlled state invariants → invalidate on consumption, expiry, or drift.
- Broad source and proposal callbacks have synchronous revocation gates in addition to registration aborts, so cached JavaScript handles fail after withdrawal.
- A monotonic same-document lease transitions from active to consumed before the callback’s first `await`.
- The current capability-handler path contains no `fetch`. It produces one hash- and schema-validated, local-export-only receipt linking proposal, exact approval, source binding, full generated declaration, invocation, before/after state, verification, and invalidation. This is code-path evidence, not browser egress isolation.
- The ordinary evidence endpoint rejects receipts that retain negotiated-capability markers. It cannot detect a caller that removes and relabels all client-controlled markers; trusted provenance would require a server-issued or signature-bound envelope.
- `npm run lint`, all 45 tests, and `npm run build` pass locally.

## Why the decision is still NO-GO

1. **Prior art is substantial.** Capability compilation, attenuation, exact hash-bound approval, one-use TTL grants, lifecycle/origin binding, drift controls, and effect verification all exist separately in earlier work. Only the complete WebMCP-native composition remains a possible distinction, and it needs independent review.
2. **No target-client proof exists for this branch.** Deterministic tests and a production build do not prove the live register/withdraw/discover/invoke sequence in the intended WebMCP client.
3. **The authority is document-local.** Consumption is atomic only in one JavaScript realm. Reload, another tab, another client, or hostile same-origin script is outside the guarantee.
4. **The source binding is descriptive.** SHA-256 covers the declaration, origin, and declared handler-version label; it is not executable-byte or deployment attestation.
5. **The evidence is local.** The exportable receipt is deliberately not persisted during the handler. The current path contains no `fetch`, but it provides no browser-level egress isolation, server-atomic evidence, or independent attestation.
6. **No general equivalence claim is justified.** The verifier confirms one fixed synthetic eligibility result and byte-identical controlled state only.

## Required evidence before another go/no-go review

- An independent reviewer validates the prior-art matrix and narrowed comparison statement.
- A target WebMCP client visibly proves that approval removes both broad and proposal tools, exposes only the unique no-input tool, permits exactly one call, and rejects cached or repeated handles.
- A controlled clock test demonstrates expiry in the live client, and a separate run demonstrates source-declaration drift invalidation.
- Browser console, narrow-layout, and accessibility checks pass for the new UI.
- The recorded narration uses only the claim boundaries in this document and `PRIOR_ART.md`.
- Final commit/diff timestamps are captured without rewriting the provenance record.

No extension work should begin and no deployment, demo recording, or contest submission should occur until those gates are closed and this decision is replaced by a dated GO record.
