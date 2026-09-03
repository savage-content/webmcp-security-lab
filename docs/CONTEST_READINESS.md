# Contest submission readiness

**Decision:** **NO-GO until the four non-pass submission rows below are
resolved. One of those rows—entrant eligibility and ownership—can be resolved
only by the entrant.**

This ledger is the single submission gate for the current public WebMCP
Security Lab. It separates technical alignment from contest eligibility and
prevents a local commit, public URL, or successful test from being mistaken for
a completed submission.

## Candidate identity

| Item                                      | Current evidence                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public application                        | <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>                                                                                                                     |
| Last recorded deployed source             | commit `8568a5f`, Sites version 11; fresh final verification remains required                                                                                                   |
| Latest verified implementation checkpoint | current local branch based on commit `a485466`; Local Guard native transport and the isolated reporting Worker are source-only, undeployed, and not public                      |
| Public GitHub repository                  | <https://github.com/savage-content/webmcp-security-lab>                                                                                                                         |
| Public `origin/main`, queried September 2 | `93b4c7801c5b5a10e721f4305e79800fd00fdf44`; it contains neither deployed commit `8568a5f` nor the later submission work                                                         |
| Automated release gate                    | Node.js 24 verification on September 2: 522/522 tests across 72 files; typecheck, both release-readiness assessments, reporting-Worker dry run, lint, and production build pass |
| Demo video                                | Not recorded                                                                                                                                                                    |

## Blocking submission gates

| Gate                              | Status             | Evidence required to pass                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official contest rules audit      | **PASS**           | The September 2 audit records the controlling rules, September 3 1:00 PM PDT deadline, build period, required materials, judging criteria, testing period, media/IP limits, and freeze rule in [CONTEST_RULES_AUDIT_2026-09-02.md](CONTEST_RULES_AUDIT_2026-09-02.md). Recheck for amendments during final rehearsal. |
| Entrant eligibility and ownership | **HUMAN REQUIRED** | The entrant must attest age, jurisdiction, conflicts, representative authority, ownership, third-party rights, support restrictions, and acceptance of the governing terms. Repository evidence cannot prove these facts.                                                                                             |
| Public-source provenance          | **BLOCKED**        | Push the intended final commit to public GitHub, fetch the remote branch, and prove its SHA contains the deployed application source and current submission materials.                                                                                                                                                |
| Final demo video                  | **BLOCKED**        | Record the current public flow using [DEMO_SCRIPT.md](DEMO_SCRIPT.md), publish it at an allowed public URL, verify duration and anonymous playback, and add the exact URL to [CONTEST_SUBMISSION.md](CONTEST_SUBMISSION.md).                                                                                          |
| Submission-form rehearsal         | **BLOCKED**        | Join the challenge, open the authenticated form, enter every required field without submitting, verify character/media limits and link accessibility, save the final copy, and obtain human approval for the irreversible submission.                                                                                 |

## Technical and product evidence

| Check                               | Status                | Boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public novice Site Tools experience | PASS                  | Version 11 is live with setup gate, six-step walkthrough, five lessons, exact approval, receipt teaching, and reduced-motion support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Current OpenAI Site Tools model     | PASS WITH LIMITS      | Top-level imperative registration and explicit model/workspace/session limits align with current OpenAI documentation; this does not prove contest eligibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Automated verification              | PASS                  | Node.js 24 ran 522 tests across 72 files plus typecheck, Local Guard and reporting release assessments, an inert standalone reporting-Worker dry run, lint, build, deterministic Local Guard packaging, reproducible store-asset verification, source-ready native transport, a separately packaged no-host-permission native extension candidate, authenticated named-pipe IPC/native-only connector mode, lifecycle, platform-matrix, incident-response, default-off four-field report-relay checks, loopback reviewer authority/accessibility-contract checks, and real D1 migration/intake/review/publication/correction/signed-feed/retention/legal-hold/deletion gates. Repeat the same gate after freezing the final commit. |
| Live technical accessibility        | PASS WITH HUMAN GATES | Structure, names, keyboard dialog behavior, focus restoration, reduced motion, and measured 360×800 public-lab containment passed; real novice, screen-reader, 200% zoom, and 360 px Local Guard popup acceptance remain pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Local Guard                         | DEVELOPMENT PREVIEW   | Deterministic MV3 packaging, Ed25519 release attestation, and an identity-bound native-message source checkpoint exist. The shipping preview still uses loopback HTTP; no installed native host, production key, Chrome-signed distribution, or signed-candidate acceptance exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Reporting                           | PRIVATE PIPELINE OFF  | Strict intake/reviewer/publisher handlers, an API-only standalone Worker with an inert configuration template, a loopback-only credential-isolating reviewer workbench, immutable minimized publication and correction timeline, signed JSON/NDJSON feed, atomic retention assignment, custodian-only legal hold, controlled private deletion, and digest-bound public withdrawal exist locally; all remain disabled/unconfigured publicly. Privacy approval, production identity/key custody, a separate hostname, abuse/support ownership, separately published trust fingerprint, provider-backup lifecycle, real operator/accessibility rehearsal, correction rehearsal, and incident approval remain absent.                   |
| Android                             | CONFORMANCE ONLY      | No supported-device discovery, permission, invocation, or receipt evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Novelty or legal clearance          | NO CLAIM              | The prior-art review does not support novelty, patentability, clean-room, or freedom-to-operate claims.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Product-release gates outside contest submission

These may improve the entry but are not labeled contest requirements until the
actual rules say so:

- first-time independent novice completion;
- keyboard, real screen-reader, 200% zoom, and human 360 px popup acceptance;
- signed Local Guard distribution, installation, update, recovery, and removal;
- production-grade native companion authentication and lifecycle behavior;
- authenticated reporting intake, reviewer authorization, durable audit,
  retention/deletion operations and rehearsal, abuse response, correction, and
  explicit publication;
- signed/versioned minimized security-tooling feed; and
- Android device validation, if Android remains in release scope.

## Final freeze procedure

1. Reopen the Official Rules and resolve all four non-pass submission rows.
2. Freeze the exact public source commit and build only that commit.
3. Run `npm ci` followed by `npm test`, typecheck, lint, and production build on
   Node.js 24.
4. Deploy the exact saved build and verify the public URL in a fresh session.
5. Fetch GitHub and confirm the public branch contains the deployed commit.
6. Verify the demo and every submitted link without authentication.
7. Review claims against [PRIOR_ART.md](../PRIOR_ART.md),
   [VERIFICATION.md](VERIFICATION.md), and current OpenAI Site Tools limits.
8. Obtain human approval, submit once before **September 3 at 1:00 PM PDT / 3:00
   PM CDT**, and preserve the submitted text,
   timestamp, URLs, final SHA, and confirmation receipt.
9. Do not change the submitted Devpost entry, repository, video, or live site
   during judging; move continued product work to a separate fork.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
