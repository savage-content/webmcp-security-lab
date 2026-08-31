# Verification report

**Report date:** 2026-08-31  
**Scope:** version 1.0 guided heads-up and verified-fix milestone (local, not yet deployed)

This report separates verified behavior, honest unsupported states, and work that requires an external client or publishing account.

## Verified locally

| Check | Result | Evidence |
|---|---|---|
| TypeScript contracts | Pass | `npx tsc --noEmit` |
| Automated unit tests | Pass | 22 tests across 4 files |
| Production build | Pass | Vinext generated `/` and `/api/evidence` |
| D1 local adapter | Pass | `/api/evidence` returned a scoped empty ledger and initialized schema/indexes |
| Scenario catalog | Pass | Five unique declarations with validated default arguments |
| Read-only mismatch | Pass | Test proves `reviewed: false → true` while `readOnlyHint` is true |
| Over-broad schema | Pass | Vulnerable validator accepts hidden authority; secure validator rejects it |
| Result injection | Pass | State remains unchanged; raw controlled instruction text is preserved |
| Confirmation mismatch | Pass | Test proves `subscribed: true → false` under preview-only copy |
| Client variance | Pass | Result keeps `universal_support_verified: false` |
| Registration truth regression | Pass | Registration is attempted even when advisory policy enumeration reports blocked |
| Shared awareness rules | Pass | `WMC-001` through `WMC-005` map every fixture to a calm allow/warn/ask decision |
| Secure builder retests | Pass | All five narrowed contracts return `PASS`; the read-only variant preserves byte-identical state |

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
| Discovery without execution | Pass | `getTools()` changed discovery to `discovered` while invocation remained `not invoked` |
| Genuine WebMCP invocation | Pass | ChatGPT in-app Browser discovered and called `check_training_eligibility`; receipt channel was `webmcp` |
| Visible mismatch | Pass | Genuine call changed `reviewed: false → true` and incremented the counter despite `readOnlyHint: true` |
| Builder verification | Pass | Secure retest rendered `PASS`, persisted a distinct receipt, and updated the journey state |
| Responsive heads-up | Pass | 390 × 844 viewport had no horizontal overflow and retained the heads-up surface |

## WebMCP client status

- The source feature-detects only `document.modelContext`; it does not use `navigator.modelContext`.
- The selected tool is registered with `registerTool(tool, { signal })` and unregistered by aborting the signal.
- The in-page “Discover & invoke” path is enabled only when registration succeeds and the browser exposes `getTools()` plus `executeTool()`.
- The fallback harness is separately labeled and is not counted as WebMCP discovery.
- The previously deployed build treated `document.permissionsPolicy.allowsFeature('tools') === false` as authoritative and returned before calling `registerTool()`. The live host sent no `Permissions-Policy: tools=()` header, so that client-side early return manufactured the observed denial and guaranteed zero tools.
- Version 1.0 removes the early return. When `document.modelContext` exists it always attempts `registerTool()`. A resolved call records `registered` and `allowed`; only a real `NotAllowedError` records policy denial.
- In the ChatGPT in-app Browser against the local version 1.0 preview, the browser listed `check_training_eligibility` with the expected schema and annotations, then successfully invoked it. Changing to Scenario 02 replaced the available page tool with `update_short_notice`.
- This successful local result does not claim that the still-deployed older URL is fixed. Production verification must be repeated after the user publishes this validated source.
- No other external browser agent is certified by this report. Production judges should record the exact browser/client/version they test.

Chrome’s documentation describes WebMCP as experimental, available through an origin trial and a local testing flag. Client behavior remains time-sensitive: <https://developer.chrome.com/docs/ai/webmcp>.

## Publishing checklist

| Item | Status |
|---|---|
| Public GitHub repository | Public target confirmed; version 1.0 source is locally validated and awaits user-authorized publication |
| Production live URL | Existing version remains deployed at <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>; version 1.0 deployment and post-deploy WebMCP verification remain pending |
| MIT license | Complete |
| Threat model and safety statement | Complete |
| Deployment configuration and D1 migrations | Complete |
| Public YouTube demo under three minutes | Script complete; recording/upload remains a human publishing step |

## Known limitations

- WebMCP is experimental and unavailable in many ordinary browsers.
- Page JavaScript cannot reliably observe every browser-agent confirmation UX, so external calls record confirmation as unknown.
- Native file-download UX for JSON receipts and policy artifacts still requires a final check in the exact judging browser after publication.
- No claim is made about declarative forms, cross-origin iframe discovery, or any client not directly tested.
- Public rate limiting is deferred to the hosting layer; stored content is synthetic and session-isolated.
