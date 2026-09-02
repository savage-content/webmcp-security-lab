# Hardening evidence context

This derived review covers the Local Guard and reporting boundaries at source
revision `5ba6e97095918d8877e1e12c98faabb3b81a869f`, plus the reversible packaging,
accessibility, and moderation-core changes made while preparing this review.
The target tree was clean at `5ba6e97`; the added files are implementation
prerequisites, not evidence that a signed extension or hosted intake exists.

Collection digest: `sha256:eab7c0cc8b710ed613fdc9cc155322e388eac9bfcad9ecce48e9ede2b7fb00cb`

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
| `E-RP-5`  | Quarantined moderation state machine       | `products/connector/issue-moderation.ts`  | `bb3e580fd4521d826b90ff3414562da106534905d070812f370625cd93b8e8dd` |
| `E-LG-5`  | Reproducible package gate                  | `scripts/package-local-guard.mts`         | `49fd9f1eb6614d92bfc3327b48f07fcd8ac21ae96b46cfc1236eb30c4cf123a0` |
| `E-DOC-1` | Product acceptance and privacy boundary    | `docs/PRODUCT.md`                         | `892b9cb2881f8d78418588ce756225cc647e38fe30e3ea3ef25bcbef1450593f` |
| `E-DOC-2` | Current threat model                       | `docs/THREAT_MODEL.md`                    | `f23a3a1ce47281860550e954923b3e83d8736d8ac511ecb4a567b9f7ae4d751a` |

Evidence limitations: no signed extension identity, native-messaging host,
production identity provider, external moderation service, production data,
latency benchmark, independent accessibility participant, or retained screen
reader transcript was available. We therefore keep product claims local and
label the public-service architecture as proposed.
