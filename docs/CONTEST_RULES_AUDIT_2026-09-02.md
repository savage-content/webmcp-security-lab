# OpenAI WebMCP Challenge rules audit

**Reviewed:** September 3, 2026 at 1:36 AM CDT

**Submission deadline:** September 3, 2026 at 1:00 PM PDT / 3:00 PM CDT

**Judging period:** September 4, 2026 at 10:00 AM PDT through September 21,
2026 at 5:00 PM PDT

## Authority

This audit was refreshed again against the challenge's current September 3
Official Rules, overview, resources, and updates pages. The deadline and
submission requirements were unchanged at 1:36 AM CDT. It uses the [Official
Rules](https://webmcp.devpost.com/rules), [overview and
FAQ](https://webmcp.devpost.com/), [resources and
FAQ](https://webmcp.devpost.com/resources), and [organizer
updates](https://webmcp.devpost.com/updates). The Official Rules control if any
summary, FAQ, plugin output, or submission-form copy conflicts with them. The
rules may change before the deadline, so the entrant must reopen them during
the final form rehearsal.

This is a source audit, not legal advice or a determination that the entrant is
eligible.

## Required project and submission evidence

| Requirement                    | Rule                                                                                                                                                              | Current evidence                                                                                                                                          | Status                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| WebMCP-powered web application | The app must explore human-agent interaction on the open web and use WebMCP non-trivially.                                                                        | The lab dynamically registers top-level tools and lets the human and agent replace broad authority with an exact one-use capability.                      | **PASS in source; final live run required** |
| Working live project           | Judges must be able to use the intended platform through ChatGPT's in-app browser or Chrome 149+ with WebMCP enabled.                                             | The public Sites URL strongly content-matches version 12; record one native Site Tools invocation while filming and preserve the final freeze.             | **PASS WITH FINAL RUN**                     |
| Project description            | Explain WebMCP fit, the improved experience, what people and agents can now do together, and the implementation.                                                  | Drafted in `CONTEST_SUBMISSION.md`.                                                                                                                       | **SOURCE READY**                            |
| Public source repository       | GitHub, GitLab, or Bitbucket; all required code, assets, and instructions; visible open-source license; actual `document.modelContext.registerTool()` use.        | Public GitHub is MIT-licensed and contains the implementation; push and record the final reviewed cleanup SHA before submission.                           | **PENDING FINAL RECONCILIATION**            |
| Demo video                     | Public YouTube URL; less than three minutes; clear functioning demo; audio explaining what was built and how WebMCP is used.                                      | Script exists; no final video URL exists.                                                                                                                 | **BLOCKED**                                 |
| Media rights                   | No unlicensed trademarks, copyrighted music, or other third-party material in the video.                                                                          | Must be checked against the final recording.                                                                                                              | **HUMAN REVIEW**                            |
| English materials              | Submission materials must be English or have English translations.                                                                                                | Current source copy and script are English.                                                                                                               | **PASS**                                    |
| Free judging access            | Keep the project free and unrestricted for Sponsor, Administrator, and judges through September 21 at 5:00 PM PDT; private apps must include working credentials. | The intended candidate is public and credential-free, but uptime and final URL remain operational obligations.                                            | **OPEN THROUGH JUDGING**                    |
| Contest-period work            | New projects are eligible; a pre-existing project must document meaningful WebMCP work added after August 25 at 11:00 AM PDT.                                     | `CONTEST_PERIOD_WORK.md`, dated Git history, and `PRIOR_ART.md` distinguish the contest work. They must be present in the public freeze.                  | **SOURCE READY**                            |
| Ownership and licenses         | The entry must be entrant-owned original work, respect third-party rights and open-source licenses, and contain no harmful code.                                  | MIT license and prior-art record exist. Ownership, third-party rights, and entrant warranties require human attestation.                                  | **HUMAN REQUIRED**                          |
| Submission form                | Complete every required field during the submission period. Drafts are allowed before the deadline.                                                               | Authenticated form fields, character limits, media fields, and final confirmation have not been rehearsed.                                                | **BLOCKED**                                 |

## Entrant facts that code cannot prove

Before submission, the entrant or authorized representative must personally
confirm all of the following:

- entrant type: individual, team, or organization;
- age of majority and residence or organization domicile in an eligible OpenAI
  API-supported jurisdiction, with no listed exclusion;
- no promotion-entity, judge, employment, household, affiliate, or other
  conflict that makes the entrant ineligible;
- authority to represent every team member or the organization, if applicable;
- ownership of the submission and permission for every third-party component,
  trademark, image, voice, music track, and other submitted material;
- no prohibited financial or preferential development support from OpenAI or
  Devpost; and
- acceptance of the Official Rules, publicity terms, Devpost terms, and
  privacy processing.

Do not infer any of these facts from repository ownership, account names, or
conversation history.

## Judging criteria

Stage One is pass/fail for theme fit and reasonable use of the required
technology. Stage Two weights these four criteria equally:

1. **WebMCP Leverage** — genuine, working, non-trivial use.
2. **Execution** — a complete and coherent product experience, not merely a
   proof of concept.
3. **Potential Impact** — a specific real audience and a demonstrated solution
   to its problem.
4. **Creativity & Ambition** — a creative concept that differs from existing
   work.

The submission should demonstrate the capability-negotiation interaction as
the main entry: a human and agent inspect a broad capability, compile one exact
least-authority action, approve it without running it, invoke it once, and
verify the result and closed authority. The five security lessons, Local Guard,
and reporting work support that story; they should not bury it or be described
as globally novel. `PRIOR_ART.md` remains the claim boundary.

## Final freeze rule

The organizer FAQ and September 2 update say not to edit the Devpost entry,
public repository, video, or live site after the deadline and to keep the live
project available throughout judging. To keep product work moving without
putting the entry at risk:

1. freeze one exact submission commit, deployment, YouTube video, and Devpost
   draft before 1:00 PM PDT;
2. record their identifiers and URLs in `CONTEST_READINESS.md`;
3. make no post-deadline changes to those submitted surfaces; and
4. continue Local Guard, reporting, and Android work only in a separate
   post-contest repository or fork until winners are announced.

This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.
