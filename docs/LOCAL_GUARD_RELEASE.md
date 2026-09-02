# Local Guard release channel

## Current status

Local Guard `0.3.0` is a deterministic developer-preview ZIP. The repository
can now create and verify a detached Ed25519 release-integrity attestation, but
no production release key is configured and the extension has not been signed
or approved by the Chrome Web Store. A self-verifying attestation is not a
publisher identity, installation policy, or safe update channel.

## Package the reviewed bytes

Use Node.js 24 from a clean checkout:

```powershell
npm ci
npm test
npm run local-guard:package
```

The packaging command allowlists every runtime file and exact Manifest V3
permission, rejects symlinks and dynamic code, and produces the ZIP, release
manifest, and SHA-256 file under `outputs/local-guard/`.

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

## External gates before ordinary-user distribution

The release is not product-ready until a human release owner completes and
records all of these external controls:

1. Establish and protect a persistent publisher identity and release key.
2. Complete Chrome Web Store developer verification, privacy disclosure,
   permissions justification, listing review, and store signing.
3. Publish the trusted release-key fingerprint through an independently
   controlled channel and document key rotation and revocation.
4. Verify installation, update, rollback, disablement, and removal in every
   supported browser and operating system.
5. Replace the general loopback browser bridge with the approved native-host
   or equivalent identity-bound channel before calling Local Guard a consumer
   security boundary.
6. Complete first-time human, keyboard, screen-reader, 200% zoom, and 360 CSS
   pixel popup acceptance against the exact signed candidate.

Until those gates pass, distribute the ZIP only to controlled testers and call
it an unsigned developer preview.
