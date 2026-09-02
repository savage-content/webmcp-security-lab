# Hardening evidence context

This derived review covers the Local Guard and reporting boundaries at source
revision `5ba6e97095918d8877e1e12c98faabb3b81a869f`, plus the reversible packaging,
accessibility, and moderation-core changes made while preparing this review.
The target tree was clean at `5ba6e97`; the added files are implementation
prerequisites, not evidence that a signed extension or hosted intake exists.

Collection digest: `sha256:da46487619d70b374a4aa694cc1266fbb60cedff6814dfb336b0ace3a97f76cf`

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
| `E-RP-6`  | Fail-closed service configuration          | `products/reporting-service/config.ts`    | `28f16d9f5aa5cfc28458321b4597f36659ac87e1f14c8e54c8a6df18587fa18c` |
| `E-RP-7`  | Role-separated service authentication      | `products/reporting-service/auth.ts`      | `00c2f4ab564b523b2fd82690a314a560f949dd32759d3f68fb69178db57377bf` |
| `E-RP-8`  | Revisioned hash-chained moderation ledger  | `products/reporting-service/ledger.ts`    | `5e990417cae2b4970f135a7cb4b69eaa1e94397a01cfc1e92a83aea32735eeb8` |
| `E-RP-9`  | Durable optimistic D1 store                | `products/reporting-service/store.ts`     | `c32ec102bbb77c139ee3fe1a2aae0500c4c1fbf14f3ce63ac16a75621b40a69b` |
| `E-RP-12` | Strict invited intake handler              | `products/reporting-service/intake.ts`    | `a272f0734b280f7e17de34aa05e0935cea8de0eb7bef681479cfd0359869120a` |
| `E-RP-13` | Disabled-first intake route                | `app/api/reports/intake/route.ts`         | `afe68b9d32220c837bbab3cddec3ed744322f0cdcf350aa4a2d2ebdcc3a82acb` |
| `E-LG-5`  | Reproducible package gate                  | `scripts/package-local-guard.mts`         | `49fd9f1eb6614d92bfc3327b48f07fcd8ac21ae96b46cfc1236eb30c4cf123a0` |
| `E-LG-6`  | Detached release attestation gate          | `scripts/attest-local-guard-release.mts`  | `cd791821cd7ea10e5fde05ff9042f9d5df518990a389477c82a89c4d050987c8` |
| `E-RP-10` | Durable reporting schema                   | `db/schema.ts`                            | `f479c087491f6b99a3554e420fa4d45661cdcfe29ba79d4869f8df25f87af5e9` |
| `E-RP-11` | Fail-closed reporting migration            | `drizzle/0002_furry_miss_america.sql`     | `4aeb9dc74a5a2d55670c1a3849cc30586f59e6e212c9070178386fdb286ca0e4` |
| `E-RP-14` | Quota enforcement migration                | `drizzle/0003_mixed_nightmare.sql`        | `e3b272c7f2397a04b8305ee692bf56ef1b270f69e15335aadb7c0e408efafebe` |
| `E-DOC-1` | Product acceptance and privacy boundary    | `docs/PRODUCT.md`                         | `20b68984589a617478a75f94bae8ffc1ff459a46f31a713f05e0ad466bc9da68` |
| `E-DOC-2` | Current threat model                       | `docs/THREAT_MODEL.md`                    | `49463eaf00d3c87b3184fb69172ad75e94648a27e65b029d806540cab30f1334` |
| `E-DOC-3` | Local Guard release boundary               | `docs/LOCAL_GUARD_RELEASE.md`             | `a63a1734bbbf11aa710e5d6d17f7159225e43ff35e24ac0a9bbcd30dbce7a0e5` |
| `E-DOC-4` | Reporting service release boundary         | `docs/REPORTING_SERVICE.md`               | `556f2f613e8bfab9fcd4df9f9a3dab4075cdfd0881e4170b47db8a085e01056d` |

Evidence limitations: no signed extension identity, native-messaging host,
production identity provider, external moderation service, production data,
latency benchmark, independent accessibility participant, or retained screen
reader transcript was available. We therefore keep product claims local and
label the public-service architecture as proposed.
