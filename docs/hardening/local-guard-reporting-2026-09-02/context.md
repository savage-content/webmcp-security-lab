# Hardening evidence context

This derived review covers the Local Guard and reporting boundaries at source
revision `5ba6e97095918d8877e1e12c98faabb3b81a869f`, plus the reversible packaging,
accessibility, and moderation-core changes made while preparing this review.
The target tree was clean at `5ba6e97`; the added files are implementation
prerequisites, not evidence that a signed extension or hosted intake exists.

Collection digest: `sha256:65ec09fdf593642f443798976b5dd0466184a0eafa95851de8e33b8dddc3267f`

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
| `E-RP-4`  | Human-gated feed projection                | `products/connector/issue-publication.ts` | `6b73993d458f1d2306020fb419a16979028e7a71ccf78412b2a6e3555ac94ac3` |
| `E-RP-5`  | Quarantined moderation state machine       | `products/connector/issue-moderation.ts`  | `2cdaf9ae6cad2adcc95fac4add0955bb1cc96b7daa3434df2e93ffb6e24776c3` |
| `E-RP-6`  | Fail-closed service configuration          | `products/reporting-service/config.ts`    | `28f16d9f5aa5cfc28458321b4597f36659ac87e1f14c8e54c8a6df18587fa18c` |
| `E-RP-7`  | Role-separated service authentication      | `products/reporting-service/auth.ts`      | `00c2f4ab564b523b2fd82690a314a560f949dd32759d3f68fb69178db57377bf` |
| `E-RP-8`  | Revisioned hash-chained moderation ledger  | `products/reporting-service/ledger.ts`    | `5e990417cae2b4970f135a7cb4b69eaa1e94397a01cfc1e92a83aea32735eeb8` |
| `E-RP-9`  | Durable optimistic D1 store                | `products/reporting-service/store.ts`     | `bd99ee7477b5b8115b787fa971ffa1d705284db02c1c629f13c971c3fe5bb94f` |
| `E-RP-12` | Strict invited intake handler              | `products/reporting-service/intake.ts`    | `a272f0734b280f7e17de34aa05e0935cea8de0eb7bef681479cfd0359869120a` |
| `E-RP-13` | Disabled-first intake route                | `app/api/reports/intake/route.ts`         | `afe68b9d32220c837bbab3cddec3ed744322f0cdcf350aa4a2d2ebdcc3a82acb` |
| `E-RP-15` | Authenticated reviewer handler             | `products/reporting-service/review.ts`    | `8bd5beea1da2a5f3617f3025e81c6d9c148a296681aea1cd99a8b488424a1892` |
| `E-RP-16` | Disabled-first reviewer list route         | `app/api/reports/review/route.ts`         | `70f4277c89c4b46f67a983fe88b2355ce89543771e0dbf57f3e7ae19e2cdb8d2` |
| `E-RP-17` | Disabled-first reviewer record route       | `app/api/reports/review/[reportId]/route.ts` | `ef6b412bdf061fbebb5f75402426032d8bb9e36727c68a9015eb6cb4e364e71e` |
| `E-RP-18` | Role-separated publisher handler           | `products/reporting-service/publish.ts`   | `106aec1ce8abee2425325996adf605a7760fb6ffc708d3453da26236aab18ef1` |
| `E-RP-19` | Disabled-first publication route           | `app/api/reports/publish/[reportId]/route.ts` | `b346e82a3572b4dc30a5572799a79a3afa1c154bbad23c45f8bafd9edda8eefb` |
| `E-LG-5`  | Reproducible package gate                  | `scripts/package-local-guard.mts`         | `49fd9f1eb6614d92bfc3327b48f07fcd8ac21ae96b46cfc1236eb30c4cf123a0` |
| `E-LG-6`  | Detached release attestation gate          | `scripts/attest-local-guard-release.mts`  | `cd791821cd7ea10e5fde05ff9042f9d5df518990a389477c82a89c4d050987c8` |
| `E-RP-10` | Durable reporting schema                   | `db/schema.ts`                            | `6357dbbb16cba6cdea3b5d0fdbf5b9ec7c3e3991a11280ab7cf6eb90d14598b9` |
| `E-RP-11` | Fail-closed reporting migration            | `drizzle/0002_furry_miss_america.sql`     | `4aeb9dc74a5a2d55670c1a3849cc30586f59e6e212c9070178386fdb286ca0e4` |
| `E-RP-14` | Quota enforcement migration                | `drizzle/0003_mixed_nightmare.sql`        | `e3b272c7f2397a04b8305ee692bf56ef1b270f69e15335aadb7c0e408efafebe` |
| `E-RP-20` | Immutable publication migration            | `drizzle/0004_colossal_tenebrous.sql`     | `c6c3ff83430b3de8c7d8eaeb9661200ff8f3d9b0a575a13e7776dc77e1ec6a08` |
| `E-DOC-1` | Product acceptance and privacy boundary    | `docs/PRODUCT.md`                         | `68d2b37313fbdf522a987569673bc09c45969fb5c3c98ca0974cc66f64f4442b` |
| `E-DOC-2` | Current threat model                       | `docs/THREAT_MODEL.md`                    | `88f30d448e70ba2394873dc9ba20b13871c7924c608107298d1d41e80a5e03c4` |
| `E-DOC-3` | Local Guard release boundary               | `docs/LOCAL_GUARD_RELEASE.md`             | `a63a1734bbbf11aa710e5d6d17f7159225e43ff35e24ac0a9bbcd30dbce7a0e5` |
| `E-DOC-4` | Reporting service release boundary         | `docs/REPORTING_SERVICE.md`               | `2d02bbd0d439fb3f98ba043a1781590f509f389305e5982955a0f855f8907224` |

Evidence limitations: no signed extension identity, native-messaging host,
production identity provider, enabled external reporting service, production
data, retention/correction operation, signed feed, latency benchmark,
independent accessibility participant, or retained screen-reader transcript
was available. We therefore keep product claims local and label deployment and
operations as proposed.
