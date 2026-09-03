# Local Guard platform and incident operations

## Release status

Local Guard has no approved ordinary-user platform combination. The only
observed browser-extension path is a dated Windows 11 x64 / Chrome 152
controlled developer preview using an unpacked extension and loopback HTTP.
That observation is not a signed-native-product result and does not generalize
to Chrome 153+, Edge, macOS, Linux, Android, ChatGPT, Codex, or any other
browser, agent, or session.

The machine-readable truth table is
`products/extension/release/platform-matrix.json`. A combination may move to
production-supported only after the exact signed extension, native host,
installer, browser version, operating-system version, and recovery path pass
retained acceptance evidence.

## Android boundary

Android remains JVM conformance only. No Android application, AppFunctions
metadata, device discovery, policy allowance, invocation, or user experience
has been built or observed. Shared policy vectors can inform a future native
prototype, but they are not Android support evidence.

## Incident response status

The source runbook in
`products/extension/release/incident-response.json` is fail-closed and
machine-checked. It covers extension authority drift, native-host compromise,
publisher/signing compromise, private-report exposure, and erroneous or
tampered public feed records. Containment closes the affected authority before
recovery; it never retries a site action or silently republishes data.

The runbook is deliberately `draft_unowned`. Release, security, privacy,
publisher, signing-key, and support owners are all null, no response-time
commitment is invented, and no operator rehearsal is claimed. Therefore the
release incident-response gate is `source_ready`, not `verified`.

## Default-safe posture

- Reporting remains disabled when unconfigured, and all six reporting gates
  remain off on the public lab.
- No Chrome Web Store item or production extension identity exists.
- No native host is installed or registered.
- There is no automatic retry, automatic issue transmission, automatic public
  disclosure, or automatic feed correction.
- Evidence collection excludes credentials, raw private reports, full page
  content, browser history, customer records, and user source code.
- Public history is corrected through an authorized append-only withdrawal,
  never by rewriting the signed prior record.

## Verification still required

Before either operations gate can become verified:

1. select exact supported platform/browser/version combinations;
2. assign named accountable owners and protected contact paths;
3. create and sign the exact extension, native host, and installer candidate;
4. rehearse clean install, update, rollback, removal, key rotation, emergency
   unregistration, reporting shutdown, private deletion, public withdrawal,
   backup handling, and recovery;
5. retain timestamps, versions, identities, hashes, observed outcomes, and
   owner approvals; and
6. repeat novice, keyboard, screen-reader, zoom, and hostile-input acceptance
   against the exact recovered candidate.

This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.
