# Hardening evidence context

This derived review covers the Local Guard and reporting boundaries at source
revision `5ba6e97095918d8877e1e12c98faabb3b81a869f`, plus the reversible packaging,
accessibility, reporting, retention, and controlled-deletion changes made while
preparing this review. The target tree was clean at `5ba6e97`; the added files
are implementation evidence, not evidence that a signed extension or hosted
intake exists.

Collection digest: `sha256:86607efb77c72cf33cce81251f9d648b10a3a7e2f047f7c9d85b18907a12e781`

The digest is SHA-256 over newline-terminated, repository-relative
`path<TAB>sha256` records in the order below. Every inventoried source artifact
is decoded as UTF-8 and normalized to LF before its per-file hash is computed,
so an equivalent Windows checkout does not create false source drift.

| Evidence  | Reader-facing title                         | Path                                                   | SHA-256                                                            |
| --------- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `E-LG-1`  | Exact MV3 authority                         | `products/extension/manifest.json`                     | `1229ecaa390627e59f8eb5d411e6e2da3381db89f07037cfda94b0f89425363f` |
| `E-LG-2`  | Browser-side enforcement                    | `products/extension/background.js`                     | `fc20b9654a18f7c2ba3f896b5ea3c6a507188eb50e740ac63286767fde71dae9` |
| `E-LG-3`  | Local Guard novice and consent surface      | `products/extension/popup.html`                        | `23d5ec17a041dbc058d1e6c0b2ea280627917b7388c574604496c70276ad00c7` |
| `E-LG-4`  | Local Guard responsive/focus styles         | `products/extension/popup.css`                         | `63e41e93a4726a024309f9e97b7cfb674631487f4d0071301a827ef35fac34cc` |
| `E-LG-7`  | Consent-before-inspection runtime           | `products/extension/popup.js`                          | `b0e0a2bc8e10c2e4ab9313d2c896a1d5614a8cfac86c320c45cc96cc5b61e2a3` |
| `E-LG-8`  | Chrome Web Store disclosure contract        | `products/extension/release/store-submission.json`     | `0db0f7b6c72f61217192dc75022595172fdb58a9ca33f00424753092971fcd82` |
| `E-LG-9`  | Explicit external release-gate ledger       | `products/extension/release/release-evidence.json`     | `e2786b565077dfbaf855296834b0951023c027c18d65277f560f6da53a4e5372` |
| `E-LG-11` | Public Local Guard overview source          | `app/local-guard/page.tsx`                             | `6e224a2a7e20ba94c1287e28276d2f07306ad8ce2646b3bbceb231e876a6790a` |
| `E-LG-12` | Public Local Guard privacy source           | `app/local-guard/privacy/page.tsx`                     | `783761f805a2d520b2168a2e09a706ed438a53610d6af75febe9a0504161521c` |
| `E-LG-13` | Public Local Guard support source           | `app/local-guard/support/page.tsx`                     | `e2e74d93561021f92b4aaaa65fded63a066cda5ddb873f945a3ceb1c0f0e30cb` |
| `E-RP-1`  | Loopback connector and local report routes  | `products/connector/server.ts`                         | `25021d6399f5ac3e03927caa6a8d1c8f97c12a08c598d114306569ab1cc03d80` |
| `E-RP-2`  | Strict privacy-safe draft                   | `products/connector/issue-draft.ts`                    | `57117b55080d51ff9bf9c939f176fa73376018bb9a0ed0386bfd73cc623ab1cb` |
| `E-RP-3`  | Session-scoped local review list            | `products/connector/issue-review.ts`                   | `c8d818d0adfc94638f2edae42e07fe08fec8c524a68e8b2f78c0e055a7cba82e` |
| `E-RP-4`  | Human-gated feed projection                 | `products/connector/issue-publication.ts`              | `6b73993d458f1d2306020fb419a16979028e7a71ccf78412b2a6e3555ac94ac3` |
| `E-RP-5`  | Quarantined moderation state machine        | `products/connector/issue-moderation.ts`               | `2cdaf9ae6cad2adcc95fac4add0955bb1cc96b7daa3434df2e93ffb6e24776c3` |
| `E-RP-6`  | Fail-closed service configuration           | `products/reporting-service/config.ts`                 | `d81701800ff3ee4b87fbbc5261179a4199d736bc27853394af1bb0eb464084b8` |
| `E-RP-7`  | Role-separated service authentication       | `products/reporting-service/auth.ts`                   | `b7374e2b3b1034c7f70e8dc565ac7480e44f266bdfd3d8397c0c1e2b299ced99` |
| `E-RP-8`  | Revisioned hash-chained moderation ledger   | `products/reporting-service/ledger.ts`                 | `5e990417cae2b4970f135a7cb4b69eaa1e94397a01cfc1e92a83aea32735eeb8` |
| `E-RP-9`  | Durable optimistic D1 store                 | `products/reporting-service/store.ts`                  | `01158413f595ab44bd84ecfc2d9c4496683fc84f4b196c7df5c5361389e55d65` |
| `E-RP-28` | Closed deletion-tombstone core              | `products/reporting-service/deletion-core.ts`          | `3b08b15d4942369e64ffb16795dd9f855bb443d450828c18652efdb156659208` |
| `E-RP-29` | Custodian-only deletion handler             | `products/reporting-service/delete.ts`                 | `43b8d242ba180c03d65d188bf7bd93344de12165ff2e6b1f1e6e0b14ace27007` |
| `E-RP-32` | Closed immutable correction core            | `products/reporting-service/correction-core.ts`        | `2e17ec25f1c03cd9b9fd6254fa911d8a42e304a8002e57d508ea1959d376ad46` |
| `E-RP-33` | Custodian-only correction handler           | `products/reporting-service/correct.ts`                | `1976e54266b82e1ee46a93f8ff8d5171857ad3c8fd5afdcace833441d3eebd92` |
| `E-RP-12` | Strict invited intake handler               | `products/reporting-service/intake.ts`                 | `7f39c30467d5306afe9e05bcf75056a681cf4086c79fa360d74872b8c034cddd` |
| `E-RP-13` | Disabled-first intake route                 | `app/api/reports/intake/route.ts`                      | `afe68b9d32220c837bbab3cddec3ed744322f0cdcf350aa4a2d2ebdcc3a82acb` |
| `E-RP-15` | Authenticated reviewer handler              | `products/reporting-service/review.ts`                 | `8bd5beea1da2a5f3617f3025e81c6d9c148a296681aea1cd99a8b488424a1892` |
| `E-RP-16` | Disabled-first reviewer list route          | `app/api/reports/review/route.ts`                      | `70f4277c89c4b46f67a983fe88b2355ce89543771e0dbf57f3e7ae19e2cdb8d2` |
| `E-RP-17` | Disabled-first reviewer record route        | `app/api/reports/review/[reportId]/route.ts`           | `ef6b412bdf061fbebb5f75402426032d8bb9e36727c68a9015eb6cb4e364e71e` |
| `E-RP-18` | Role-separated publisher handler            | `products/reporting-service/publish.ts`                | `106aec1ce8abee2425325996adf605a7760fb6ffc708d3453da26236aab18ef1` |
| `E-RP-19` | Disabled-first publication route            | `app/api/reports/publish/[reportId]/route.ts`          | `b346e82a3572b4dc30a5572799a79a3afa1c154bbad23c45f8bafd9edda8eefb` |
| `E-RP-21` | Externally keyed Ed25519 feed signing       | `products/reporting-service/feed-signing.ts`           | `7eaf1438d71b869822568aedb189bfdf266e0a5c9047bb5f2e6863e8e96c2a38` |
| `E-RP-22` | Bounded minimized JSON/NDJSON feed          | `products/reporting-service/feed.ts`                   | `0c3dc1af7ac7be07497bf95588da9639a845f570b416fb5a764b5cbbed6339e2` |
| `E-RP-23` | Disabled-first signed feed route            | `app/api/reports/feed/route.ts`                        | `a7580a31cd75a7184c097649d3a50cc4cc530af40e51f5b9bcc8bc2c3862b3ad` |
| `E-RP-24` | Retention and legal-hold core               | `products/reporting-service/retention-core.ts`         | `fe17fc8c60f18342971bd5a1aa990ab5ee521c77b04b19744d68f6e2c78b1120` |
| `E-RP-25` | Custodian lifecycle handler                 | `products/reporting-service/lifecycle.ts`              | `b43eeac2f796da09ed59448ceb9f8c354bc67f10c679d81900f270deeb7ef540` |
| `E-RP-26` | Disabled-first lifecycle route              | `app/api/reports/lifecycle/[reportId]/route.ts`        | `b59243e251f079b93963190145513a22ce20337614c02b74f3979dc0b509949f` |
| `E-RP-30` | Disabled-first deletion route               | `app/api/reports/lifecycle/[reportId]/delete/route.ts` | `d117cd2e694c327e5ff8b0b80bcb0f535dd225e0534ae795e9513cb8d50469ec` |
| `E-RP-34` | Disabled-first public-correction route      | `app/api/reports/corrections/[publicId]/route.ts`      | `4ff9e07834d9741968215ecdd281a9f0a3a110f485eb5ab55ff141fe79110e5d` |
| `E-LG-5`  | Reproducible package gate                   | `scripts/package-local-guard.mts`                      | `49fd9f1eb6614d92bfc3327b48f07fcd8ac21ae96b46cfc1236eb30c4cf123a0` |
| `E-LG-6`  | Detached release attestation gate           | `scripts/attest-local-guard-release.mts`               | `cd791821cd7ea10e5fde05ff9042f9d5df518990a389477c82a89c4d050987c8` |
| `E-LG-10` | Fail-closed product-release assessor        | `scripts/assess-local-guard-release.mts`               | `acf0a29bafc4fb284029c0a94c26b72d4a3bed749532302e76d0181ae7988e01` |
| `E-RP-10` | Durable reporting schema                    | `db/schema.ts`                                         | `6f30399a4bac27fbd0ab52eebeaf8c300f500113c52c66d9c4f58e9b73e6349c` |
| `E-RP-11` | Fail-closed reporting migration             | `drizzle/0002_furry_miss_america.sql`                  | `4aeb9dc74a5a2d55670c1a3849cc30586f59e6e212c9070178386fdb286ca0e4` |
| `E-RP-14` | Quota enforcement migration                 | `drizzle/0003_mixed_nightmare.sql`                     | `e3b272c7f2397a04b8305ee692bf56ef1b270f69e15335aadb7c0e408efafebe` |
| `E-RP-20` | Immutable publication migration             | `drizzle/0004_colossal_tenebrous.sql`                  | `c6c3ff83430b3de8c7d8eaeb9661200ff8f3d9b0a575a13e7776dc77e1ec6a08` |
| `E-RP-27` | Retention and legal-hold migration          | `drizzle/0005_fine_toad.sql`                           | `518d2ae83f1356c131826a40694854bffc42968859fc653c5f0d75ea5dab7428` |
| `E-RP-31` | Private/public split and deletion migration | `drizzle/0006_silly_talkback.sql`                      | `1226a992ad207257d8b72825ad3f51b8deead7763746cd8c2795002adaf5f8ef` |
| `E-RP-35` | Immutable public-correction migration       | `drizzle/0007_swift_hitman.sql`                        | `262c90fa840624af7c82ba8f2f1eaf159c37b75e00bc7be290fb6dd3cbc88634` |
| `E-DOC-1` | Product acceptance and privacy boundary     | `docs/PRODUCT.md`                                      | `c5f6747dbf6163674cfc821ceb38aa010f79c6524eb17642b25642c769a7964d` |
| `E-DOC-2` | Current threat model                        | `docs/THREAT_MODEL.md`                                 | `72c6337b5d5248f8453e92deddf2d0ccb2177ba61a78a7d051a0aa460e9e3d28` |
| `E-DOC-3` | Local Guard release boundary                | `docs/LOCAL_GUARD_RELEASE.md`                          | `de27bfc4514fa295ab621c539f56cae1e423824fad71d5c4bd8b430bcbcdcf6f` |
| `E-DOC-4` | Reporting service release boundary          | `docs/REPORTING_SERVICE.md`                            | `ec868d21a90e781fc7453530ba51844c9f7699c705657bd697369e2df6b2b681` |
| `E-DOC-5` | Local Guard privacy and store review        | `docs/LOCAL_GUARD_PRIVACY_REVIEW.md`                   | `9c1281eaed86215c71145f0367b2bf76cb06c0219c253a10460e2a4ab8b7897a` |

Evidence limitations: no store graphic assets, signed extension identity,
native-messaging host, secure production local transport, deployed public
privacy/support capture, installation lifecycle evidence, production identity
provider, enabled external reporting service, production data, production feed
key or separately published trust fingerprint, provider-backup purge,
correction operations rehearsal, latency benchmark, independent accessibility
participant, or retained screen-reader transcript was available. Controlled
private deletion, immutable public correction, consent withdrawal, and release
assessment are source-tested only. We therefore keep product claims local and
label deployment and operations as proposed.
