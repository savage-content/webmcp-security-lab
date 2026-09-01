# Prior-Art and Provenance Audit

**Audit window (America/Chicago):** 2026-08-31–2026-09-01
**Audited baseline:** `21cff1267a467074dc3f5586584e4a6474190aa7`
**Working branch:** `codex/capability-negotiator`

## Status and claim boundary

An independent technical review completed September 1, 2026 reached a
**NO-GO** for “novel,” “unique,” “first,” “invented,” clean-room,
patentability, or freedom-to-operate clearance claims. The reviewed sources contain
substantial overlap with every individual control: least-privilege capability
compilation, exact hash-bound approval, one-use and expiring authority, origin
and registration binding, lifecycle invalidation, and postcondition
verification. This is a technical provenance assessment, not legal advice. It
does not conclude infringement, non-infringement, patentability, or legal
freedom to operate.

The only narrow statement supported by this scoped audit is:

> In the Scenario 1 prototype, a human locks a fixed synthetic read intent and a WebMCP caller may stage a non-effecting proposal. An in-page approval event binds the displayed contract; the page then withdraws the broad source and proposal registrations and registers a newly named, no-input WebMCP tool for that approval instance. Within a 120-second same-document lease, the tool can be claimed once; it atomically consumes logical authority before awaited work, rechecks the current origin, source-declaration hash, declared handler-version labels, and synthetic-state baseline, verifies the expected eligibility result and byte-identical controlled state, and emits a linked local-export-only receipt. After the page callback settles successfully, it schedules retirement of the inert registration following a 50 ms Chrome 152 compatibility delay; that timer does not establish that the result crossed a browser or client boundary. Expiry, revocation, detected declaration/state drift, and post-claim failure retire immediately. A scoped primary-source search completed September 1, 2026 did not identify an earlier example of this entire WebMCP-specific sequence. This is not a claim of invention, firstness, priority, executable-code or build attestation, cross-session replay protection, external effect verification, or independently attested evidence.

That statement is a bounded implementation description plus a finite-search
result. It must be revisited if the implementation changes or additional prior
art is found.

## Independent review decision and anchors

- Frozen baseline: `21cff1267a467074dc3f5586584e4a6474190aa7`,
  August 31, 2026 16:34:02 CDT.
- Capability branch created: September 1, 2026 04:30:25 UTC.
- Reviewed implementation commit:
  `b79cf816c2943afc9b2764c7a0bae11d83d2258b`, September 1, 2026
  00:37:28 CDT.
- Repository-history searches place the first implementation occurrences at
  `b79cf81`; the frozen baseline lacks them. Later working-tree changes were not
  treated as earlier provenance.

The closest previously omitted source is the May 14, 2026
[Kubernetes-MCP-Guard Plan–Challenge–Execute RFC](https://github.com/containers/kubernetes-mcp-server/discussions/1150)
and its [reference implementation](https://github.com/mirusser/Kubernetes-MCP-Guard).
It already describes and implements a non-mutating plan, exact SHA-256-bound
human approval, a validity window, a single-use grant, execution-time live-state
drift rejection, and audit. The related
[MCP discussion #751](https://github.com/orgs/modelcontextprotocol/discussions/751)
also proposes intent/review digests, approval grants, single execution,
freshness gates, and audit. The remaining possible distinction is only the
complete WebMCP registration-replacement sequence described above.

## 2026-09-01 current-working-tree delta review

**Decision: unchanged NO-GO.** An independent technical review of the current
post-`b79cf81` working tree found no basis to broaden the narrow Scenario 1
finite-search statement above. The platform-neutral capability core, browser
extension/local connector/dashboard, and Android conformance adapter improve
portability and integration, but combine mechanisms already disclosed in the
primary sources below. They do not support claims of novelty, patentability,
firstness, clean-room development, non-infringement, or freedom to operate.

**Dirty-tree anchor.** Review began at HEAD
`b79cf816c2943afc9b2764c7a0bae11d83d2258b`; the anchor was refreshed after
the Chrome 152 compatibility fix with 22 modified tracked paths and 45
untracked paths. The exact
[45-file implementation/test manifest](docs/PRIOR_ART_DELTA_MANIFEST_2026-09-01.md)
covering the capability core, connector, extension, dashboard-facing
integration, and Android adapter hashes to
`224522a46d475ce6fe8242c5abcff1c5e397e59628981332fa99e477283eb5a9`.
The linked manifest fixes the precise path order and reproduction algorithm.
This is a scoped content anchor only—not a signature, trusted timestamp,
complete working-tree snapshot, provenance record, or evidence of authorship.

The delta remains a composition of established mechanisms:

- The core's canonical serialization, context-bound digest, TTL, one-shot
  consumption, execution-time drift check, outcome verification, and linked
  receipt chronology overlap [RFC 8785 JSON Canonicalization](https://www.rfc-editor.org/rfc/rfc8785.html),
  [Macaroons](https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/),
  the May 2026 [Plan–Challenge–Execute RFC](https://github.com/containers/kubernetes-mcp-server/discussions/1150),
  [MCP discussion #751](https://github.com/orgs/modelcontextprotocol/discussions/751),
  and [TraceGrant](https://arxiv.org/abs/2608.21126). Earlier patent publications
  also disclose single-use, operation-bound authorization and reviewed,
  expiring grants with audit links: [US20090136042A1](https://patents.google.com/patent/US20090136042A1)
  and [US9231955B1](https://patents.google.com/patent/US9231955).
- The extension/connector path composes documented Chrome
  [`activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab),
  [`scripting`](https://developer.chrome.com/docs/extensions/reference/api/scripting),
  and [extension-service-worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
  patterns with the [WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api),
  [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
  and [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports),
  plus pairing-code/poll/expiry concepts standardized in
  [RFC 8628](https://www.rfc-editor.org/info/rfc8628/). Chrome separately
  documents [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
  as an extension-to-local-host channel, and a browser-extension to
  local-connector path with policy and heartbeat appears in
  [US20260073060A1](https://patents.google.com/patent/US20260073060A1/en).
- The local JSONL hash chain and read-only dashboard do not turn the receipts
  into externally anchored or signed evidence. Hash-chained secure audit logs
  predate this work in [Schneier–Kelsey (1998)](https://www.usenix.org/conference/7th-usenix-security-symposium/cryptographic-support-secure-logs-untrusted-machines),
  while [RFC 9943](https://www.rfc-editor.org/info/rfc9943/) specifies stronger
  transparency-service receipts and append-only verification.
- The Android adapter re-expresses the same lifecycle using Android
  [`AppFunctionService`](https://developer.android.com/reference/android/app/appfunctions/AppFunctionService),
  caller package/signing context, and an atomic one-shot transition; Android's
  [AppFunction integration guide](https://developer.android.com/ai/appfunctions/add-appfunctions),
  AOSP's [one-shot callback implementation](https://android.googlesource.com/platform/frameworks/base.git/+/031e5cd3445a44d34153b4e2bf9e9a3e46aa40af/core/java/android/app/appfunctions/SafeOneTimeExecuteAppFunctionCallback.java),
  and Java's [`AtomicReference.compareAndSet`](https://docs.oracle.com/en/java/javase/15/docs/api/java.base/java/util/concurrent/atomic/AtomicReference.html)
  supply the underlying platform patterns. The reviewed manifest intentionally
  lacks AppFunction discovery metadata, and the Kotlin and TypeScript canonical
  encodings/protocol labels differ, so this tree demonstrates an adapter and
  semantic duplication—not device-level discoverability or cross-language
  wire-format conformance.

### Chromium implementation-status delta

**Decision: unchanged NO-GO.** A primary-source check dated September 1, 2026
adds browser-version constraints and prior-art overlap; it does not create a
novelty, patentability, clean-room, non-infringement, or freedom-to-operate
basis. Chromium issue reports describe upstream platform behavior, not local
lab observations. The labels below report only what the linked primary source
establishes on the review date.

- **Verified fixed or shipped:** Chrome documents that, as of Chrome 153,
  unregistering a tool no longer cancels or breaks an in-flight execution; the
  earlier behavior and design resolution are recorded in
  [WebMCP issue 218](https://github.com/webmachinelearning/webmcp/issues/218).
  The local 50 ms timer begins after the page callback settles, not after
  browser/client delivery is observed, and is therefore a Chrome 152
  compatibility shim rather than a novel delivery guarantee. For supplied
  issue `508265320`, Chromium shipped
  [`RegisteredTool.annotations`](https://chromium.googlesource.com/chromium/src/+/5ec2cc8326da2cc6ba44ba8862ecce546b80bf17)
  and, for supplied issue `543815035`, changed unserializable tool results to
  [reject execution](https://chromium.googlesource.com/external/w3c/web-platform-tests/+/refs/tags/merge_pr_61896).
  Supplied issue `508306795` does not establish type preservation: the current
  WebMCP IDL returns
  [`Promise<DOMString>`](https://github.com/webmachinelearning/webmcp/blob/main/index.bs),
  while Chromium's IPC definition says the result remains
  [a string for now](https://chromium.googlesource.com/chromium/src/third_party/+/bb1b18ef2fe0187aae661293395192319aa3b3f2/blink/public/mojom/content_extraction/script_tools.mojom).
  These are platform mechanics; annotations remain advisory and result parsing
  still requires local validation.
- **Verified open upstream risks:** Chromium issue
  [526451590](https://issues.chromium.org/issues/526451590) records declarative
  form-tool registration through a sandbox lacking `allow-scripts`; current
  [form registration source](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/html/forms/html_form_element.cc)
  contains no scripts-sandbox gate. Issue
  [508285989](https://issues.chromium.org/issues/508285989) records a missing
  `toolchange` notification when document destruction implicitly removes tools.
  Issue [535256664](https://issues.chromium.org/issues/535256664/resources)
  leaves browser actor-stack integration for user interaction open. The current
  lab implements imperative, same-document tools and page-local approval; it
  does not demonstrate or cure those declarative, cross-document, or
  browser-actor behaviors.
- **Corrected or not independently verified by the supplied tracker ID:**
  current Blink
  [checks the `tools` Permissions Policy](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/script_tools/model_context.cc)
  for declarative registration but silently returns when disabled, so issue
  `507724727` is an error-reporting gap, not a current permission bypass. The
  same source now gates ModelContext on an origin-keyed agent cluster; the
  status of supplied issue `521181015` was not independently retrievable. A
  stale AbortSignal/duplicate-name removal class was
  [fixed under issue 543349473](https://chromium.googlesource.com/external/github.com/web-platform-tests/wpt/+/refs/tags/merge_pr_61868),
  not verified under supplied issue `492668960`. The WebMCP
  [security questionnaire](https://github.com/webmachinelearning/webmcp/blob/main/security-privacy-questionnaire.md)
  states intended BFCache behavior, and a related navigation/BFCache race was
  [fixed under issue 492477322](https://chromium.googlesource.com/chromium/src/+/93215cb6533b7bf6caca38b9bf09b3c44cddd82e%5E%21/);
  supplied issue `510487685` was not independently tied to that fix.
  Tip-of-tree CDP exposes an experimental
  [WebMCP domain](https://chromedevtools.github.io/devtools-protocol/tot/WebMCP/),
  but the official [`chrome.debugger` domain list](https://developer.chrome.com/docs/extensions/reference/api/debugger)
  does not document WebMCP access; supplied issue `504443396` therefore does
  not establish extension access. Current Blink source accounts for callbacks
  executing in an isolated world, but supplied issue `509555845` does not prove
  that an extension isolated world can discover the page's
  `document.modelContext`. The reviewed extension retains explicit top-level
  `MAIN`-world injection and no `debugger` permission.

Those implementation statuses require exact-browser-build conformance evidence
before any broader compatibility claim. They do not alter the dirty-tree
content anchor above because the 45-file manifest excludes Markdown
documentation.

This is a bounded technical overlap review, not legal advice. Patent publication
links are used only as technical disclosures; this review did not perform claim
construction, an exhaustive prior-art or patent-family/prosecution/status search,
jurisdiction and ownership mapping, an anticipation/obviousness opinion, an
infringement analysis, or an FTO opinion. Qualified patent counsel must perform
those legal analyses before any patentability, non-infringement, or FTO statement.

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
- [Kubernetes-MCP-Guard](https://github.com/mirusser/Kubernetes-MCP-Guard), its [May 14, 2026 RFC](https://github.com/containers/kubernetes-mcp-server/discussions/1150), and [MCP discussion #751](https://github.com/orgs/modelcontextprotocol/discussions/751) are especially close: non-effecting planning, exact digest-bound approval, TTL, single-use execution, live-state drift rejection, requester/approver binding, and append-only audit all predate this branch.
- [Maqam](https://github.com/AjnasNB/maqam) binds one-time human approval to a run, tool, canonical input hash, call ceiling, and origin scope, then records receipts and rejects altered inputs or replay.
- [Macaroons](https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/) established attenuable credentials with contextual caveats in 2014.

Implementation libraries also overlap with exact-input authorization,
confirmation, audit, or cleanup patterns: [AbsoluteJS WebMCP](https://absolutejs.com/documentation/webmcp),
[Agent-Native WebMCP](https://www.agent-native.com/docs/webmcp/), and
[webmcp-tools](https://github.com/josharsh/webmcp-tools/blob/main/README.md).

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

This does not establish clean-room development. The unretained comparison is
not independently reproducible and therefore cannot support a clean-room
claim. Exact matching would not detect paraphrase, renamed logic, conceptual
influence, deleted or historical content, issues, discussions, private work,
or unindexed material. The cited snapshot hashes were reported as predating
the local commits, but their commit dates and verification output are not
retained here. No legal conclusion is offered.

## Claims removed or prohibited

The audited baseline contains ordinary technical uses of “first” and “unique,” but no use of “first,” “novel,” “unique implementation,” “industry-leading,” or equivalent language as an originality claim. No baseline originality claim needed removal.

Future documentation and submission material must not claim that this project
invented dynamic registration, attenuation, task contracts, exact approval,
origin/hash binding, one-use TTL grants, drift detection, effect verification,
or their combination. “This scoped review did not identify an earlier example
of the entire WebMCP-specific sequence described above” is the strongest
permitted comparison statement. “Capability Delta” also predates this work as
a term and must not be presented as original terminology.

## Implementation gate for the vertical slice

The Scenario 1 slice qualifies for reassessment only if it demonstrates all of the following in executable behavior:

1. A human locks a fixed synthetic target, prohibited effects, one-call ceiling, and expiry.
2. An agent can submit only a non-effecting structured proposal that cannot widen that intent.
3. Human approval identifies the exact contract, source-declaration fingerprint, origin, declared handler-version labels, expected result, and prohibited effects.
4. Approval unregisters the broad source tool before registering a uniquely named, no-input replacement tool.
5. The replacement consumes its single claim atomically before execution and uses a trusted, versioned closure rather than a mutable name lookup.
6. Invocation recomputes origin and the descriptive source fingerprint and rejects declaration/version-label drift, expiry, replay, or mismatch.
7. The verifier checks only the Scenario 1 expected result, byte-identical synthetic state, and controlled handler invariants; it does not claim general functional equivalence or independent network observation.
8. One receipt links the proposal hash, approval, generated registration identity, origin, invocation, before/after state, verification, and logical authority-invalidation reason. Physical registration retirement is a separate post-compatibility-delay discovery observation and does not attest result delivery.

The page-side same-document lifecycle was demonstrated in the Codex in-app
browser on September 1, 2026, and the prior-art comparison received the
independent review recorded here. The Chrome 152 compatibility shim and
connector return path still require fresh exact-build evidence. Nothing here
authorizes an originality claim or public launch. The dated product
publish-readiness decision remains in `docs/GO_NO_GO.md`.
