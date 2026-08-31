# Threat model and safety analysis

## Scope

This model covers the public web application, its page-scoped WebMCP registrations, synthetic scenario state, evidence API, and D1 ledger.

## Assets

- integrity of the scenario declarations and handlers;
- fidelity of before/after evidence;
- append-only receipt history;
- honest reporting of browser/client support; and
- the safety boundary that prevents real-world effects.

There are intentionally no credentials, real identities, production accounts, or third-party action tokens.

## Actors

- a learner or judge using the visible interface;
- a WebMCP-aware browser agent or same-origin in-page client;
- a visitor who sends malformed or oversized API input; and
- a contributor adding or modifying a fixture.

## Threats and controls

| Threat | Impact | Control |
|---|---|---|
| Misleading tool metadata | Agent underestimates effect | Before/after evidence, explicit side-effect list, failing verdict |
| Over-broad arguments | Handler receives authority absent from UI | Bounded fixture validator; secure comparison uses narrow schema |
| Prompt injection in result | Agent treats returned text as authority | Controlled fixed payload, raw-result display, `untrustedContentHint` comparison, no automatic follow-on action |
| Misleading confirmation | Human approves a different effect | Confirmation copy stored verbatim beside actual state transition |
| Client-support overclaim | Judges mistake registration for discovery | Separate registration, policy, and discovery states; unavailable is reported honestly |
| Receipt overwrite | Evidence is rewritten after a run | Primary-key insert only; no update/delete endpoint |
| Cross-session ledger leakage | One visitor sees another visitor’s inputs | D1 queries partitioned by random lab-session UUID |
| Oversized receipt spam | Storage or parsing pressure | 128 KiB request limit plus Zod validation and bounded fixture strings |
| Real-world side effect | Educational fixture causes harm | No credentials or external integrations; handlers mutate generated in-memory state only |
| Ordinary automation mislabeled WebMCP | False contest claim | Fallback explicitly says “lab harness”; only `document.modelContext` status is called WebMCP |

## Deliberate vulnerabilities versus platform vulnerabilities

The fixture mismatches are intentional application-design failures. The lab does not claim that WebMCP itself bypasses permissions or causes these mistakes. It demonstrates that descriptions, annotations, confirmation copy, schemas, client discovery, and handler behavior are separate security-relevant facts.

## Residual risks

- A hostile public visitor can create many small, valid receipts; production rate limiting is a hosting-level follow-up.
- Browser support is experimental and may change after this report.
- A browser-managed confirmation is not always observable to page JavaScript. The receipt records the unknown state rather than inferring approval.
- Device-local session ids are isolation labels, not authentication. The ledger stores synthetic educational data only.

## Out of scope

- testing third-party websites without authorization;
- credential or token handling;
- agent prompt-hardening outside the controlled result fixture;
- production authorization models; and
- claims about clients that were not directly tested.
