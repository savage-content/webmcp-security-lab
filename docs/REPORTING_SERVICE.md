# Reporting service release boundary

## Current status

The reporting service is implemented as a **disabled-by-default, invited
private pipeline preview**. It is not enabled on the public learning site. The
public lab continues to work when every reporting setting is absent; in that
state intake, review, and publication routes return the same `404` response
as unavailable routes.

The local implementation currently provides:

- a four-field, closed public-web input contract: `siteOrigin`, `category`,
  `severity`, and `stage`;
- exact `application/json`, a 2 KiB decoded-body ceiling, and rejection of
  content encoding, browser-origin requests, unknown fields, private/local
  destinations, caller IDs, timestamps, state, and free text;
- one bearer invitation, a lowercase UUID idempotency key, constant-time token
  comparison, and distinct reviewer/publisher credential types;
- per-invitation and global hourly counters committed in the same D1 batch as
  a new report;
- unconditional `quarantined` entry, server-generated IDs and timestamps,
  versioned snapshots, hash-chained events, and optimistic revisions; and
- authenticated reviewer keyset reads and closed-graph transitions that reject
  caller-supplied actor, timestamp, state, and publication authority;
- a distinct publisher action that accepts only the exact
  `accepted_private` revision, re-runs the hostname/evidence projection gate,
  and atomically creates an immutable minimized publication record; and
- database constraints and triggers that reject state/hash drift, event or
  idempotency mutation, record deletion outside a future retention workflow,
  quota substitution, quota overflow, or publication mutation.

No retention/deletion/correction operation, signed feed, browser submission UI,
production identity integration, or production operations runbook exists yet.
Source code for a route is not evidence that the service is enabled.

## Configuration contract

All reporting settings are secrets or deployment controls and must be supplied
through the deployment environment. They must never be placed in source,
browser storage, URLs, screenshots, build artifacts, or client-side code.

With no `LEFTOUT_REPORTING_*` settings, the service is fully disabled. An
invited-intake deployment requires all of these explicit values:

| Setting                                          | Required value or boundary                                      |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `LEFTOUT_REPORTING_MODE`                         | `invited`                                                       |
| `LEFTOUT_REPORTING_INTAKE`                       | `true`                                                          |
| `LEFTOUT_REPORTING_MODERATION`                   | `false` until reviewer identity and operations are approved     |
| `LEFTOUT_REPORTING_PUBLICATION`                  | `false` until publisher identity and operations are approved    |
| `LEFTOUT_REPORTING_FEED`                         | `false`; current code rejects attempts to enable it              |
| `LEFTOUT_REPORTING_INVITATION_ID`                | Opaque normalized identifier beginning with `invitation.`        |
| `LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256`          | Lowercase SHA-256 of a randomly generated 32–512 character token |
| `LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT`      | Explicit positive integer, at most 1,000                         |
| `LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT`          | Explicit positive integer, at most 10,000 and not below per-invite |
| `LEFTOUT_REPORTING_ACTORS_JSON`                  | Omit while moderation is disabled                               |

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
6. a separately signed/versioned minimized feed, if a feed is still justified.

The first enabled deployment should use a separate service hostname and tiny
invited cohort. The learning-site reporting UI remains off until that service
has passed independent security, privacy, and accessibility review.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
