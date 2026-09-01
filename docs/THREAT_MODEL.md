# Threat model and safety analysis

## Scope

This model covers the frozen-version-1 public web application, its page-scoped
WebMCP registrations, synthetic scenario state, evidence API, and D1 ledger. It
also covers the local capability connector and unpacked extension added in the
current working tree. The Android directory is an isolated conformance
prototype, not part of either runtime. The current MVP has not been publicly
deployed.

## Assets

- integrity of the scenario declarations and handlers;
- fidelity of before/after evidence;
- append-only receipt history;
- integrity of extension-to-connector receipt transport;
- connector pairing, bridge, and access tokens;
- binding of a paired extension to one selected top-level document;
- honest reporting of browser/client support; and
- the safety boundary that prevents real-world effects.

There are intentionally no credentials, real identities, production accounts, or third-party action tokens.

## Actors

- a learner or judge using the visible interface;
- a WebMCP-aware browser agent or same-origin in-page client;
- a visitor who sends malformed or oversized API input;
- a contributor adding or modifying a fixture;
- a local MCP client using the connector;
- the unpacked extension service worker and selected page; and
- malware or another process already controlling the same local machine or
  browser profile.

## Threats and controls

| Threat                                                       | Impact                                                                                      | Control                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Misleading tool metadata                                     | Agent underestimates effect                                                                 | Before/after evidence, explicit side-effect list, failing verdict; annotations are advisory metadata, not enforcement                                                                                  |
| Over-broad arguments                                         | Handler receives authority absent from UI                                                   | Bounded fixture validator; secure comparison uses narrow schema                                                                                                                                        |
| Prompt injection in result                                   | Agent treats returned text as authority                                                     | Controlled fixed payload, raw-result display, `untrustedContentHint` comparison, no automatic follow-on action                                                                                         |
| Misleading confirmation                                      | Human approves a different effect                                                           | Confirmation copy stored verbatim beside actual state transition                                                                                                                                       |
| Client-support overclaim                                     | Judges mistake registration for discovery                                                   | Separate registration, policy, and discovery states; unavailable is reported honestly                                                                                                                  |
| Receipt overwrite                                            | Evidence is rewritten after a run                                                           | Primary-key insert only; no update/delete endpoint                                                                                                                                                     |
| Cross-session ledger leakage                                 | One visitor sees another visitor’s inputs                                                   | D1 queries partitioned by random lab-session UUID                                                                                                                                                      |
| Oversized receipt spam                                       | Storage or parsing pressure                                                                 | 128 KiB request limit plus Zod validation and bounded fixture strings                                                                                                                                  |
| Real-world side effect                                       | Educational fixture causes harm                                                             | No credentials or external integrations; handlers mutate generated in-memory state only                                                                                                                |
| Ordinary automation mislabeled WebMCP                        | False contest claim                                                                         | Fallback explicitly says “lab harness”; only `document.modelContext` status is called WebMCP                                                                                                           |
| Page success mislabeled connector success                    | A consumed grant appears durably reported when its receipt was lost                         | Connector success requires validated append before acknowledgement; page and connector statuses are documented separately                                                                              |
| Receipt substitution or instruction-shaped metadata          | A page influences model behavior or corrupts the report                                     | Exact session/origin/tool binding, bounded schemas, fixed error messages, and model-visible summaries that omit raw page-controlled text                                                               |
| Lost connector acknowledgement                               | Duplicate or ambiguous reporting                                                            | Exact idempotent completion may be retried while the local process remains alive; no crash-atomic or cross-process guarantee is claimed                                                                |
| Extension authority widens silently                          | An unrelated page or broad tool becomes invokable                                           | `activeTab`, exact loopback host permissions, top-level document binding, fixed generated-tool-name pattern, and empty arguments only                                                                  |
| Browser lifecycle leaves stale discovery                     | A destroyed, navigated, or BFCache-suspended document appears to retain usable authority    | Treat logical invalidation and physical discovery as separate facts; require fresh exact-build discovery across destruction, navigation, suspension, and restoration; do not rely only on `toolchange` |
| Browser result serialization changes or coerces types        | Connector accepts malformed, substituted, or ambiguous evidence                             | Preserve the raw platform value, parse the current string result strictly, validate the complete receipt, and reject serialization or schema failure                                                   |
| Privileged adapter path expands authority                    | An extension or debugger path bypasses the documented page/connector boundary               | Current extension injects only into the selected top-level `MAIN` world and has no `debugger` permission; isolated-world and CDP adapters require separate review and exact-build evidence             |
| Declarative form-tool sandbox gap is generalized to this lab | An upstream declarative vulnerability is mislabeled as a demonstrated imperative-lab result | Declarative forms and cross-frame discovery are out of scope; Chromium issue 526451590 remains an upstream residual risk, not a local finding or PASS                                                  |
| Loopback or browser profile compromise                       | Local attacker captures development tokens or tampers with the prototype                    | Explicit local-development boundary; no production authentication claim; restart invalidates connector state                                                                                           |
| Android conformance mislabeled integration                   | JVM tests are represented as device/AppFunction support                                     | No generated metadata or device discovery claim; Android remains isolated and conformance-only                                                                                                         |

## Deliberate vulnerabilities versus platform vulnerabilities

The fixture mismatches are intentional application-design failures. The lab does not claim that WebMCP itself bypasses permissions or causes these mistakes. It demonstrates that descriptions, annotations, confirmation copy, schemas, client discovery, and handler behavior are separate security-relevant facts.

## Residual risks

- A hostile public visitor can create many small, valid receipts; production rate limiting is a hosting-level follow-up.
- Browser support is experimental and may change after this report.
- Browser-managed actor-stack interaction is not relied on. Chromium issue
  [535256664](https://issues.chromium.org/issues/535256664/resources) remains
  open, so approval evidence is explicitly page-local and does not prove which
  external agent or actor stack caused invocation.
- Chromium issue
  [508285989](https://issues.chromium.org/issues/508285989) records missing
  `toolchange` on document destruction. BFCache behavior and stale descriptors
  remain exact-build conformance risks even when logical authority is already
  closed.
- Chromium issue
  [526451590](https://issues.chromium.org/issues/526451590) records a
  declarative tool sandbox gap. This imperative lab neither exercises nor
  mitigates that platform path.
- The current WebMCP result contract is string-based, and platform handling of
  unserializable results has changed. Connector evidence depends on strict JSON
  parsing and validation, not on browser type preservation.
- A browser-managed confirmation is not always observable to page JavaScript. The receipt records the unknown state rather than inferring approval.
- Device-local session ids are isolation labels, not authentication. The ledger stores synthetic educational data only.
- The connector's local JSONL chain detects retained-file edits, reordering,
  duplication, and gaps, but it is not signed, externally anchored,
  deletion-resistant, or crash-atomic.
- The unpacked extension and loopback connector assume the local machine and
  browser profile are not already compromised.
- Two earlier 2026-09-01 page invocations produced local `PASS` receipts but
  failed before connector commitment. An in-flight Chrome 152 registration
  abort remains the leading hypothesis for the later failure, not proven
  causality from a retained browser trace. A subsequent fresh no-retry run
  completed the extension, connector, JSONL ledger, MCP summaries, and local
  dashboard path with byte-identical state, zero side effects, and consumed
  authority. That single-session `PASS` validates the compatibility path only
  for the observed build; Chrome 153-or-later, other clients, navigation,
  BFCache, and crash-recovery behavior still require separate exact-build runs.

## Out of scope

- testing third-party websites without authorization;
- credential or token handling;
- agent prompt-hardening outside the controlled result fixture;
- production authorization models;
- claims about clients that were not directly tested;
- declarative WebMCP forms, cross-origin iframe discovery, and remediation of
  browser-engine vulnerabilities;
- isolated-world ModelContext or Chrome DevTools Protocol adapters;
- signed-extension packaging or Chrome Web Store distribution;
- hosted connector authentication or multi-user isolation; and
- Android device discovery, policy allowance, and AppFunction invocation.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
