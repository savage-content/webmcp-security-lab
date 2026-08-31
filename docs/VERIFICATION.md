# Verification report

**Report date:** 2026-08-31  
**Scope:** contest-ready first version

This report separates verified behavior, honest unsupported states, and work that requires an external client or publishing account.

## Verified locally

| Check | Result | Evidence |
|---|---|---|
| TypeScript contracts | Pass | `npx tsc --noEmit` |
| Automated scenario/evidence tests | Pass | 10 tests across 2 files |
| Production build | Pass | Vinext generated `/` and `/api/evidence` |
| D1 local adapter | Pass | `/api/evidence` returned a scoped empty ledger and initialized schema/indexes |
| Scenario catalog | Pass | Five unique declarations with validated default arguments |
| Read-only mismatch | Pass | Test proves `reviewed: false → true` while `readOnlyHint` is true |
| Over-broad schema | Pass | Vulnerable validator accepts hidden authority; secure validator rejects it |
| Result injection | Pass | State remains unchanged; raw controlled instruction text is preserved |
| Confirmation mismatch | Pass | Test proves `subscribed: true → false` under preview-only copy |
| Client variance | Pass | Result keeps `universal_support_verified: false` |

## Browser-interface checks

Browser interaction results and screenshots are added after the final UI pass. The required checks are:

1. switch among all five fixtures;
2. open each confirmation and run through the explicit harness;
3. confirm visible state transitions;
4. confirm a receipt appears and downloads;
5. reload and confirm the session ledger remains in D1; and
6. inspect responsive behavior at desktop and narrow widths.

## WebMCP client status

- The source feature-detects only `document.modelContext`; it does not use `navigator.modelContext`.
- The selected tool is registered with `registerTool(tool, { signal })` and unregistered by aborting the signal.
- The in-page “Discover & invoke” path is enabled only when registration succeeds and the browser exposes `getTools()` plus `executeTool()`.
- The fallback harness is separately labeled and is not counted as WebMCP discovery.
- A specific external browser agent has not yet been certified in this report. Production judges should record the exact browser/client/version they test.

Chrome’s documentation describes WebMCP as experimental, available through an origin trial and a local testing flag. Client behavior remains time-sensitive: <https://developer.chrome.com/docs/ai/webmcp>.

## Publishing checklist

| Item | Status |
|---|---|
| Public GitHub repository | Target repository confirmed public; source publication pending final verification |
| Public live URL | Pending deployment |
| MIT license | Complete |
| Threat model and safety statement | Complete |
| Deployment configuration and D1 migrations | Complete |
| Public YouTube demo under three minutes | Script complete; recording/upload remains a human publishing step |

## Known limitations

- WebMCP is experimental and unavailable in many ordinary browsers.
- Page JavaScript cannot reliably observe every browser-agent confirmation UX, so external calls record confirmation as unknown.
- No claim is made about declarative forms, cross-origin iframe discovery, or any client not directly tested.
- Public rate limiting is deferred to the hosting layer; stored content is synthetic and session-isolated.
