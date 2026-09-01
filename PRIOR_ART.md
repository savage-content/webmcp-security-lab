# Prior-Art and Provenance Audit

**Audit window (America/Chicago):** 2026-08-31–2026-09-01
**Audited baseline:** `21cff1267a467074dc3f5586584e4a6474190aa7`
**Working branch:** `codex/capability-negotiator`

## Status and claim boundary

This repository is not ready for a novelty claim or contest submission. The reviewed sources contain conceptual overlap with each individual control now under consideration: least-privilege capability compilation, exact hash-bound approval, one-use and expiring authority, origin and registration binding, lifecycle invalidation, and postcondition verification.

The only narrow statement supported by this scoped audit is:

> In the finite set of primary sources and search results reviewed during this scoped audit ending September 1, 2026, the audit did not identify an example combining a non-effecting WebMCP proposal, exact human approval, replacement of a broad source tool with a newly registered no-input single-use WebMCP tool, source/origin/build binding, automatic invalidation on use/expiry/drift, and one linked receipt recording the required result and controlled checks for prohibited effects.

That statement is a search result, not a claim of invention, priority, legal clearance, or being “first.” It must be revisited if the implementation does not actually remove the broad source tool or if additional prior art is found.

## Recoverable project chronology

| Time (UTC unless otherwise stated)                | Recoverable evidence                                                                                               | What it establishes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-30 20:44 UTC                              | Codex task `01a04aa2-9baa-74e3-9e76-7c612562d680`, “Inspect capability exchange site”                              | A prior internal note used the sequence “intent → bounded authority → execution → external observation → receipt → independent verification.” This is related background, not proof of the current design or public priority.                                                                                                                                                                                                                 |
| 2026-08-31 05:52:31 UTC (turn start)              | ChatGPT conversation `6a951674-72d4-83e9-a810-b000a59b0218`, assistant item `5025cbf4-5a38-579d-b9be-8081db732e97` | Earliest occurrence found in the audited histories of the three-surface taxonomy and “Effective Surface is the security truth.” The response describes the model as already decided, so its true origin is not recoverable.                                                                                                                                                                                                                   |
| 2026-08-31 10:51:46 UTC (turn start)              | Same conversation, assistant item `7528a08a-0bf6-5f0a-934c-88e450ea30a1`                                           | The assistant returned the exact fenced build brief later supplied to Codex; this records compilation of the brief, not authorship of its underlying ideas. After newline normalization it matches the 5,847-character attachment exactly. Windows filesystem metadata reports creation at 11:10:13 UTC, and the Codex turn containing it began at 11:10:41 UTC. SHA-256: `034BFD0BD7B905A42C23459B5FBB18F8FA94743C641A62D5AA8BE8CD3EDC822A`. |
| 2026-08-31 11:58:22 UTC                           | Earliest reachable commit across the audited refs (Sites root), `2c039165b543b7e7b6d527ea483e52c6cd774519`         | The README already contained all three surface names and “The Effective Surface is the security truth.”                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-31                                        | Commits `a6955`, `78d2f`, `d5c085`, `07653a`, `0e5e`, and local baseline `21cff`                                   | Iteration of the original five-scenario test range.                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-01 04:30:25 UTC (2026-08-31 23:30:25 CDT) | Creation of `codex/capability-negotiator`; audit work continued afterward                                          | Earliest recoverable repository work on the Capability Negotiator vertical slice. Neither “Capability Delta” nor “WebMCP Capability Negotiator” appears in earlier repository history.                                                                                                                                                                                                                                                        |

The three-surface model and five fixtures demonstrably predate this audit and the capability-negotiator branch. The earliest occurrence found in the audited histories of the exact phrase “Capability Delta” and working label “WebMCP Capability Negotiator” is ChatGPT assistant item `c8c94805-7bd8-4d89-b43c-864f5269ee88`, in a turn beginning at 2026-08-31 23:07:47 UTC; Scenario 2 in the earlier brief already embodied the broader idea of authority exceeding the visible task. The recoverable evidence does **not** show that these ideas predate the public projects below, several of which were published earlier. No public priority claim follows from this chronology.

Repository history has a provenance discontinuity. The earliest Sites-root commit is `2c039165…`; a separate GitHub root begins at `78d2f33…`; merge `4adea05…` joined them with the `ours` strategy. An older checkout retains guided-remediation commit `d0c2427…`, which is absent from the current object database. This explains current blame/history differences but proves neither copying nor authorship.

## Recoverable browsing and source history

The following histories were inspected where records remained available:

**Codex tasks**

- `01a05783-9d21-7d11-8732-a075272d36db` — “Build WebMCP security test range”
- `01a05809-99df-7313-bf50-db4432da78b0` — “Build WebMCP Safety Lab”
- `01a05849-646b-7352-939a-282fb9e20777` — “Publish WebMCP Security Lab v1”
- `01a04aa2-9baa-74e3-9e76-7c612562d680` — “Inspect capability exchange site”

**ChatGPT conversations**

- `6a951674-72d4-83e9-a810-b000a59b0218` — “OpenAI WebMCP Lab Summary”
- `6a95b346-70d0-83ea-a0b6-ad094f03b614` — “Inspect WebMCP capabilities”
- `6a95f975-4d98-83ea-babc-a6ff57e8b7d1` — “WebMCP Prototype Comparison”

Recoverable Codex tool history directly records searches or opens for the official WebMCP proposal repository, its implementation-status material, Chrome WebMCP and ChromeStatus documentation, Permissions Policy and iframe behavior, Chrome’s imperative API, OpenAI contest information, OpenAI WebMCP guidance, `executeTool`, and ChatGPT Work documentation.

Separate ChatGPT/user-message history records direct links to the WebMCP draft, a capability-exchange site, Chrome documentation, the OpenAI showcase, a Chrome Web Store inspector, a W3C introduction-layer call, `github.com/WebMCP-org`, and `webmcp.dev`. The accessible records contain the base Devpost challenge link, but do not establish a direct open of `/rules`. A later assistant response names Varden and other prior art; its underlying citation query events are unavailable.

This record is incomplete. Some task messages and tool outputs are summarized or truncated, and raw pages and query events behind several ChatGPT citation placeholders were not available. A query or open proves an action, not that a source caused a particular design choice. Deleted chats, rewritten remote history, and human-versus-agent authorship cannot be reconstructed; all Git commits use the same unsigned identity.

## Primary prior art reviewed

### Platform baseline and inspection

- The [WebMCP draft](https://webmachinelearning.github.io/webmcp/) already defines dynamic registration, `AbortSignal`-based unregistration, `toolchange`, discovery, invocation, origin exposure, and tool annotations. These are platform mechanics, not project-original controls. The draft also warns about stale arguments when a name is rapidly reused, so a compiled tool must receive a unique identity.
- Chrome’s [WebMCP guidance](https://developer.chrome.com/docs/ai/webmcp) and [DevTools inspection documentation](https://developer.chrome.com/docs/devtools/application/webmcp) already cover registered/discovered tools, exact inputs and outputs, invocation counts, and manual test execution.
- The Chrome-associated [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) and community [WebMCP Inspector](https://github.com/mr-shitij/webmcp_inspector) cover schema discovery, dynamic refresh, manual/model invocation, and traces.

### Security, policy, and lifecycle overlap

- [Varden](https://github.com/markndg/varden) and its [Web Shield architecture](https://github.com/markndg/varden/blob/main/docs/web-shield-architecture.md) cover registration and result scanning, prompt injection, capability mismatch, origin/provenance, metadata-hash history, churn/drift, approval, policy outcomes, and lifecycle evidence. Its model is a broad firewall/classifier rather than a task-specific replacement capability, but those constituent controls are prior art.
- [Tool Surface Poisoning](https://arxiv.org/abs/2606.06387) motivates origin binding, lifecycle consistency, data boundaries, provenance logs, and defenses against mid-session tool injection and hijacking.
- [WebMCP-Phalanx](https://arxiv.org/abs/2608.24017) uses cryptographic capability credentials, registration-principal binding, provenance labels, lifecycle/revocation, and quarantine inspection. Source binding and revocation cannot be claimed as new here.
- [webmcp-guard](https://github.com/SARTHAK2511/webmcp-guard) provides per-call confirmation, origin and schema-change warnings, provenance storage, schema diffs, stale-origin denial, and audit evidence.
- The [Microsoft MCP Security Gateway specification](https://github.com/microsoft/agent-governance-toolkit/blob/main/docs/specs/MCP-SECURITY-GATEWAY-1.0.md) provides relevant governance and gateway controls.

### Least privilege, exact approval, and task contracts

- [CAPLOCK](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7257458) compiles a user-approved task contract into attenuated capabilities covering resources, operations, destinations, data labels, budgets, and time.
- [Consentry](https://devpost.com/software/consentry) binds human approval to canonical JSON and SHA-256 for an exact MCP action and invalidates changed tools, parameters, destinations, or resources.
- [scoped-mcp](https://github.com/TadMSTR/scoped-mcp) documents per-agent tool/resource scope, approval, audit, interactive confirmation, and consumed one-time preapproval tokens with a short lifetime.
- [OpenPort](https://arxiv.org/abs/2602.20196) covers authorization-dependent discovery, least-privilege scopes, human review, time-bounded execution, impact binding, idempotency, and optional execution-time state witnesses.
- [Dynamic Capability Scoping](https://arxiv.org/abs/2607.22445), [Task-Conditioned Least-Privilege Learning](https://arxiv.org/abs/2608.18351), [SkillScope](https://arxiv.org/abs/2605.05868), and [AgenTRIM](https://arxiv.org/abs/2601.12449) cover task-conditioned authority envelopes, dynamic least privilege, constrained action graphs, replay, deterministic effect checks, and minimized tool surfaces.
- [DCC dynamic-tool issue #462](https://github.com/dcc-mcp/dcc-mcp-core/issues/462) describes agent-composed ephemeral, session-scoped tools with TTL, deregistration, and approval for elevated permissions.
- [Maqam](https://github.com/AjnasNB/maqam) binds one-time human approval to a run, tool, canonical input hash, call ceiling, and origin scope, then records receipts and rejects altered inputs or replay.
- [Macaroons](https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/) established attenuable credentials with contextual caveats in 2014.

### Closest challenge implementations

- [FlightSweeper](https://github.com/raintree-technology/flightsweeper-webmcp/blob/main/SUBMISSION.md) uses a human-defined revocable mandate that an agent may narrow but not expand, an independent policy layer, versioned receipts, and a synthetic sandbox. Its tools remain registered and enforce scope inside handlers; the proposed slice is materially different only if the broad source tool is actually unregistered and replaced.
- [VT](https://devpost.com/software/vt-y4n8u0) stages exact edits behind SHA-256 binding, human diff review, lifecycle cancellation, and verification, but uses a stable catalog rather than compiling a replacement WebMCP tool.

## Wording and code comparison

A one-off scoped local comparison reportedly used the audited baseline and the listed snapshots of Varden (`572b4a14af601f195bb3918cccd28861a59b0495`), WebMCP (`41d12f057167ccf5954dbcf49d99502cb6c84491`), and GoogleChromeLabs/webmcp-tools (`97e6fbe83fc3f2e3c6df2198b962dd2ad59cb924`). This checkout does not retain the comparison script, exact file manifest, query log, tokenization/normalization rules, or raw output, so the observations below are not independently reproducible from the repository alone.

- The comparison reported no exact eight-token sequence shared between relevant local source/docs and those three snapshots.
- The comparison reported no substantive normalized exact line of at least 24 characters matching Varden.
- The comparison reported one exact WebMCP line, platform boilerplate: `const controller = new AbortController();`.
- The comparison reported no exact five-token match in the selected Chrome reference implementation files.
- The comparison reported that local identifiers and phrases including `WMC-001`–`WMC-005`, “Presented → Declared → Effective,” “Trust the effect, not the label,” and the five scenario IDs were absent from Varden.
- Separate direct searches reportedly found no direct public match for the three-surface phrase, “The Effective Surface is the security truth,” “Trust the effect, not the label,” or the Scenario 1 read-only/mutation wording in the reviewed result set; the exact query log and result set were not retained.

This does not establish clean-room development. Exact matching will not detect paraphrase, renamed logic, conceptual influence, deleted or historical content, issues, discussions, private work, or unindexed material. The cited snapshot hashes were reported as predating the local commits, but their commit dates and verification output are not retained here. No legal conclusion is offered.

## Claims removed or prohibited

The audited baseline contains ordinary technical uses of “first” and “unique,” but no use of “first,” “novel,” “unique implementation,” “industry-leading,” or equivalent language as an originality claim. No baseline originality claim needed removal.

Future documentation and submission material must not claim that this project invented dynamic registration, attenuation, task contracts, exact approval, origin/hash binding, one-use TTL grants, drift detection, or effect verification. “This scoped review did not identify the combined implementation described above” is the strongest permitted comparison statement until the search record is preserved and an independent review says otherwise.

## Implementation gate for the vertical slice

The Scenario 1 slice qualifies for reassessment only if it demonstrates all of the following in executable behavior:

1. A human locks a fixed synthetic target, prohibited effects, one-call ceiling, and expiry.
2. An agent can submit only a non-effecting structured proposal that cannot widen that intent.
3. Human approval identifies the exact contract, source-declaration fingerprint, origin, declared handler/build version, expected result, and prohibited effects.
4. Approval unregisters the broad source tool before registering a uniquely named, no-input replacement tool.
5. The replacement consumes its single claim atomically before execution and uses a trusted, versioned closure rather than a mutable name lookup.
6. Invocation recomputes origin and source/build fingerprints and rejects drift, expiry, replay, or mismatch.
7. The verifier checks only the Scenario 1 expected result, byte-identical synthetic state, and controlled handler invariants; it does not claim general functional equivalence or independent network observation.
8. One receipt links the proposal hash, approval, generated registration identity, origin, invocation, before/after state, verification, and unregistration reason.

Until that gate is met and the prior-art comparison is independently reviewed, the go/no-go decision remains **NO-GO for recording or submission**.
