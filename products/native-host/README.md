# Local Guard native-host boundary

## Status

This directory is a **source-ready transport checkpoint**, not an installed or
signed Local Guard host. The shipping `0.3.0` extension still uses the exact
loopback developer-preview transport. A separately selectable connector mode
now accepts the native host over authenticated Windows named-pipe IPC and does
not listen on the browser HTTP bridge. Nothing in this directory changes the
operating system, Chrome registry, installed extension, or public site.

The checkpoint implements the security-critical pieces that can be proven
before publisher and installer authority exists:

- exact binding to one Chrome Web Store extension ID and caller origin;
- strict, versioned `pair`, `poll`, `result`, `revoke`, and `report-link`
  messages with no arbitrary tool action;
- 32-bit native-endian length framing with split-frame, adjacent-frame,
  truncation, and byte-limit handling;
- a 512 KiB Local Guard request ceiling and Chrome's 1 MiB host-response
  ceiling;
- sequential request handling and exactly one correlated response per frame;
- a strict HMAC-SHA-256 IPC envelope with an install-scoped 32-byte secret,
  request identity, nonce, timestamp, bounded replay cache, and explicit
  big-endian framing;
- a Windows named-pipe namespace restricted in source to
  `\\.\pipe\leftout-local-guard-*`, one request per connection, bounded I/O,
  no automatic retry, and authenticated response binding;
- a connector adapter that retains bridge tokens server-side and maps only the
  five native actions to the existing coordinator, reporting ticket, and
  revocation boundaries;
- an integrated native-only connector mode that refuses to disable the HTTP
  browser bridge unless authenticated IPC is configured;
- a browser-side `sendNativeMessage()` client that rejects unknown fields,
  mismatched request IDs, host errors, and oversized responses, and never
  retries;
- a separately packaged `0.4.0` native candidate whose service worker and
  popup use that client only when `nativeMessaging` is declared, with no
  loopback browser host permissions;
- a non-mutating Windows installation plan that produces one exact host
  manifest and HKCU registry binding for a signed `.exe` and store extension
  ID; and
- a non-mutating Windows lifecycle planner for verified install, newer-version
  update, exact retained rollback, fail-closed removal, and receipt
  preservation.

The host name is fixed as `com.leftout.security.local_guard`. The checked-in
`manifest.template.json` uses an obvious placeholder extension ID and must
never be installed directly.

## Authority boundary

Chrome launches a native host only when the extension declares the
`nativeMessaging` permission and the installed native-host manifest lists the
exact `chrome-extension://<store-id>/` origin. Chrome also passes the calling
origin as the first host argument; the runtime verifies it again against the
release ID before reading a frame. Wildcards are rejected.

Standard output is reserved exclusively for framed protocol responses. Host
errors are bounded, flattened to one line, and correlated to the request. A
page cannot select the host name or add a native action because the service
worker owns the client and the action set is closed.

Current Chrome contract:

- <https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>

## What remains before signed integration

This checkpoint does **not** yet satisfy the ordinary-user release gate. The
following work remains:

1. Build and sign the native executable; publish and pin the exact store
   extension ID; generate the host manifest from those identities.
2. Provision the install-scoped IPC secret outside browser state and apply and
   verify an exact current-user named-pipe ACL in the signed host and connector
   processes. The source HMAC boundary does not itself prove operating-system
   peer identity or secret protection.
3. Implement the privileged Windows executor for the source-ready lifecycle
   plan, including crash-safe journaling, repair, and action-time human
   authorization, without deleting retained receipts.
4. Verify the exact signed candidate in supported Chrome/Windows versions,
   including hostile local requests, navigation, expiry, declaration drift,
   host loss, and no-retry delivery.

Until those steps pass, the current ZIP remains an unsigned developer preview
and `native_messaging_identity_channel` and `secure_local_transport` remain
`source_ready`, never `verified`.

## Tests

Run on Node.js 24:

```powershell
npm test -- tests/native-messaging.test.ts tests/native-transport.test.ts tests/native-host-install-plan.test.ts tests/native-host-lifecycle-plan.test.ts
npm test -- tests/native-ipc-protocol.test.ts tests/native-ipc-transport.test.ts tests/native-adapter.test.ts tests/connector-native-ipc.test.ts
npm run local-guard:native-candidate
```

The last command builds deterministic source-review artifacts under
`outputs/local-guard-native-candidate/`. It does not install, sign, attest, or
approve the candidate for ordinary-user distribution.

The Windows install-plan function returns data only. A future privileged
installer must require action-time authorization before writing files or the
registry and must independently verify the signed executable and extension
identity.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
