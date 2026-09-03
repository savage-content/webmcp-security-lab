# Reporting service release boundary

## Current status

The reporting service is implemented as a **disabled-by-default, invited
private pipeline preview**. It is not enabled on the public learning site. The
public lab continues to work when every reporting setting is absent; in that
state intake, review, publication, feed, lifecycle, and correction routes return
the same `404` response as unavailable routes.

A separate standalone Worker entry now routes only those reporting endpoints
and serves no learning-site assets, health page, or generic application route.
Its checked-in Wrangler template is intentionally non-routable, uses a
placeholder D1 identity, and fixes reporting to `disabled`; Wrangler dry-run
bundling and an explicit reporting-readiness assessor are part of the normal
verification gate. This is deployability evidence, not an enabled service.

The local implementation currently provides:

- a scriptless loopback composer that derives one paired public HTTPS origin
  server-side, accepts only category, severity, and stage as closed choices,
  and shows the exact four-field envelope before any send authority exists;
- a disabled-by-default server-to-server relay that keeps its invitation
  credential out of browser HTML, storage, URLs, and logs; consumes one-use
  submit authority before the request; never retries automatically; rejects
  redirects; and treats the bounded service receipt as untrusted data;
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
- a separate scriptless, loopback-only reviewer workbench that keeps the
  reviewer bearer server-side, hides private report IDs behind opaque one-use
  local links, revalidates the full ledger before offering a transition, and
  consumes exact revision-bound actions before one no-retry request;
- a distinct publisher action that accepts only the exact
  `accepted_private` revision, re-runs the hostname/evidence projection gate,
  and atomically creates an immutable minimized publication record;
- a separately authenticated, bounded JSON/NDJSON snapshot feed that exposes
  only public event IDs and minimized publication fields, signs the exact bytes
  with externally supplied Ed25519 material, and identifies the fingerprint
  clients must verify through a separate trust channel; and
- an optional lifecycle gate that atomically assigns an immutable retention
  deadline at intake, gives a separate custodian an idempotent,
  optimistic-revision legal-hold operation, and permits a controlled private
  deletion only after an exact current-state authorization;
- an atomic deletion workflow that blocks legal holds, distinguishes retention
  expiry from a data-subject request, removes private records and lookup links,
  preserves any immutable public projection, and emits an immutable,
  non-identifying tombstone; and
- a separately gated custodian correction action that can append one immutable
  withdrawal to an exact public publication digest without rewriting that
  publication or recovering a deleted private report; and
- database constraints and triggers that reject state/hash drift, event or
  idempotency mutation, deletion outside the controlled retention workflow,
  stale or held deletion authorization, retention-chain mutation, tombstone
  mutation, quota substitution, quota overflow, publication mutation,
  correction/publication mismatch, or correction mutation.

No hosted learning-site submission UI, hosted operator console, backup purge,
production identity integration, production signing-key custodian, or
independent fingerprint publication exists yet. The local composer is available only through an
authenticated, pairing-bound loopback report session; it is not an Internet
form. The local reviewer workbench is a separate source-only process; it is not
served by the public application and cannot publish. A source-only incident
runbook now records fail-closed containment, but every accountable owner is
null and no operator rehearsal or response-time commitment exists. The relay,
reviewer workbench, correction operation, and full submission path are
source-tested only and have not passed an operator rehearsal. Source code for a
route or interface is not evidence that the service is enabled.

The pending privacy and publication review is recorded in
`docs/REPORTING_PRIVACY_REVIEW.md`. It identifies application fields, provider
metadata, disclosure stages, reputational risk, and the accountable decisions
that must be approved before the `privacy_approval` gate can move from
`missing`.

## Configuration contract

All reporting settings are deployment controls and must be supplied through
the deployment environment. Bearers and private signing material are secrets;
they must never be placed in source, browser storage, URLs, screenshots, build
artifacts, or client-side code. Public signing material is not secret, but its
fingerprint must also be distributed through a separately trusted channel.

With no `LEFTOUT_REPORTING_*` settings, the service is fully disabled. An
invited-intake deployment requires the applicable explicit values below. The
correction gate safely defaults to `false` only to permit an existing disabled
deployment to upgrade; an operator must set it explicitly before enablement.

The standalone source checkpoint can be checked without creating or modifying
Cloudflare resources:

```powershell
npm run reporting:readiness
npm run reporting:worker:check
```

The first command validates the complete gate ledger and writes a local report.
The second performs an offline Wrangler dry-run bundle from the deliberately
disabled template. `npm run reporting:release-gate` is the strict operational
gate and must fail until every external gate is independently verified.

| Setting                                                   | Required value or boundary                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `LEFTOUT_REPORTING_MODE`                                  | `invited`                                                                                 |
| `LEFTOUT_REPORTING_INTAKE`                                | `true`                                                                                    |
| `LEFTOUT_REPORTING_MODERATION`                            | `false` until reviewer identity and operations are approved                               |
| `LEFTOUT_REPORTING_PUBLICATION`                           | `false` until publisher identity and operations are approved                              |
| `LEFTOUT_REPORTING_FEED`                                  | `false` until feed identity, key custody, and operations are approved                     |
| `LEFTOUT_REPORTING_LIFECYCLE`                             | `true` only with approved retention policy and custodian operations                       |
| `LEFTOUT_REPORTING_CORRECTION`                            | `true` only with approved publication-correction policy and custodian operations          |
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

### Loopback relay configuration

The connector-side reporting client is separately disabled unless all three
values below are supplied to the connector process. Partial or disabled
configuration containing a destination or credential is rejected. These are
operator secrets and controls, not browser or public-site settings.

| Setting                                        | Required value or boundary                                      |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `LEFTOUT_CONNECTOR_REPORTING_MODE`             | `invited`; otherwise absent or `disabled`                       |
| `LEFTOUT_CONNECTOR_REPORTING_ENDPOINT`         | Exact public HTTPS URL ending in `/api/reports/intake`          |
| `LEFTOUT_CONNECTOR_REPORTING_INVITATION_TOKEN` | Header-safe 32–512 character invitation bearer held server-side |

The composer is offered only for an exact paired public HTTPS origin. The
synthetic public lab, local/private names, IP literals, non-HTTPS pages, full
page paths, queries, and fragments are ineligible. A successful remote receipt
must match the exact response schema, quarantine state, first revision, and
mandatory assurance limitation. The loopback page shows only the bounded
receipt metadata and deliberately does not echo the reported origin.

### Loopback reviewer workbench configuration

The reviewer workbench is a different local process and authority from both
the submitter connector and the publisher. It remains disabled unless all
three settings are present. The public learning origin, local/private names,
IP literals, ports, paths, queries, fragments, and partial configuration are
rejected.

| Setting                                     | Required value or boundary                                |
| ------------------------------------------- | --------------------------------------------------------- |
| `LEFTOUT_REPORTING_REVIEWER_MODE`           | `invited`; otherwise absent or `disabled`                 |
| `LEFTOUT_REPORTING_REVIEWER_SERVICE_ORIGIN` | Separate credential-free public HTTPS origin              |
| `LEFTOUT_REPORTING_REVIEWER_TOKEN`          | Header-safe 32–512 character reviewer bearer, server-side |

`npm run reporting:reviewer` binds only to loopback and prints one
short-lived launch URL. That launch exchanges for an HttpOnly,
SameSite=Strict session. Private report IDs and queue cursors stay behind
session-scoped opaque links; the browser never receives the remote reviewer
bearer. A reviewer can reach `accepted_private`, but publication still
requires the distinct publisher API and credential. See
`products/reporting-operator/README.md` for the exact source-only boundary.

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

The loopback reviewer workbench makes those same reviewer operations usable
without placing a bearer in browser storage or asking a human to construct
JSON. List responses are strictly parsed; each detail ledger is fully
revalidated before state-change buttons appear. Every button binds one report,
current revision, and allowed target state. Network failure consumes the local
action and requires a fresh queue reload; there is no automatic retry.

The separate publisher credential can call only
`POST /api/reports/publish/:reportId`. It requires the exact
`accepted_private` revision plus the bounded hostname-consent/evidence gate.
The D1 batch commits the publisher event, updated private ledger, and separate
immutable minimized publication row atomically. Exact request retries return
the existing publication; conflicting reuse is rejected.

## Signed feed request

The independent feed bearer can call
`GET /api/reports/feed?format=json|ndjson&limit=1..100`. The opaque cursor
continues a time-bounded snapshot. The version 2 timeline distinguishes
`publication` and `correction` entries. Publication entries contain only a
public event ID, publication time, record digest, and the already minimized
public record. Correction entries contain a correction ID, public ID, time,
closed action and reason, publication-record digest, and correction digest.
They never contain the private report ID, private origin, reviewer, publisher,
or custodian identity, source revision, raw evidence, receipts, or free text.

The response includes `Content-Digest`, Ed25519 signature, key ID, public SPKI,
and SPKI SHA-256 headers. The signature covers the exact response bytes. A
consumer must verify the signature against a fingerprint obtained through a
different trusted channel; the fingerprint returned beside the feed is
diagnostic metadata, not a trust root. Browser-origin requests and unknown
query authority are rejected.

## Public correction request

When correction is explicitly enabled, an authenticated custodian can call
`POST /api/reports/corrections/:publicId` with exact `application/json`, a
lowercase UUID idempotency key, no browser origin, and exactly `action` and
`reason`. The only action is `withdraw`; the closed reasons are
`consent_withdrawn`, `duplicate`, `erroneous_publication`, and
`evidence_invalidated`.

The handler binds the correction to the immutable publication's exact record
SHA-256, appends one self-hashed correction, and never updates or deletes the
publication. Exact request replay returns the same correction. Conflicting key
reuse and a second withdrawal are rejected. The correction remains public even
if the separately controlled private report is later deleted. Neither the
response nor feed exposes custodian identity or private linkage.

## Retention and legal-hold requests

When lifecycle is explicitly enabled, each newly created intake receives a
retention state and first hash-chained policy event in the same D1 batch as the
private report. An authenticated custodian can read that limited projection at
`GET /api/reports/lifecycle/:reportId` and set or clear its legal hold at
`POST /api/reports/lifecycle/:reportId`. The transition accepts only
`expectedRevision` and `legalHold`, requires a lowercase UUID idempotency key,
and cannot change policy, deadline, report content, moderation, or publication.

An authenticated custodian can request a controlled private deletion at
`POST /api/reports/lifecycle/:reportId/delete`. The request accepts only
`expectedRetentionRevision` and one closed reason:
`retention_expired` or `data_subject_request`. It requires exact JSON, a
lowercase UUID idempotency key, and no browser origin. A legal hold always
blocks deletion. Retention-expiry deletion is allowed only at or after the
stored deadline; a data-subject request may act earlier under custodian
authority.

The D1 batch writes one immutable tombstone, deletes the private moderation and
retention chains, removes intake idempotency and the private-to-public lookup
link, and then removes the transient deletion authorization. A previously
published, minimized public record is deliberately retained without a private
report lookup. The tombstone contains no private report ID, origin, draft, or
free text. It records only lifecycle proof fields and, when applicable, the
already-public publication ID. Exact request replay returns the same tombstone;
conflicting reuse is rejected.

This workflow does not purge provider backups or rewrite an erroneous public
record. The separately gated correction route can append a withdrawal to the
public timeline; it cannot erase history. Backup lifecycle and correction
operations rehearsal remain release blockers, and every reporting route
remains disabled and unconfigured on the public learning deployment.

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
5. correction ownership, erroneous-publication response, and retained
   end-to-end rehearsal evidence; and
6. feed-key custody, rotation, revocation, independent fingerprint publication,
   consumer verification, and emergency correction rehearsal, if a feed is
   still justified.

The first enabled deployment should use a separate service hostname and tiny
invited cohort. The learning-site reporting UI remains off until that service
has passed independent security, privacy, and accessibility review.

`products/reporting-worker/release-evidence.json` is the current gate ledger.
`products/reporting-worker/wrangler.disabled.example.json` must never be
relabelled as production configuration: it has neither a real database nor a
route, and it intentionally cannot accept a report.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
