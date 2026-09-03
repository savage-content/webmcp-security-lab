# Private reporting reviewer workbench

## Status

This directory is a **source-ready, loopback-only reviewer checkpoint**. It is
not enabled on the public learning site, it is not a hosted review console, and
it does not prove that a production reviewer identity, privacy program, or
response operation exists.

The workbench gives an authorized human reviewer a scriptless local interface
for the existing private reporting API. It can:

- page the private quarantine queue;
- open one report through an opaque, one-use local link rather than putting a
  private report ID in browser history;
- revalidate the report's complete hash-linked ledger before showing actions;
- offer only the transitions allowed from the exact current revision; and
- consume one local action token before making one no-retry server-side request.

It cannot publish. `accepted_private` is a handoff state for a separately
authorized publisher, and the reviewer client rejects `published` before a
network request. The remote reviewer bearer remains in the local process and is
never returned to the browser, written to a URL, or logged by this code.

## Configuration

The default is disabled. Starting the workbench requires all three values:

```powershell
$env:LEFTOUT_REPORTING_REVIEWER_MODE = 'invited'
$env:LEFTOUT_REPORTING_REVIEWER_SERVICE_ORIGIN = 'https://reports.example.org'
$env:LEFTOUT_REPORTING_REVIEWER_TOKEN = '<reviewer bearer of 32–512 characters>'
npm run reporting:reviewer
```

The service origin must be a separate public HTTPS origin with no credentials,
port, path, query, or fragment. The public WebMCP learning lab, localhost,
private/special-use names, and IP literals are rejected. Partial configuration
is rejected even in disabled mode so an old endpoint or secret cannot remain
silently armed.

The process binds only to `127.0.0.1` by default and prints one short-lived,
single-use launch URL. That URL exchanges for an HttpOnly, SameSite=Strict local
session and immediately leaves browser history through a redirect. Every queue
link and state-change button uses a separate opaque token scoped to that local
session. Host-header checks, exact same-origin POST checks, no-store responses,
a script-free CSP, byte limits, closed form fields, output escaping, exact
revision binding, and no automatic retry all fail closed.

## Deliberate boundaries

- The browser never receives an invitation, reviewer, publisher, feed, or
  custodian credential.
- The workbench accepts no free text, uploads, evidence, contact data, actor
  identity, timestamps, publication metadata, or arbitrary destination.
- Queue pages show private reported origins because the authorized reviewer
  needs them; the interface explicitly warns against copying or transmitting
  that data.
- List data is strictly parsed, and a report's complete ledger is revalidated
  before any transition is offered.
- Remote strings are escaped as data. Unknown response fields, malformed
  ledgers, mismatched report identities, redirects, unsupported content types,
  oversized bodies, and instruction-shaped additions are rejected.
- A failed request consumes the local action. The reviewer must reload current
  state and make a fresh decision; the workbench never retries automatically.
- Publication, correction, retention, deletion, feed signing, backup, abuse,
  and incident workflows remain separate authorities and are not implemented
  by this reviewer process.

## Remaining release work

Before external reporting is enabled, a release owner must still establish and
rehearse production reviewer identity issuance, revocation, account recovery,
access review, device/browser policy, privacy operations, retention, abuse
response, backup/restore, publisher separation, correction, deletion, feed-key
custody, incident response, and support. A real keyboard and screen-reader
operator must complete the exact signed workbench candidate.

Run the focused source checks on Node.js 24:

```powershell
npm test -- tests/reporting-reviewer-access.test.ts tests/reporting-reviewer-client.test.ts tests/reporting-reviewer-workbench.test.ts tests/reporting-reviewer-server.test.ts
```

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
