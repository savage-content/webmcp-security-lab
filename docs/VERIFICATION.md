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

| Check | Result | Evidence |
|---|---|---|
| Switch among all five fixtures | Pass | Each fixture rendered its unique presented and declared surfaces |
| Explicit confirmation flow | Pass | All five dialogs displayed scenario-specific approval copy and action labels |
| Visible state transitions | Pass | Scenario 01 set `reviewed: true`; Scenario 04 changed the subscription indicator to Off |
| Append-only receipts | Pass | Five unique receipts appeared in the D1-backed ledger |
| Reload persistence | Pass | The same browser session reloaded with all five receipts intact |
| JSON export control | Limited by client | The control is present and builds a typed JSON blob; the Codex in-app Browser did not surface a native download event |
| Desktop layout | Pass | `docs/assets/landing.png` and `docs/assets/evidence.png` |
| Narrow layout | Pass | 390 × 844 viewport, no horizontal overflow; `docs/assets/mobile.png` |
| Browser console | Pass | A clean page load reported no warnings or errors |

## WebMCP client status

- The source feature-detects only `document.modelContext`; it does not use `navigator.modelContext`.
- The selected tool is registered with `registerTool(tool, { signal })` and unregistered by aborting the signal.
- The in-page “Discover & invoke” path is enabled only when registration succeeds and the browser exposes `getTools()` plus `executeTool()`.
- The fallback harness is separately labeled and is not counted as WebMCP discovery.
- In the Codex in-app Browser (Chromium 151), `document.modelContext` was exposed to page code, but the tools permissions policy blocked registration. The page correctly reported `registration: denied`, `policy: blocked`, and `discovery: not-checked`; the browser client found no callable page tool.
- No other external browser agent is certified by this report. Production judges should record the exact browser/client/version they test.

Chrome’s documentation describes WebMCP as experimental, available through an origin trial and a local testing flag. Client behavior remains time-sensitive: <https://developer.chrome.com/docs/ai/webmcp>.

## Publishing checklist

| Item | Status |
|---|---|
| Public GitHub repository | Public target confirmed; exact validated source is published on `main` |
| Production live URL | Deployed and verified at <https://left-out-webmcp-security-lab.taitfor.chatgpt.site> |
| MIT license | Complete |
| Threat model and safety statement | Complete |
| Deployment configuration and D1 migrations | Complete |
| Public YouTube demo under three minutes | Script complete; recording/upload remains a human publishing step |

## Known limitations

- WebMCP is experimental and unavailable in many ordinary browsers.
- Page JavaScript cannot reliably observe every browser-agent confirmation UX, so external calls record confirmation as unknown.
- The Codex in-app Browser did not expose its native file-download event for the JSON export during this run; verify the save dialog in the exact judging browser.
- No claim is made about declarative forms, cross-origin iframe discovery, or any client not directly tested.
- Public rate limiting is deferred to the hosting layer; stored content is synthetic and session-isolated.
