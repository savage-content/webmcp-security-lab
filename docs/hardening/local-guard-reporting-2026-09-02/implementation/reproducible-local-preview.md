# Implementation Plan: Reproducible Local Guard preview

## Selected Design And Constraints

The current deliverable remains a local developer preview. It keeps the exact
loopback boundary and adds deterministic packaging and integrity metadata. It
does not claim signing, store distribution, native-host isolation, or a
production authentication boundary.

## Source Revision And Drift Check

The baseline is `5ba6e97095918d8877e1e12c98faabb3b81a869f`. The package gate,
accessibility contract, and related tests are deliberate review-time drift and
must be revalidated and committed together.

## Affected Components

- `products/extension/`
- `scripts/package-local-guard.mts`
- `tests/local-guard-package.test.ts`
- `products/connector/`

## Ordered Work Packages

1. Deterministically package only reviewed runtime files.
2. Reject permission, host, service-worker, popup-reference, symlink, or
   dynamic-code drift.
3. Emit per-file and archive SHA-256 metadata.
4. Run the packaged extension through the five-lesson fresh-profile suite.
5. Design signed extension and native-host installation as a separate release.

## Compatibility And Migration

The ZIP uses stored entries and fixed timestamps for reproducibility. Unpacked
development remains supported. A native-host release will require new install,
update, uninstall, and browser-policy documentation.

## Tactical Protections During Migration

Keep `activeTab`, exact loopback hosts, document binding, closed tool families,
consume-before-execute, no automatic retry, and post-navigation revocation.

## Tests And Security Validation

Run `npm run local-guard:package`, `npm run verify`, inspect the generated
release manifest, and repeat the real Chrome five-lesson path from a fresh
profile. Reject any permission or archive-content delta not explained in the
release review.

## Performance And Resource Benchmarks

Measure connector startup time, idle memory, one-second HUD polling overhead,
and receipt-commit latency against the current unpacked baseline. No budget has
yet been approved.

## Rollout And Rollback

Publish the ZIP only as a versioned preview with its SHA-256. Rollback means
removing that preview artifact and returning testers to the reviewed unpacked
directory; it must not silently reuse a stale pairing.

## Acceptance Criteria

- identical source inputs produce byte-identical ZIPs;
- the archive contains only the runtime allowlist;
- permission and host authority match the reviewed manifest;
- no remote or dynamic code is packaged;
- fresh-profile Local Guard and accessibility acceptance pass; and
- documentation says preview, unsigned, local-only, and client-scoped.

## Open Decisions

- signing/store identity;
- native-messaging versus retained loopback bridge;
- updater and revocation ownership; and
- supported Chromium versions and enterprise policy.
