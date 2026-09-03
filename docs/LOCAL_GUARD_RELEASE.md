# Local Guard release channel

## Current status

Local Guard `0.3.0` is a deterministic developer-preview ZIP. The repository
can now create and verify a detached Ed25519 release-integrity attestation, but
no production release key is configured and the extension has not been signed
or approved by the Chrome Web Store. A self-verifying attestation is not a
publisher identity, installation policy, or safe update channel.

The source now also contains a versioned pre-inspection privacy choice, public
overview/privacy/support routes, conservative Web Store disclosure copy, and a
machine-readable release-gate ledger. These are submission prerequisites, not
evidence that the routes are deployed or the store approved the extension.

An additional source checkpoint now implements exact extension-origin binding,
strict native-message schemas and framing, a no-retry browser client, an
authenticated replay-resistant named-pipe channel, a connector adapter that
keeps bridge credentials server-side, a connector mode with no browser HTTP
bridge, and a non-mutating Windows installation plan. A separate deterministic
`0.4.0` source candidate now wires the service worker and popup to native
messaging and has no browser host permissions. It still has no signed
executable, installed host manifest, protected install secret, or verified pipe
ACL, and performs no host or registry installation. Accordingly, the native
identity and secure-transport gates are `source_ready`, not `verified`; the
shipping `0.3.0` preview still uses loopback HTTP.

The loopback connector also contains a scriptless four-field public-report
review flow and a disabled-by-default invited server-to-server relay. It keeps
the reporting credential out of the browser and never retries a failed send.
This is source evidence only: the public learning deployment has no reporting
destination, and reporting remains blocked on privacy, identity, operations,
retention, abuse, incident, and rehearsal ownership.

## Native-host migration checkpoint

The source under `products/native-host` follows Chrome's current native
messaging contract: an exact non-wildcard `allowed_origins` extension identity,
caller-origin verification, standard-input/standard-output message framing,
native-endian 32-bit lengths, and a one-MiB host-to-Chrome response limit. The
browser client exposes only `pair`, `poll`, `result`, `revoke`, and
`report-link`, correlates every response to one UUID, and never retries a native
request.

The connector-side source boundary now uses an HMAC-authenticated,
timestamped, nonce-bound, replay-limited Windows named-pipe protocol. Its
native-only mode will not listen on the browser HTTP bridge. Product integration
now has a separately packaged source candidate with `nativeMessaging` and no
browser bridge host permissions. Product release still requires a signed native
binary, protected install-scoped secret and verified pipe ACL, exact store ID,
privileged installer/updater/uninstaller, crash and rollback handling, and
signed-candidate acceptance. See
`products/native-host/README.md`.

## Package the reviewed bytes

Use Node.js 24 from a clean checkout:

```powershell
npm ci
npm test
npm run local-guard:package
npm run local-guard:native-candidate
```

The packaging command allowlists every runtime file and exact Manifest V3
permission, rejects symlinks and dynamic code, and produces the ZIP, release
manifest, and SHA-256 file under `outputs/local-guard/`.

The native-candidate command substitutes
`products/extension/manifest.native-candidate.json` as the packaged
`manifest.json`, requires `nativeMessaging`, rejects every browser host
permission, and writes a deterministic source-review ZIP and release manifest
under `outputs/local-guard-native-candidate/`. That output is deliberately
unsigned and is not an installable product release without the exact signed
host, store identity, installer, and external acceptance evidence.

## Create a release-integrity attestation

The release operator must supply an Ed25519 private key from an approved secret
store. Never generate or retain that key in this repository, the package
directory, shell history, CI logs, or the public site.

```powershell
npm run local-guard:attest -- sign --archive outputs/local-guard/leftout-local-guard-0.3.0.zip --release outputs/local-guard/leftout-local-guard-0.3.0.release.json --private-key C:\path\outside\the\repository\local-guard-release-key.pem
```

Before signing, the command independently rebuilds the ZIP and release manifest
from `products/extension` and requires byte-identical output. The attestation
then signs a domain-separated payload containing the exact release manifest
digest, archive digest, and archive size. It embeds the public key for
cryptographic verification and records that it does **not** establish Chrome
publisher identity or Chrome Web Store signing. Use `--extension` only when the
reviewed source is intentionally located elsewhere.

## Verify against an independently trusted key

Verification is meaningful only when the expected public key comes from a
separate trusted release channel. Do not trust the key embedded in the same
download by itself.

```powershell
npm run local-guard:attest -- verify --archive outputs/local-guard/leftout-local-guard-0.3.0.zip --release outputs/local-guard/leftout-local-guard-0.3.0.release.json --attestation outputs/local-guard/leftout-local-guard-0.3.0.attestation.json --trusted-public-key C:\path\to\trusted\local-guard-release-public-key.pem
```

The command fails if the trusted key, manifest, archive name, archive bytes,
size, hashes, contract fields, or signature differ.

## Rebuild the reviewed store graphics

The extension icons, 440×280 promotional tile, and 1280×800 listing screenshot
are generated from repository-owned sources:

```powershell
npm run local-guard:assets
```

The screenshot combines a real controlled-browser capture of the current lab
with the shipping popup HTML, CSS, JavaScript, validation, policy, and HUD code
rendered against a read-only fixture. The fixture permits consent lookup,
selected-tab lookup, and `get-active-status` only; it rejects every other
extension message and cannot invoke a site tool. Exact input and output hashes
are recorded in
`products/extension/release/assets/store-screenshot.provenance.json` and
verified by the test suite. Graphic completion does not imply publisher
verification, store review, signing, or ordinary-user distribution approval.

## Assess ordinary-user release readiness

Run the non-claiming assessment during normal verification:

```powershell
npm run local-guard:readiness
```

It validates that runtime consent, manifest authority, permission
justifications, data-use disclosure, privacy routes, declared graphic assets,
and the external evidence ledger agree. It writes a readiness report under
`outputs/local-guard/` and succeeds when the disclosure state is internally
consistent, even while external gates remain open.

The strict product gate is deliberately separate:

```powershell
npm run local-guard:release-gate
```

That command must fail until every required gate is independently evidenced,
the Chrome Web Store identity and signing fields are bound, the release uses an
identity-bound native channel, and ordinary-user distribution is explicitly
approved. Editing a status to `verified` without matching artifacts or runtime
configuration fails closed.

## External gates before ordinary-user distribution

The release is not product-ready until a human release owner completes and
records all of these external controls:

1. Establish and protect a persistent publisher identity and release key.
2. Complete Chrome Web Store developer verification, privacy disclosure,
   permissions justification, review, and store signing using the already
   verified listing assets.
3. Publish the trusted release-key fingerprint through an independently
   controlled channel and document key rotation and revocation.
4. Verify installation, update, rollback, disablement, and removal in every
   supported browser and operating system.
5. Replace the general loopback browser bridge with the approved native-host
   or equivalent identity-bound channel before calling Local Guard a consumer
   security boundary.
6. Complete first-time human, keyboard, screen-reader, 200% zoom, and 360 CSS
   pixel popup acceptance against the exact signed candidate.
7. Deploy and independently capture the exact public privacy, support, and
   homepage routes named in the store metadata.
8. Approve a supported browser/operating-system matrix, incident contact, and
   release rollback owner.
9. Approve and rehearse the explicit reporting relay, quarantine, reviewer,
   publisher, feed-signing, retention, correction, deletion, abuse, backup,
   support, and incident responsibilities before enabling external reports.

The release-gate sources are:

- `products/extension/release/store-submission.json` — listing, permission,
  data-use, remote-code, and current distribution disclosures;
- `products/extension/release/release-evidence.json` — explicit external gate
  status and inspectable evidence paths; and
- `products/extension/release/platform-matrix.json` and
  `incident-response.json` — explicit unsupported combinations, default-off
  controls, owner gaps, and recovery gates; and
- `docs/LOCAL_GUARD_PRIVACY_REVIEW.md` — reviewed privacy and store rationale.

Until those gates pass, distribute the ZIP only to controlled testers and call
it an unsigned developer preview.
