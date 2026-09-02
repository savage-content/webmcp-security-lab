# Security Hardening Proposal: Make publication a distinct reviewed state

## Decision

Decide whether reporting remains a local teaching workbench or adds a real
service where privacy-minimized public-web reports enter quarantine, receive
authenticated human review, and only then project into a tooling feed.

## Executive Recommendation

**Option 1, Local-only evidence,** preserves the current receipt, redacted
preview, and temporary review list with no external route. **Option 2,
Quarantined reviewed service,** adds authenticated intake, durable moderation
events, abuse and retention controls, a separate publication decision, and a
minimized JSON/NDJSON projection.

I recommend we keep Option 1 live while building Option 2 behind a disabled
feature gate. The pure moderation state machine is a safe shared prerequisite;
connecting it to the network is not. A direct report-to-feed alternative is
rejected because it collapses untrusted reporter input, evidence, human
judgment, and publication into one authority boundary.

## Evidence

I inspected each transformation from receipt to feed. The data model is already
strict; the missing product boundary is authenticated, durable operations.

| Evidence  | Finding or document                                                     | What it establishes                                                                                                              |
| --------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `E-RP-2`  | Strict privacy-safe draft (`products/connector/issue-draft.ts`)         | Closed enumerations, HTTPS-origin normalization, no free text, and mandatory assurance limitation are enforced.                  |
| `E-RP-3`  | Local review list (`products/connector/issue-review.ts`)                | Saving is one-use, session-scoped, synthetic-only, bounded, and memory-only.                                                     |
| `E-RP-4`  | Human-gated feed projection (`products/connector/issue-publication.ts`) | Only `published` public-web records project; named hosts require explicit consent and reproduction-grade evidence.               |
| `E-RP-5`  | Moderation state machine (`products/connector/issue-moderation.ts`)     | New shared core starts public-web drafts in quarantine, enforces transitions, and separates `accepted_private` from `published`. |
| `E-DOC-1` | Product acceptance and privacy boundary (`docs/PRODUCT.md`)             | Public intake is explicitly blocked pending privacy, security, moderation, retention, abuse, and incident decisions.             |

Observed code rejects raw receipts and synthetic/local publication. We infer
that the domain model can support a service, but it cannot prove who reviewed a
record, whether events were durably ordered, or whether operational policies
were enforced. Those properties belong to the future service boundary.

## Current Design And Failure Mode

A verified local receipt can create a fixed, redacted issue candidate. A
one-use form action saves only that draft to an in-memory, session-scoped list.
There is no external submission or publication endpoint. Separately, a pure
projection function can create a tiny feed record from an already-published
candidate.

The safe current failure mode is absence: nothing can reach a human or tooling
feed. The dangerous future failure would be wiring the existing projection to
an unauthenticated route and treating a caller-supplied moderation state as
human review. The new state machine prevents accidental transitions in process,
but authentication, durable audit, idempotency, retention, and abuse controls
must own that claim at service level.

## Desired Invariants

- Synthetic and local exercise reports can never enter external intake.
- Every accepted public-web report starts quarantined.
- Intake accepts only the strict high-level schema and no free text, evidence,
  credentials, paths, queries, screenshots, conversations, or receipt IDs.
- Only an authenticated, authorized human can advance moderation state.
- `accepted_private` and `published` are distinct decisions.
- Named-host publication requires explicit hostname consent and reproduced or
  equivalent evidence.
- Feed records are projections, never raw reports or receipts.
- Every event is durable, monotonic, idempotent, attributable, retained, and
  deletable under an approved policy without silently rewriting publication.

## Constraints And Non-Goals

The public site cannot collect client evidence, source, production payloads,
credentials, contracts, or private methodology. LeftOut assesses and validates;
this pipeline is not a remediation service or certification. No price,
transaction infrastructure, tracker, third-party form, or automatic site
testing is introduced. The exact assurance limitation remains mandatory.

## Before Architecture

[Before architecture](../diagrams/reporting-quarantine-before.mmd) shows a
deliberately disconnected system. The local list is useful teaching state, not
a reporting backend.

## Options

### Option 1: Local-only evidence

We keep receipts, redaction, one-use save, and the temporary local list. The
strongest case is containment: there is no external privacy incident, abuse
queue, reviewer account, or public correction problem because no submission
exists. This is also the most reliable offline experience and has negligible
service cost.

Its limitation is product value. Users cannot alert a human or contribute a
reviewed tooling signal. Data disappears with the local session by design. We
can improve export clarity, accessibility, and packaging, but calling this a
reporting pipeline would be misleading.

[Option 1 architecture](../diagrams/reporting-quarantine-local-only-after.mmd)
makes the local lifecycle explicit and keeps feed eligibility at zero.

| Change       | Before                  | After                         | Security consequence                 | Cost                        |
| ------------ | ----------------------- | ----------------------------- | ------------------------------------ | --------------------------- |
| State model  | Preview and memory list | Explicit local-only lifecycle | Clearer claims; no new external risk | Documentation/tests         |
| Publication  | Pure unused projector   | Still disconnected            | No accidental feed                   | No external reporting value |
| Retention    | Process memory          | Process/session memory        | Automatic local erasure              | No durable review           |
| Human review | None                    | Local user only               | No false reviewer claim              | No LeftOut triage           |

### Option 2: Quarantined reviewed service

This option adds a separate, authenticated service. A high-level public report
passes schema, size, rate, bot/abuse, and privacy checks before a durable write
to quarantine. Reviewer actions use role-bound sessions and append immutable
moderation events. Acceptance remains private. A second explicit publication
decision creates the small record already defined by the feed projector.

The attractive part is that each actor owns one decision: the reporter submits
a bounded lead, the reviewer evaluates evidence, and the publisher decides what
becomes public. The cost is a real security and privacy operation. We need
account recovery, reviewer access reviews, abuse queues, retention/deletion,
audit backup, incident handling, corrections, feed signing/versioning, and
service monitoring. Database and queue latency are likely modest, but no
production workload is measured.

[Option 2 architecture](../diagrams/reporting-quarantine-service-after.mmd)
shows the critical one-way edge: only a separate minimized publication record
reaches the feed. Raw quarantine records never do.

| Change  | Before                     | After                                 | Security consequence                          | Cost                             |
| ------- | -------------------------- | ------------------------------------- | --------------------------------------------- | -------------------------------- |
| Intake  | Absent                     | Auth/rate/schema gate                 | Bounded attack surface, still Internet-facing | Service and abuse operations     |
| Review  | Caller has no authority    | Authenticated human state transitions | Prevents caller-asserted publication          | Identity and audit system        |
| Storage | Memory only                | Durable quarantine and event log      | Recoverable history; creates sensitive store  | Retention/deletion/backups       |
| Feed    | Disconnected pure function | Published-record projection endpoint  | Raw reports stay private                      | Versioning, signing, corrections |

## Comparison

| Dimension   | Option 1: local only                       | Option 2: quarantined service                                      |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Security    | Strongest containment; no external surface | Controlled reporting value; adds Internet, identity, and data risk |
| Performance | Local and effectively neutral              | Extra validation, storage, review, and projection hops             |
| Memory      | Small bounded process state                | Durable store, indexes, queues, and caches required                |
| Reliability | Offline; state intentionally ephemeral     | Needs idempotency, backpressure, recovery, backups, and SLOs       |
| Operability | Minimal                                    | Reviewer operations, abuse, privacy, incident, and feed ownership  |
| Migration   | None                                       | Schema/version migration and disabled-first rollout                |

Option 1 is measured only through existing local tests; Option 2 assessments
are source-derived or hypothetical. Before rollout we need load profiles,
retention volumes, review throughput, intake rejection rates, and feed consumer
requirements.

## Recommendation

I recommend Option 2 as the eventual product architecture and Option 1 as the
only currently releasable behavior. The deciding condition is not code
completion; it is whether we can name and operate authentication, human review,
retention/deletion, abuse, incident, and publication owners. Without those,
keeping intake absent is a feature, not a delay.

## Evidence Coverage And Residual Risk

| Evidence                         | Option 1                 | Option 2                         | Tactical protection still required       |
| -------------------------------- | ------------------------ | -------------------------------- | ---------------------------------------- |
| `E-RP-2` — Strict draft          | Preserved                | Addresses intake minimization    | Closed-schema tests and exact limitation |
| `E-RP-3` — Local review          | Addresses local teaching | Unaffected; remains separate     | One-use action and scope revocation      |
| `E-RP-4` — Feed projection       | Disconnected             | Addresses minimized publication  | Explicit consent/evidence gate           |
| `E-RP-5` — Moderation core       | Optional local code      | Mitigates transition drift       | Real authentication and durable events   |
| `E-DOC-1` — Product privacy rule | Fully aligned            | Unknown until operational review | Public intake remains off meanwhile      |

## Migration And Rollout

Keep current routes unchanged. Build the moderation service with no public DNS
and feed disabled, import only synthetic service-level fixtures, and complete
authorization/abuse/privacy tests. Add operator-only intake, then a tiny
invited cohort. Enable publication separately after review quality and
correction workflows are proven. Rollback disables intake first, preserves
quarantine under retention policy, and never republishes by replaying events.

## Validation Plan

- fuzz the closed intake and transition schemas;
- prove synthetic/local contexts cannot cross the intake boundary;
- test authorization denial for every reviewer and publication action;
- test idempotency, duplicate delivery, timestamp/order conflicts, and outage
  recovery;
- verify deletion and retention jobs against backups and audit events;
- run abuse, rate-limit, CSRF, SSRF, injection, and account-recovery reviews;
- diff every feed field against the deny list; and
- conduct a tabletop for erroneous publication and correction.

## Implementation Work Packages

The pure state machine and tests are described in
[the quarantined-core implementation plan](../implementation/quarantined-review-core.md).
The selected disabled-first service work is tracked in
[the quarantined reviewed-service implementation plan](../implementation/quarantined-reviewed-service.md).
Its configuration and credential-separation package is implemented; network
intake, storage, reviewer UI, and feed serving remain intentionally disabled
until their named gates pass.

## Open Questions

- Who authenticates and authorizes reviewers and publishers?
- What evidence may reviewers request without violating the public-site rules?
- What are retention, deletion, legal hold, and backup policies?
- How are abuse, duplicate reports, disputes, corrections, and incidents owned?
- Is the feed public, authenticated, signed, versioned, and rate limited?
