# Implementation Plan: Quarantined reporting core

## Selected Design And Constraints

Implement the strict domain state machine now, but keep public intake, reviewer
authentication, durable moderation storage, and feed serving disconnected.
Synthetic and local exercises remain ineligible by construction.

## Source Revision And Drift Check

The baseline is `5ba6e97095918d8877e1e12c98faabb3b81a869f`. The new pure
moderation module and tests are review-time drift shared by any later service
implementation; no network route is added.

## Affected Components

- `products/connector/issue-draft.ts`
- `products/connector/issue-review.ts`
- `products/connector/issue-moderation.ts`
- `products/connector/issue-publication.ts`
- `tests/issue-moderation.test.ts`

## Ordered Work Packages

1. Enforce public-web-only quarantine entry and a closed schema.
2. Enforce the moderation transition graph and monotonic timestamps.
3. Require a separate publication gate after `accepted_private`.
4. Project only minimized `published` records.
5. Before networking, add authenticated reviewer actions, durable append-only
   audit events, idempotency, quotas, retention/deletion, and incident controls.

## Compatibility And Migration

The existing synthetic local workbench does not enter this pipeline and needs
no migration. A later service must version its persistence schema and never
reinterpret old private records as published.

## Tactical Protections During Migration

Keep external intake and feed routes absent. Preserve no-free-text intake,
strict origin normalization, withheld-host default, and the required assurance
limitation on every record.

## Tests And Security Validation

Exercise every valid and invalid transition, unknown fields, non-public hosts,
synthetic/local contexts, timestamp rollback, consent, evidence basis, and feed
field exclusion. Add abuse and authorization tests only when real service
boundaries exist.

## Performance And Resource Benchmarks

Before rollout, measure intake validation latency, quarantine write latency,
review-list pagination, feed generation, storage growth, and rate-limit behavior
under burst and sustained load. No production workload has been supplied.

## Rollout And Rollback

Roll out behind an operator-only feature gate with feed serving disabled. A
rollback disables intake first, preserves quarantined evidence under the
approved retention rule, and leaves the last published feed immutable.

## Acceptance Criteria

- every accepted input starts quarantined;
- only authenticated human review can advance state;
- only `accepted_private` can advance to `published`;
- named hosts require explicit consent and reproduction-grade evidence;
- synthetic/local data and raw evidence cannot reach the feed; and
- retention, deletion, abuse, incident, and privacy controls are approved.

## Open Decisions

- identity provider and reviewer roles;
- durable store and immutable audit mechanism;
- retention/deletion periods;
- abuse escalation and reporter communication; and
- feed availability, signing, versioning, and correction policy.
