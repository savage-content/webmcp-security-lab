# Implementation Plan: Quarantined reviewed reporting service

## Selected Design And Constraints

Implement Option 2 from the reporting hardening proposal as a separate,
disabled-first service boundary. The first release uses invited, token-bound
intake rather than anonymous public intake. Reviewer and publisher authority
remain separate. Every accepted report starts quarantined, every state change
is an attributable append-only event, and publication creates a distinct
privacy-minimized record. Intake, moderation, and feed serving each have an
independent feature gate and fail closed when configuration is absent.

Only the existing high-level fields are accepted: public HTTPS origin,
category, severity, and protocol stage. The service never accepts free text,
paths, queries, fragments, screenshots, page contents, credentials, source
code, raw results, conversations, permits, receipts, or customer records.

## Source Revision And Drift Check

The hardening evidence baseline is
`5ba6e97095918d8877e1e12c98faabb3b81a869f`. Implementation begins from
`14b8faa`, which adds the current novice release materials and Local Guard
release-attestation gate. The reporting domain files identified by evidence
`E-RP-2` through `E-RP-5` remain the selected strict draft, transition, and
projection boundary. Before each network-facing increment, compare those files
with the recorded evidence hashes and update this plan if their authority or
data shape changes.

## Implementation Status — 2026-09-02

Work packages 1–6 are implemented and verified in local source: fail-closed
configuration and role separation; versioned D1 moderation records,
hash-chained events, idempotency and quota tables; and a strict invited intake
route with atomic quarantine entry; authenticated reviewer reads and closed
transitions; and a separate publisher action that atomically creates an
immutable minimized publication row. The routes are disabled and unconfigured
on the public deployment. An independently gated JSON/NDJSON feed signs exact
bounded snapshot pages with externally supplied Ed25519 material and verifies
against a separately pinned fingerprint. Packages 7–9 remain open:
retention/correction operations, production telemetry/runbooks, privacy
approval, and the first-time reporting walkthrough.

## Affected Components

- `products/connector/issue-draft.ts`
- `products/connector/issue-moderation.ts`
- `products/connector/issue-publication.ts`
- `products/reporting-service/config.ts`
- `products/reporting-service/auth.ts`
- `products/reporting-service/store.ts`
- `products/reporting-service/feed-signing.ts`
- `app/api/reports/**`
- `db/schema.ts`
- reporting-service tests and operator documentation

## Ordered Work Packages

1. Add strict disabled-by-default configuration, separate intake/reviewer/
   publisher credentials, constant-time credential checks, and tests proving
   absent or malformed configuration cannot enable authority.
2. Add versioned D1 tables for reports, immutable moderation events,
   idempotency records, publication records, and retention tombstones. Use
   optimistic revisions and transactional batches so concurrent transitions
   cannot both succeed.
3. Add invited intake with exact content type and size limits, closed-schema
   parsing, server-generated IDs and timestamps, idempotency, a bounded global
   and invitation quota, and unconditional quarantine entry.
4. Add authenticated reviewer reads and transitions. Store a stable operator
   identifier and role on every event without storing bearer material.
5. Add a distinct publisher action that requires `accepted_private`, the
   existing hostname-consent/evidence gate, and a second role. Persist the
   minimized publication record separately from the private report.
6. Add versioned JSON and NDJSON feeds behind an independent read gate. Sign
   canonical feed bytes with an externally managed Ed25519 key and publish the
   separately trusted public-key fingerprint.
7. Add retention, deletion, legal-hold, correction, and erroneous-publication
   workflows. Deletion must preserve a non-identifying audit tombstone and
   must not silently rewrite a previously published feed.
8. Add operational telemetry that counts states and failures without logging
   origins, credentials, request bodies, or report contents. Define alerts,
   incident ownership, recovery, and rollback before enabling a cohort.
9. Add a first-time reporting walkthrough and explicit final submission
   confirmation only after the service gates pass. The public learning site
   must continue to work with reporting fully disabled.

## Compatibility And Migration

The existing local synthetic workbench remains separate and never migrates
into service intake. No synthetic receipt, local review item, or historical
fixture is imported. The first durable schema is versioned from inception.
Future schema changes require forward-only migrations and must never reinterpret
an old private record as published.

The public Sites deployment receives no enabled reporting route until the
intake origin, credentials, D1 binding, quotas, retention policy, and incident
owner are configured and independently reviewed. An invited cohort can use a
separate service hostname before public integration.

## Tactical Protections During Migration

- Keep current public intake and feed routes absent or return indistinguishable
  not-found responses while disabled.
- Keep synthetic and local contexts unrepresentable at the service boundary.
- Preserve the no-free-text schema, HTTPS-origin normalization, withheld-host
  default, and exact assurance limitation.
- Never accept caller-supplied IDs, timestamps, moderation state, reviewer
  identity, publication state, or feed fields.
- Keep reviewer and publisher credentials distinct and rotate them separately.
- Do not put bearer tokens, private keys, or raw reports in logs, URLs, source,
  artifacts, browser storage, or client-visible errors.

## Tests And Security Validation

- prove every feature gate fails closed for missing, malformed, duplicate, or
  partially configured authority;
- test constant-time token verification and strict role separation;
- fuzz content type, byte limits, JSON structure, unknown fields, enum values,
  Unicode hostnames, public-suffix edge cases, and non-public destinations;
- test idempotent duplicate intake and reject conflicting reuse;
- race every moderation transition against the same revision;
- deny every invalid transition and every publication without the second role;
- test CSRF, CORS, replay, quota exhaustion, injection, cache, and error-body
  leakage behavior at the HTTP boundary;
- prove private report fields cannot enter feed serialization or telemetry;
- verify feed signatures against a separately pinned public key and reject key,
  byte, order, version, and signature drift; and
- test retention, deletion, backup restore, correction, and emergency feed
  disablement before enabling external traffic.

## Performance And Resource Benchmarks

Measure validation and quarantine-write latency, concurrent optimistic-update
conflicts, review pagination, feed generation/signing, D1 storage growth, and
quota checks under burst and sustained workloads. Record p50/p95/p99 latency,
error rate, CPU time, subrequest count, and stored bytes. No threshold is
claimed until a representative invited-cohort workload exists.

## Rollout And Rollback

Deploy with all gates off. Enable authenticated operator health checks, then
invited intake with moderation and feeds still off. Enable reviewer reads and
transitions for synthetic service-level fixtures, then for a tiny public-web
cohort. Enable publication only after review quality, correction, and incident
tabletops pass. Enable feeds last with a pinned signing identity.

Rollback disables intake first, then moderation writes, while preserving
quarantine under the approved retention policy. Feed serving can be disabled
without deleting published records. Key compromise revokes the affected key,
freezes publication, rotates credentials, and publishes a signed correction
from a new trusted key only after incident review.

## Acceptance Criteria

- every accepted report is a strict public-web draft and starts quarantined;
- no caller can set state, identity, timestamps, publication, or feed fields;
- duplicate delivery is idempotent and conflicting reuse is rejected;
- only an authenticated reviewer can move review state;
- only a separately authorized publisher can create a publication record;
- every state change is durable, ordered, attributable, and concurrency-safe;
- raw/private fields cannot reach feeds, telemetry, client errors, or logs;
- signed feed verification fails on any untrusted key or byte change;
- retention, deletion, correction, abuse, recovery, and incident procedures
  have named owners and observed rehearsal evidence; and
- the public UI accurately distinguishes local preview, submitted,
  quarantined, reviewed, published, and feed-visible states.

## Open Decisions

- the production identity provider and named reviewer/publisher owners;
- the invitation issuance and revocation operator;
- exact quotas and invited-cohort size;
- retention, deletion, backup, legal-hold, and jurisdiction policy;
- the production D1/account boundary and recovery owner;
- the release and feed signing key custodians and rotation cadence;
- the public service hostname, privacy notice, and incident contact; and
- whether anonymous public intake is ever proportionate after invited rollout.
