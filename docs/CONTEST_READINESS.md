# Contest submission readiness

**Decision:** **NOT READY TO SUBMIT until the release, video, registration,
and entrant-attestation gates below are complete.**

This ledger is the single submission gate for the current public WebMCP
Security Lab. It separates technical alignment from contest eligibility and
prevents a local commit, public URL, or successful test from being mistaken for
a completed submission.

## Candidate identity

| Item                              | Current evidence                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public application                | <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>                                                                                                                                                         |
| Current live candidate identity   | Existing public Sites URL; deploy and verify the final reviewed cleanup build before submission                                                                                                                     |
| Latest clean candidate checkpoint | Local contest-cleanup candidate; the complete Node.js 24 release gate passed on September 3, 2026; final commit, public push, and deployment remain pending                                                         |
| Public GitHub repository          | <https://github.com/savage-content/webmcp-security-lab>; public and MIT-licensed; push the final reviewed candidate before submission                                                                               |
| Public source reconciliation      | Pending final commit, public push, Sites deployment, and live-content verification                                                                                                                                  |
| Automated release gate            | **PASS on the current working tree:** Node.js 24, 551 tests across 76 files, typecheck, readiness checks, Worker dry run, lint, production build, and public-`dist/` verification; rerun `npm ci` before publishing |
| Demo video                        | Not recorded                                                                                                                                                                                                        |

## Blocking submission gates

| Gate                              | Status              | Evidence required to pass                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official contest rules audit      | **PASS**            | The September 3 refresh records the controlling rules, September 3 1:00 PM PDT deadline, build period, required materials, judging criteria, testing period, media/IP limits, and freeze rule in [CONTEST_RULES_AUDIT_2026-09-02.md](CONTEST_RULES_AUDIT_2026-09-02.md). Recheck for amendments during final rehearsal. |
| Entrant eligibility and ownership | **HUMAN REQUIRED**  | The entrant must attest age, jurisdiction, conflicts, representative authority, ownership, third-party rights, support restrictions, and acceptance of the governing terms. Repository evidence cannot prove these facts.                                                                                               |
| Public-source provenance          | **PENDING RELEASE** | Push the tested final commit, deploy that build, verify the public URL, and record the public SHA in the external submission handoff. Do not call a local-only commit public.                                                                                                                                           |
| Final demo video                  | **BLOCKED**         | Record the current public flow using [DEMO_SCRIPT.md](DEMO_SCRIPT.md), publish it at an allowed public URL, verify duration and anonymous playback, and add the exact URL to [CONTEST_SUBMISSION.md](CONTEST_SUBMISSION.md).                                                                                            |
| Submission-form rehearsal         | **HUMAN REQUIRED**  | The entrant is signed in at the challenge-registration flow. Complete registration, open the submission form, and rehearse its exact fields and limits without submitting. Paste-ready copy and attestations are staged in [CONTEST_FORM_HANDOFF.md](CONTEST_FORM_HANDOFF.md).                                          |

## Technical and product evidence

| Check                               | Status                        | Boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public novice Site Tools experience | PASS WITH HISTORICAL BOUNDARY | Version 11 supplied the live browser acceptance. Version 12 strongly matches the live content and retains byte-identical core novice source, but no native version-12 invocation is inferred from the earlier run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Current OpenAI Site Tools model     | PASS WITH LIMITS              | Top-level imperative registration and explicit model/workspace/session limits align with current OpenAI documentation; this does not prove contest eligibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Automated verification              | PASS                          | Node.js 24 ran 551 passing tests across 76 files on the native-only correction, plus typecheck, Local Guard and reporting readiness assessments, the disabled Worker dry run, lint, production build, and fail-closed public-`dist/` verification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Live technical accessibility        | PASS WITH HUMAN GATES         | Structure, names, keyboard dialog behavior, focus restoration, reduced motion, and measured 360×800 public-lab containment passed; real novice, screen-reader, and 200% zoom acceptance remain pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Local Guard                         | FUTURE WORK                   | Research source exists, but Local Guard is outside the judged path and is not a public setup choice, distributed product, production control, or contest-runtime dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Reporting                           | PRIVATE PIPELINE OFF          | Strict intake/reviewer/publisher handlers, an API-only standalone Worker with an inert configuration template, a loopback-only credential-isolating reviewer workbench, immutable minimized publication and correction timeline, signed JSON/NDJSON feed, atomic retention assignment, custodian-only legal hold, controlled private deletion, and digest-bound public withdrawal exist locally; all remain disabled/unconfigured publicly. Privacy approval, production identity/key custody, a separate hostname, abuse/support ownership, separately published trust fingerprint, provider-backup lifecycle, real operator/accessibility rehearsal, correction rehearsal, and incident approval remain absent. |
| Android                             | CONFORMANCE ONLY              | A September 3 checkpoint passed all eight Kotlin/JVM groups and the API-36 adapter compile/manifest check, while ADB returned zero connected devices. The later disclaimer compatibility patch has source tests but was not rerun through that separate Windows/Android gate in the final Linux executor. Android is outside the contest website runtime; no supported-device registration, discovery, permission, invocation, or receipt evidence exists.                                                                                                                                                                                                                                                        |
| Novelty or legal clearance          | NO CLAIM                      | The prior-art review does not support novelty, patentability, clean-room, or freedom-to-operate claims.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Product-release gates outside contest submission

These may improve the entry but are not labeled contest requirements until the
actual rules say so:

- first-time independent novice completion;
- keyboard, real screen-reader, and 200% zoom acceptance;
- any future Local Guard product requires a separate signed-distribution,
  privacy, accessibility, installation, update, recovery, and removal program;
- production-grade native companion authentication and lifecycle behavior;
- authenticated reporting intake, reviewer authorization, durable audit,
  retention/deletion operations and rehearsal, abuse response, correction, and
  explicit publication;
- signed/versioned minimized security-tooling feed; and
- Android device validation, if Android remains in release scope.

## Final freeze procedure

1. Reopen the Official Rules and resolve all three non-pass submission rows.
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

This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.
