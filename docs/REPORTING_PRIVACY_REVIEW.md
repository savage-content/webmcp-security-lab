# Reporting privacy and publication review

## Decision

**Pending accountable human approval.** The source boundary is suitable for a
disabled, invited-pipeline review, but external intake and publication are not
approved. No checked-in artifact supplies a lawful basis, jurisdiction,
retention decision, privacy owner, support owner, incident owner, or hostname.

## Purpose and scope

The proposed purpose is to receive a narrowly structured report about a
public HTTPS site's WebMCP security behavior, hold it in private quarantine,
and—only after separate human review and publication approval—project a
minimized record for security tooling and human awareness. Submission is not
authorization to test a site, access an account, contact a site owner, or make
an allegation of wrongdoing.

The application accepts exactly four submitter-selected fields:

- public HTTPS site origin;
- closed issue category;
- closed severity;
- closed observation stage.

It does not accept page paths, query strings, fragments, page content,
screenshots, payloads, responses, receipts, conversations, identities,
credentials, free text, private hosts, IP literals, synthetic lessons, or
local exercises. The service generates private report/event IDs, timestamps,
quota counters, reviewer state, and pseudonymous operator IDs.

## Processing and disclosure map

| Stage         | Data                                                                              | Visibility                               | Authority                                                |
| ------------- | --------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Local preview | One origin plus three closed choices                                              | Person and local connector               | No network send until one explicit action                |
| Intake        | Four-field envelope, server IDs/timestamps, invitation quota                      | Private service and authorized operators | Invited bearer; one idempotency key; no retry            |
| Review        | Private record and immutable moderation history                                   | Reviewer only                            | Closed transitions; no publication authority             |
| Publication   | Category, severity, stage, evidence basis, hostname visibility, optional hostname | Publisher and feed readers               | Exact accepted revision plus separate publisher approval |
| Correction    | Immutable withdrawal linked to the published digest                               | Feed readers                             | Custodian-only closed reason                             |
| Deletion      | Private record removal plus non-identifying tombstone                             | Custodian and retained audit             | Legal-hold and retention policy gate                     |

Cloudflare will necessarily process transport metadata such as source IP and
TLS/request metadata even though the application schema does not store it.
Worker logs, analytics sampling, D1 Time Travel, exports, backups, support
records, and abuse tooling can create additional copies. Their access,
retention, location, and deletion behavior require explicit review before any
real report is accepted.

## Risks requiring a human decision

1. A hostname in a public feed can create reputational harm even when the
   underlying report is mistaken, malicious, outdated, or incomplete.
2. A public origin or operator activity may be personal data depending on the
   site, submitter, jurisdiction, and surrounding records.
3. Private quarantine, provider backups, logs, and legal holds create deletion
   and data-subject obligations beyond application-row deletion.
4. Invitation and reviewer credentials can be abused to flood, inspect, or
   manipulate the private queue.
5. Signed feed integrity proves publisher-controlled bytes, not factual truth
   or independent validation.

## Required decisions before enablement

- name the privacy, security, service, support, data-custodian, reviewer,
  publisher, and signing-key owners;
- approve purpose, lawful basis, notice, jurisdiction, data location,
  retention period, provider-backup behavior, deletion and data-subject flow;
- define evidence thresholds, hostname consent, site-owner notice, dispute,
  correction, appeal, and emergency withdrawal standards;
- approve invitation issuance/revocation, abuse monitoring, rate limits,
  credential rotation, logging minimization, access review, and incident SLAs;
- rehearse intake, review, publication, correction, legal hold, deletion,
  backup restore/purge, key rotation, feed verification, containment, and
  rollback on an isolated service; and
- complete first-time operator, keyboard, screen-reader, zoom, and narrow-width
  acceptance against the exact production candidate.

Until those decisions are recorded as inspectable evidence, the service must
remain disabled and must not be described as privacy approved or production
ready.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
