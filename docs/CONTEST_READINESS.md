# Contest submission readiness

**Decision:** **NO-GO until the four blocking rows below pass.**

This ledger is the single submission gate for the current public WebMCP
Security Lab. It separates technical alignment from contest eligibility and
prevents a local commit, public URL, or successful test from being mistaken for
a completed submission.

## Candidate identity

| Item                                | Current evidence                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Public application                  | <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>                           |
| Deployed application source         | commit `8568a5f`, Sites version 11                                                    |
| Latest local baseline               | commit `4a63f01` before the durable-store update; later work is not yet public         |
| Public GitHub repository            | <https://github.com/savage-content/webmcp-security-lab>                               |
| Last locally recorded `origin/main` | `93b4c78`; remote synchronization is unproven                                         |
| Automated release gate              | Node.js 24; 368/368 tests across 41 files; typecheck, lint, and production build pass |
| Demo video                          | Not recorded                                                                          |

## Blocking submission gates

| Gate                                | Status      | Evidence required to pass                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact contest rules and eligibility | **BLOCKED** | Open the actual contest rules and submission form; record deadline/time zone, entrant eligibility, build-period rules, team/ownership limits, required fields, judging criteria, licenses, media rules, and prohibited content. Official OpenAI Site Tools documentation does not establish these contest terms. |
| Public-source provenance            | **BLOCKED** | Push the intended final commit to public GitHub, fetch the remote branch, and prove its SHA contains the deployed application source and current submission materials.                                                                                                                                           |
| Final demo video                    | **BLOCKED** | Record the current public flow using [DEMO_SCRIPT.md](DEMO_SCRIPT.md), publish it at an allowed public URL, verify duration and anonymous playback, and add the exact URL to [CONTEST_SUBMISSION.md](CONTEST_SUBMISSION.md).                                                                                     |
| Submission-form rehearsal           | **BLOCKED** | Enter every required field without submitting, verify character/media limits and link accessibility, save the final copy, and obtain human approval for the irreversible submission.                                                                                                                             |

## Technical and product evidence

| Check                               | Status                | Boundary                                                                                                                                                                                    |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public novice Site Tools experience | PASS                  | Version 11 is live with setup gate, six-step walkthrough, five lessons, exact approval, receipt teaching, and reduced-motion support.                                                       |
| Current OpenAI Site Tools model     | PASS WITH LIMITS      | Top-level imperative registration and explicit model/workspace/session limits align with current OpenAI documentation; this does not prove contest eligibility.                             |
| Automated verification              | PASS                  | Node.js 24 ran 368 tests across 41 files plus typecheck, lint, build, deterministic Local Guard packaging, and the real D1 migration gate. A fresh `npm ci` remains part of final freeze.     |
| Live technical accessibility        | PASS WITH HUMAN GATES | Structure, names, keyboard dialog behavior, focus restoration, and reduced motion passed; real novice, screen-reader, 200% zoom, and 360 px popup acceptance remain pending.                |
| Local Guard                         | DEVELOPMENT PREVIEW   | Deterministic MV3 package and an Ed25519 release-attestation/verification gate exist; no production key, Chrome-signed distribution, or production companion security exists.               |
| Reporting                           | DURABLE, DISCONNECTED | Privacy-minimized drafts, role-separated auth, a hash-chained D1 moderation store, and migration checks exist; no public intake/reviewer route, retention job, signed feed, or operations approval exists. |
| Android                             | CONFORMANCE ONLY      | No supported-device discovery, permission, invocation, or receipt evidence.                                                                                                                 |
| Novelty or legal clearance          | NO CLAIM              | The prior-art review does not support novelty, patentability, clean-room, or freedom-to-operate claims.                                                                                     |

## Product-release gates outside contest submission

These may improve the entry but are not labeled contest requirements until the
actual rules say so:

- first-time independent novice completion;
- keyboard, real screen-reader, 200% zoom, and human 360 px popup acceptance;
- signed Local Guard distribution, installation, update, recovery, and removal;
- production-grade native companion authentication and lifecycle behavior;
- authenticated reporting intake, reviewer authorization, durable audit,
  retention/deletion, abuse response, correction, and explicit publication;
- signed/versioned minimized security-tooling feed; and
- Android device validation, if Android remains in release scope.

## Final freeze procedure

1. Resolve all four blocking submission gates.
2. Freeze the exact public source commit and build only that commit.
3. Run `npm ci` followed by `npm test`, typecheck, lint, and production build on
   Node.js 24.
4. Deploy the exact saved build and verify the public URL in a fresh session.
5. Fetch GitHub and confirm the public branch contains the deployed commit.
6. Verify the demo and every submitted link without authentication.
7. Review claims against [PRIOR_ART.md](../PRIOR_ART.md),
   [VERIFICATION.md](VERIFICATION.md), and current OpenAI Site Tools limits.
8. Obtain human approval, submit once, and preserve the submitted text,
   timestamp, URLs, final SHA, and confirmation receipt.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
