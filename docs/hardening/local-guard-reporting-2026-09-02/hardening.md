# Security Hardening Review: Local Guard and reporting pipeline

## Evidence Basis

I inspected the extension authority, service-worker enforcement, loopback
connector, privacy-safe issue model, local review list, feed projection, product
requirements, and threat model. The exact inventory and hashes are in
[context.md](context.md). This is source-backed design evidence; it is not a
claim that the proposed production boundaries exist.

## Constraints

We need to preserve a novice path with no copied protocol data, a local-only
mode that never reports automatically, exact one-use authority, and honest
client-scoped evidence. No signing identity, production authentication,
moderation operator, retention policy, or approved public intake destination
is currently available. Performance and memory budgets are unknown, so this
review uses a balanced profile and requires measurement before rollout.

## Opportunity Portfolio

| Opportunity                                | Evidence                                                                                                                | Options                                                   | Recommendation                                                                                               | Proposal                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Own the desktop authority boundary         | Exact MV3 authority, browser enforcement, loopback connector, and package gate (`E-LG-1`, `E-LG-2`, `E-RP-1`, `E-LG-5`) | Reproducible loopback preview; signed native-host product | Ship only the reproducible preview now; require the native-host boundary before a general desktop release    | [Local Guard authority boundary](proposals/local-guard-authority-boundary.md) |
| Make publication a distinct reviewed state | Strict draft, local review, feed projection, moderation core, and product privacy rule (`E-RP-2`–`E-RP-5`, `E-DOC-1`)   | Local-only evidence; quarantined reviewed service         | Keep public intake off while implementing the quarantined service behind authentication and operations gates | [Reporting quarantine boundary](proposals/reporting-quarantine-boundary.md)   |

## Recommendation Summary

The attractive near-term path is intentionally asymmetric. We can distribute a
reproducible Local Guard developer preview now because the package gate narrows
exactly what leaves the repository and verifies its permissions and hashes. We
should not call that a consumer release: the loopback token and unpacked
extension still rely on a trusted local machine and browser profile.

For reporting, the safest product move is to finish the pure quarantine and
publication state machine while keeping every network intake route absent. I
recommend a hosted reporting service only after reviewer authentication,
rate/abuse controls, retention, deletion, incident response, and an approved
privacy notice exist. A direct report-to-feed path is not an acceptable option.

## Next Decisions

1. Choose whether a public desktop release warrants a signed extension plus
   native-messaging host, or whether Local Guard remains a developer preview.
2. Name the owner and system for authenticated human moderation.
3. Approve retention, abuse handling, hostname-consent, and incident-response
   rules before any public intake endpoint is connected.
4. Complete real first-time human, screen-reader, 200% zoom, and 360 px popup
   acceptance before removing preview language.
