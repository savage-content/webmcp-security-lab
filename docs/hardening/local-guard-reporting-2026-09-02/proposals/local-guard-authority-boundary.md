# Security Hardening Proposal: Own the Local Guard authority boundary

## Decision

Decide whether Local Guard remains a reproducible developer preview over exact
loopback HTTP or becomes a signed desktop product whose browser-to-host channel
is owned by the operating system and extension identity.

## Executive Recommendation

There are two credible options. **Option 1, Reproducible loopback preview,**
keeps the current adapter and adds a deterministic package, manifest authority
gate, hashes, and explicit preview channel. **Option 2, Signed native-host
product,** replaces the browser-accessible bridge port with extension-ID-bound
native messaging and uses stdio or OS-owned IPC for the local agent boundary.

I recommend Option 1 for the next controlled preview because it is reversible
and we can validate it now. Option 2 should be the release gate for general
desktop distribution. A hosted relay is deliberately excluded: it would add
account, telemetry, cross-tenant, availability, and privacy authority without
helping the core one-device safety case.

## Evidence

I inspected the current manifest, service worker, connector, and release gate.
The manifest is narrow, but the operating boundary is still a development
shape.

| Evidence  | Finding or document                                           | What it establishes                                                                                                                                   |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E-LG-1`  | Exact MV3 authority (`products/extension/manifest.json`)      | The extension uses `activeTab`, `scripting`, `storage`, and four exact loopback host patterns; it has no all-sites or debugger authority.             |
| `E-LG-2`  | Browser-side enforcement (`products/extension/background.js`) | Exact document, declaration, permit, consume-before-execute, and no-retry checks are owned by the service worker.                                     |
| `E-RP-1`  | Loopback connector (`products/connector/server.ts`)           | Extension traffic and MCP traffic use local HTTP listeners and bearer material; initial challenge traffic still assumes the local machine is trusted. |
| `E-LG-5`  | Reproducible package gate (`scripts/package-local-guard.mts`) | The new prerequisite can reject permission, host, runtime-file, symlink, popup-reference, and dynamic-code drift and emit deterministic hashes.       |
| `E-DOC-2` | Threat model (`docs/THREAT_MODEL.md`)                         | Browser-profile and local-machine compromise, signing, native hosting, and production authentication remain outside validated scope.                  |

The observed facts support a narrower inference: control logic is concentrated
enough to package safely, but installation identity and inter-process authority
are still conventions around a trusted workstation. That is acceptable for a
preview and too weak for an unqualified consumer security product.

## Current Design And Failure Mode

The selected page is untrusted. The extension receives explicit `activeTab`,
injects a bounded adapter into the top-level MAIN world, and applies a fixed
lesson policy in the service worker. It polls an HTTP loopback bridge and the
connector exposes a separate token-protected MCP endpoint. Pairing and permits
are short-lived, document-bound, and one-use.

The failure mode is not a discovered bypass in that code. It is ownership
ambiguity: an unpacked directory has no publisher identity or safe update
channel, browser storage holds local bridge material, and a port is reachable
by other software on the host. We can narrow and test that boundary, but we
cannot make malware on the same machine irrelevant with more token copy.

## Desired Invariants

- Every shipped extension byte is included in an allowlisted, hashed release.
- Package creation fails on any permission, host, remote-code, symlink, or
  unreviewed runtime-file drift.
- One explicit tab/document activation cannot authorize another document.
- Authority is consumed before awaited work and never retried automatically.
- Navigation, tab closure, expiry, declaration drift, and disconnect revoke
  the browser and connector sides.
- A general release has a verifiable publisher and update identity.
- The browser-to-host channel accepts only the installed extension identity and
  does not expose a general browser-accessible command port.

## Constraints And Non-Goals

The novice must not copy ports, tokens, hashes, session IDs, or generated tool
names. Native ChatGPT/Codex Site Tools remain a separate surface. We do not try
to defend a fully compromised OS or browser profile. No universal-client or
store-approval claim is in scope. There is no measured startup, memory, or
latency budget yet.

## Before Architecture

[Before architecture](../diagrams/local-guard-authority-before.mmd) shows the
current trust edges. The important point is that both browser bridge and MCP
entry are local HTTP boundaries, while installation is an unpacked folder.

## Options

### Option 1: Reproducible loopback preview

This option preserves the current execution path. A deterministic ZIP contains
only reviewed runtime files, validates the exact MV3 and loopback permissions,
rejects dynamic code and symlinks, and emits per-file and archive hashes. We
retain short-lived tokens, exact ports, document binding, and one-use
enforcement. The strongest case is speed and debuggability: we can give
reviewers one verifiable artifact without rewriting a working bridge.

The residual risk is also clear. Reproducibility proves what we packaged; it
does not prove publisher identity, prevent another local process from
interacting with loopback, or protect a compromised profile. Operations remain
light because no installer or native host is introduced. Rollback removes the
preview artifact and invalidates pairings.

[Option 1 architecture](../diagrams/local-guard-authority-reproducible-preview-after.mmd)
adds a release gate without moving runtime trust. That is why the artifact must
say preview.

| Change            | Before                    | After                                     | Security consequence                            | Cost                          |
| ----------------- | ------------------------- | ----------------------------------------- | ----------------------------------------------- | ----------------------------- |
| Distribution      | Unpacked source directory | Deterministic allowlisted ZIP plus hashes | Reviewable bytes and permission drift detection | Release automation and review |
| Runtime transport | Exact loopback HTTP       | Exact loopback HTTP                       | No transport-boundary reduction                 | None beyond current path      |
| Identity          | Development extension ID  | Development/preview identity              | No publisher assurance                          | Preview-only label            |
| Rollback          | Manual source reload      | Remove versioned ZIP and revoke sessions  | More predictable rollback                       | Artifact retention            |

### Option 2: Signed native-host product

This option keeps the service-worker policy but moves the connector edge behind
Chrome native messaging, allowlisted by the signed extension ID. A signed
installer owns the extension/native-host pairing, permissions, updates, and
uninstall. The local agent connects through stdio or an OS-owned IPC boundary
rather than a query-token URL. This is attractive because identity and channel
ownership become install-time controls rather than browser-readable secrets.

What gives me pause is lifecycle complexity. Chrome, Edge, enterprise policy,
Windows/macOS/Linux installers, upgrades, crash recovery, and log privacy all
become product responsibilities. Native messaging adds copies and process hops;
the likely latency is small compared with a Site Tool call but remains
hypothetical until measured. A rollback must preserve receipt integrity while
removing the host registration and revoking browser state.

[Option 2 architecture](../diagrams/local-guard-authority-native-host-after.mmd)
removes the browser-accessible bridge port. The local host becomes a more
privileged component, so its code-signing, sandboxing, updater, and incident
response need the same scrutiny currently focused on the extension.

| Change            | Before                | After                                | Security consequence                               | Cost                          |
| ----------------- | --------------------- | ------------------------------------ | -------------------------------------------------- | ----------------------------- |
| Browser channel   | Loopback HTTP         | Extension-ID-bound native messaging  | Removes general browser-accessible bridge endpoint | Native host and installer     |
| Agent channel     | URL bearer token      | stdio or OS-owned IPC                | Reduces token exposure                             | Client integration work       |
| Publisher         | Unpacked              | Signed extension and host            | Verifiable install/update identity                 | Signing and store operations  |
| Failure isolation | One connector process | Native host plus local agent adapter | Can isolate browser transport; adds crash boundary | Recovery and telemetry design |

## Comparison

| Dimension   | Option 1: reproducible preview                                       | Option 2: signed native host                                            |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Security    | Improves supply/review integrity; same local transport residual risk | Stronger channel and publisher identity; native host becomes privileged |
| Performance | Neutral, high confidence from unchanged runtime                      | Unknown; extra process/IPC mechanism must be measured                   |
| Memory      | Neutral, high confidence                                             | Likely higher for host process, low confidence                          |
| Reliability | Improves release repeatability; runtime unchanged                    | Better channel ownership, more install/update/crash states              |
| Operability | Small artifact/review burden                                         | Signing, store, installer, updater, support, and incident burden        |
| Migration   | Immediate and reversible                                             | Multi-platform migration with parallel preview support                  |

Option 1's effects are source-derived except runtime performance, which is
unchanged by construction. Option 2's resource effects are hypothetical. We
should measure startup p95, idle RSS, polling/IPC CPU, invocation latency,
disconnect latency, and crash recovery on supported browsers before choosing
release thresholds.

## Recommendation

I recommend shipping Option 1 only to controlled testers while we design Option 2. If the intended audience stays limited to developers on disposable profiles,
Option 1 may remain proportionate. If we ask ordinary users to trust Local
Guard as a security boundary, a signed identity and owned native channel should
win despite the operational cost.

## Evidence Coverage And Residual Risk

| Evidence                       | Option 1                                 | Option 2                                                 | Tactical protection still required          |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `E-LG-1` — Exact MV3 authority | Addresses package drift                  | Preserves and strengthens install identity               | Exact permission tests                      |
| `E-LG-2` — Browser enforcement | Unaffected                               | Mitigates transport exposure; enforcement still required | Document binding and consume-before-execute |
| `E-RP-1` — Loopback connector  | Mitigates only through packaging honesty | Addresses browser bridge; agent IPC remains to design    | Short lifetimes and fail-closed auth        |
| `E-DOC-2` — Threat model       | Leaves trusted-local-machine residual    | Narrows but does not remove OS/profile compromise        | Honest scope language                       |

## Migration And Rollout

First publish a hash-addressed preview artifact and repeat the five-lesson
fresh-profile run. In parallel, prototype native messaging behind a build flag,
retain the existing policy engine, and compare identical test vectors across
adapters. Roll out the signed channel to opt-in testers, revoke the loopback
browser bridge only after parity, and keep rollback able to remove native-host
registration without deleting verified receipts.

## Validation Plan

- reproduce the ZIP on two clean checkouts and compare bytes;
- inspect archive members, MV3 permissions, and absence of remote code;
- run keyboard, screen-reader, 200% zoom, and 360 px popup acceptance;
- execute all five synthetic lessons once each with no retry;
- test reload/navigation, declaration drift, expired permits, bridge loss, and
  hostile local requests;
- benchmark startup, idle RSS/CPU, invocation latency, and revocation; and
- verify install, update, rollback, and uninstall on every supported platform.

## Implementation Work Packages

The reversible Option 1 prerequisites are implemented in
[the preview implementation plan](../implementation/reproducible-local-preview.md).
Option 2 still needs protocol, installer, signing, updater, compatibility,
observability, and incident-response design before source implementation.

## Open Questions

- Is Local Guard a developer tool or an ordinary-user security product?
- Which desktop platforms and managed-browser policies are supported?
- Who owns signing identities, updates, revocation, and incident response?
- Can the local MCP client use stdio everywhere, or is bounded OS IPC required?
