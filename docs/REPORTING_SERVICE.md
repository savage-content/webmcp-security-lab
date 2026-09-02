# Reporting service release boundary

## Current status

The reporting service is implemented as a **disabled-by-default, invited
private pipeline preview**. It is not enabled on the public learning site. The
public lab continues to work when every reporting setting is absent; in that
state intake, review, publication, feed, and lifecycle routes return the same `404`
response as unavailable routes.

The local implementation currently provides:

- a four-field, closed public-web input contract: `siteOrigin`, `category`,
  `severity`, and `stage`;
- exact `application/json`, a 2 KiB decoded-body ceiling, and rejection of
  content encoding, browser-origin requests, unknown fields, private/local
  destinations, caller IDs, timestamps, state, and free text;
- one bearer invitation, a lowercase UUID idempotency key, constant-time token
  comparison, and distinct reviewer/publisher/custodian credential types;
- per-invitation and global hourly counters committed in the same D1 batch as
  a new report;
- unconditional `quarantined` entry, server-generated IDs and timestamps,
  versioned snapshots, hash-chained events, and optimistic revisions;
- authenticated reviewer keyset reads and closed-graph transitions that reject
  caller-supplied actor, timestamp, state, and publication authority;
- a distinct publisher action that accepts only the exact
  `accepted_private` revision, re-runs the hostname/evidence projection gate,
  and atomically creates an immutable minimized publication record;
- a separately authenticated, bounded JSON/NDJSON snapshot feed that exposes
  only public event IDs and minimized publication fields, signs the exact bytes
  with externally supplied Ed25519 material, and identifies the fingerprint
  clients must verify through a separate trust channel; and
- an optional lifecycle gate that atomically assigns an immutable retention
  deadline at intake and gives a separate custodian an idempotent,
  optimistic-revision legal-hold operation; and
- database constraints and triggers that reject state/hash drift, event or
  idempotency mutation, record deletion outside a future retention workflow,
  retention-chain mutation, quota substitution, quota overflow, or publication
  mutation.

No controlled deletion, tombstone, backup purge, or public-correction operation,
browser submission UI, production identity integration, production signing-key
custodian, independent fingerprint publication, or production operations
runbook exists yet. Source code for a route is not evidence that the service is
enabled.

## Configuration contract

All reporting settings are deployment controls and must be supplied through
the deployment environment. Bearers and private signing material are secrets;
they must never be placed in source, browser storage, URLs, screenshots, build
artifacts, or client-side code. Public signing material is not secret, but its
fingerprint must also be distributed through a separately trusted channel.

With no `LEFTOUT_REPORTING_*` settings, the service is fully disabled. An
invited-intake deployment requires all of these explicit values:

| Setting                                                   | Required value or boundary                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `LEFTOUT_REPORTING_MODE`                                  | `invited`                                                                                 |
| `LEFTOUT_REPORTING_INTAKE`                                | `true`                                                                                    |
| `LEFTOUT_REPORTING_MODERATION`                            | `false` until reviewer identity and operations are approved                               |
| `LEFTOUT_REPORTING_PUBLICATION`                           | `false` until publisher identity and operations are approved                              |
| `LEFTOUT_REPORTING_FEED`                                  | `false` until feed identity, key custody, and operations are approved                     |
| `LEFTOUT_REPORTING_LIFECYCLE`                             | `true` only with approved retention policy and custodian operations                       |
| `LEFTOUT_REPORTING_INVITATION_ID`                         | Opaque normalized identifier beginning with `invitation.`                                 |
| `LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256`                   | Lowercase SHA-256 of a randomly generated 32–512 character token                          |
| `LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT`               | Explicit positive integer, at most 1,000                                                  |
| `LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT`                   | Explicit positive integer, at most 10,000 and not below per-invite                        |
| `LEFTOUT_REPORTING_ACTORS_JSON`                           | Closed reviewer, publisher, and/or custodian credential records required by enabled gates |
| `LEFTOUT_REPORTING_FEED_TOKEN_SHA256`                     | Required only when feed is `true`; distinct reader-token digest                           |
| `LEFTOUT_REPORTING_FEED_SIGNING_KEY_ID`                   | Required only when feed is `true`; normalized `feed.*` ID                                 |
| `LEFTOUT_REPORTING_FEED_SIGNING_PRIVATE_KEY_PKCS8_BASE64` | Required only when feed is `true`; Ed25519 PKCS#8 secret                                  |
| `LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SPKI_BASE64`   | Required only when feed is `true`; matching Ed25519 SPKI                                  |
| `LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SHA256`        | Required only when feed is `true`; matching lowercase digest                              |
| `LEFTOUT_REPORTING_RETENTION_DAYS`                        | Required only when lifecycle is `true`; integer from 1 through 3,650                      |
| `LEFTOUT_REPORTING_RETENTION_POLICY_VERSION`              | Required only when lifecycle is `true`; normalized `retention.*` ID                       |

The bearer itself is given only to the invited non-browser client. The stored
configuration and quota rows retain digests, not bearer material. Changing a
quota upward during an active window does not reset or widen that window.

## Intake request

An invited non-browser client sends one `POST /api/reports/intake` request with:

- `Authorization: Bearer <invitation>`;
- `Content-Type: application/json` with no parameters;
- `Idempotency-Key: <lowercase UUID>`; and
- exactly the four allowed JSON fields.

The response returns only report ID, quarantine state, revision, receipt time,
and whether the request was created or was an exact replay. It never echoes the
reported origin. A reused idempotency key with different canonical content is
rejected. Exact replay returns the original record and does not consume quota.

## Review and publication requests

An authenticated reviewer can page `GET /api/reports/review`, read one
`GET /api/reports/review/:reportId`, and submit one closed-graph transition to
`POST /api/reports/review/:reportId`. Transitions require an exact expected
revision and lowercase UUID idempotency key. Callers cannot supply actor
identity, timestamps, publication data, or undeclared fields, and reviewers
cannot publish.

The separate publisher credential can call only
`POST /api/reports/publish/:reportId`. It requires the exact
`accepted_private` revision plus the bounded hostname-consent/evidence gate.
The D1 batch commits the publisher event, updated private ledger, and separate
immutable minimized publication row atomically. Exact request retries return
the existing publication; conflicting reuse is rejected.

## Signed feed request

The independent feed bearer can call
`GET /api/reports/feed?format=json|ndjson&limit=1..100`. The opaque cursor
continues a time-bounded snapshot. Feed entries contain only a public event ID,
publication time, record digest, and the already minimized public record. They
never contain the private report ID, private origin, reviewer or publisher
identity, source revision, raw evidence, receipts, or free text.

The response includes `Content-Digest`, Ed25519 signature, key ID, public SPKI,
and SPKI SHA-256 headers. The signature covers the exact response bytes. A
consumer must verify the signature against a fingerprint obtained through a
different trusted channel; the fingerprint returned beside the feed is
diagnostic metadata, not a trust root. Browser-origin requests and unknown
query authority are rejected.

## Retention and legal-hold requests

When lifecycle is explicitly enabled, each newly created intake receives a
retention state and first hash-chained policy event in the same D1 batch as the
private report. An authenticated custodian can read that limited projection at
`GET /api/reports/lifecycle/:reportId` and set or clear its legal hold at
`POST /api/reports/lifecycle/:reportId`. The transition accepts only
`expectedRevision` and `legalHold`, requires a lowercase UUID idempotency key,
and cannot change policy, deadline, report content, moderation, or publication.

This is not yet a deletion system. The database still rejects private-record
deletion until a controlled purge, non-identifying tombstone, backup policy,
and public-record correction design are implemented and tested.

## Required enablement evidence

Do not enable an external cohort until all of the following have named owners
and retained rehearsal evidence:

1. privacy approval for purpose, notice, fields, destination, jurisdiction,
   retention, deletion, legal hold, and data-subject handling;
2. production D1 ownership, backups, restore testing, key rotation, monitoring,
   incident response, and rollback;
3. invitation issuance, revocation, rate-limit selection, abuse response, and
   support contact;
4. production reviewer/publisher identity, authorization, revocation, and
   role-separation rehearsal;
5. correction and erroneous-publication workflows; and
6. feed-key custody, rotation, revocation, independent fingerprint publication,
   consumer verification, and emergency correction rehearsal, if a feed is
   still justified.

The first enabled deployment should use a separate service hostname and tiny
invited cohort. The learning-site reporting UI remains off until that service
has passed independent security, privacy, and accessibility review.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
