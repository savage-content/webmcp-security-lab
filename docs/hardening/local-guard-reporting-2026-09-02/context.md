# Hardening evidence context

This derived review covers the Local Guard and reporting boundaries at source
revision `5ba6e97095918d8877e1e12c98faabb3b81a869f`, plus the reversible packaging,
accessibility, and moderation-core changes made while preparing this review.
The target tree was clean at `5ba6e97`; the added files are implementation
prerequisites, not evidence that a signed extension or hosted intake exists.

Collection digest: `sha256:86005e8d35bb6900c5c166a40a40ecdacb451c956030a25a41b1958c5cea7157`

The digest is SHA-256 over newline-terminated, repository-relative
`path<TAB>sha256` records in the order below.

| Evidence  | Reader-facing title                        | Path                                      | SHA-256                                                            |
| --------- | ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| `E-LG-1`  | Exact MV3 authority                        | `products/extension/manifest.json`        | `1229ecaa390627e59f8eb5d411e6e2da3381db89f07037cfda94b0f89425363f` |
| `E-LG-2`  | Browser-side enforcement                   | `products/extension/background.js`        | `5236e6bf1741a8f0fca7d3fd7ef97dc0089db16f66e0f5c28e64760b72dba343` |
| `E-LG-3`  | Local Guard novice surface                 | `products/extension/popup.html`           | `54ce35f9e605afdd0979f45fe066c7de73cf2b554ca593c2bf9df3275b4eef9a` |
| `E-LG-4`  | Local Guard responsive/focus styles        | `products/extension/popup.css`            | `5a65b22840d9aef9ce38f80663d1800ffc73f7bb65e9c3cfbe7743c0cb3d6b0f` |
| `E-RP-1`  | Loopback connector and local report routes | `products/connector/server.ts`            | `25021d6399f5ac3e03927caa6a8d1c8f97c12a08c598d114306569ab1cc03d80` |
| `E-RP-2`  | Strict privacy-safe draft                  | `products/connector/issue-draft.ts`       | `57117b55080d51ff9bf9c939f176fa73376018bb9a0ed0386bfd73cc623ab1cb` |
| `E-RP-3`  | Session-scoped local review list           | `products/connector/issue-review.ts`      | `c8d818d0adfc94638f2edae42e07fe08fec8c524a68e8b2f78c0e055a7cba82e` |
| `E-RP-4`  | Human-gated feed projection                | `products/connector/issue-publication.ts` | `288b3cd49e4b652f9b1ceba27e9dd1dced07d4c0566e896da2a3b7a40b246df4` |
| `E-RP-5`  | Quarantined moderation state machine       | `products/connector/issue-moderation.ts`  | `409620d565fde32d285a8eea833f87a555193c67a46da1708a670490a43bf310` |
| `E-RP-6`  | Fail-closed service configuration          | `products/reporting-service/config.ts`    | `66ee5db7d8e4d2722b8dad5c2576b0c4e011b8243e00b87403ee288c8b8b174b` |
| `E-RP-7`  | Role-separated service authentication      | `products/reporting-service/auth.ts`      | `00c2f4ab564b523b2fd82690a314a560f949dd32759d3f68fb69178db57377bf` |
| `E-RP-8`  | Revisioned hash-chained moderation ledger  | `products/reporting-service/ledger.ts`    | `5e990417cae2b4970f135a7cb4b69eaa1e94397a01cfc1e92a83aea32735eeb8` |
| `E-RP-9`  | Durable optimistic D1 store                | `products/reporting-service/store.ts`     | `04f6ae232083679c7b534b984a6cf2e2fb656715f587615135e454c2123a7a8f` |
| `E-LG-5`  | Reproducible package gate                  | `scripts/package-local-guard.mts`         | `49fd9f1eb6614d92bfc3327b48f07fcd8ac21ae96b46cfc1236eb30c4cf123a0` |
| `E-LG-6`  | Detached release attestation gate          | `scripts/attest-local-guard-release.mts`  | `cd791821cd7ea10e5fde05ff9042f9d5df518990a389477c82a89c4d050987c8` |
| `E-RP-10` | Durable reporting schema                   | `db/schema.ts`                            | `8a6004ffebd69b3ecdf1bc5cf2614697ea9cb0fce360f7a5634ed2cfa4e2fcd6` |
| `E-RP-11` | Fail-closed reporting migration            | `drizzle/0002_furry_miss_america.sql`     | `4aeb9dc74a5a2d55670c1a3849cc30586f59e6e212c9070178386fdb286ca0e4` |
| `E-DOC-1` | Product acceptance and privacy boundary    | `docs/PRODUCT.md`                         | `56c4e06959e84c23b8b9ab39cf7555ffced7a6f04250a583aac5a13eb194afa7` |
| `E-DOC-2` | Current threat model                       | `docs/THREAT_MODEL.md`                    | `08ebd4a37d6951d4e3fd72831472a5900ab4a241fe7173bf825e336fbb55d04d` |
| `E-DOC-3` | Local Guard release boundary               | `docs/LOCAL_GUARD_RELEASE.md`             | `a63a1734bbbf11aa710e5d6d17f7159225e43ff35e24ac0a9bbcd30dbce7a0e5` |

Evidence limitations: no signed extension identity, native-messaging host,
production identity provider, external moderation service, production data,
latency benchmark, independent accessibility participant, or retained screen
reader transcript was available. We therefore keep product claims local and
label the public-service architecture as proposed.
