# Novice and accessibility acceptance

## Current decision

**Technical novice path: PASS on the deployed version 11 release.**

**Real first-time human acceptance: NOT YET RUN.** No independent first-time
participant or screen-reader operator was available inside this development
session. Automated browser interaction is not relabeled as a human study.

The public baseline tested on 2026-09-02 was commit `5ba6e97`, Sites version
10. The reduced-motion remediation and regression-tested release is commit
`8568a5f`, Sites version 11, at
<https://left-out-webmcp-security-lab.taitfor.chatgpt.site>. No Site Tool was
invoked during either acceptance run.

## Deployed technical novice run

| Check                     | Result | Observed evidence                                                                                                                        |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Live release identity     | PASS   | Existing public URL served the new required setup gate and six-step walkthrough.                                                         |
| Browser support detection | PASS   | The page detected the Site Tools page API rather than inferring support from branding.                                                   |
| Viable-path gate          | PASS   | Built-in Site Tools was recommended only because the API was present; the read-only path remained available.                             |
| Tour safety               | PASS   | Welcome → Choose → Observe → Inspect → Run → Verify completed without approval, registration of a generated capability, or invocation.   |
| Registration language     | PASS   | The tour states that registration does not prove discovery, safety review, or invocation.                                                |
| Lesson unlock             | PASS   | Confirming the viable setup opened Lesson 1 and one primary review action.                                                               |
| Approval clarity          | PASS   | Dialog named `TRAINING-1042`, read eligibility once, no inputs, one attempt, no retry, forbidden changes, expiry, and “does not invoke.” |
| Cancel safety             | PASS   | “Not now” returned to review with no generated authority and no invocation.                                                              |

## Technical accessibility run

| Check                           | Result                 | Evidence or limitation                                                                                                                                 |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Landmark and heading structure  | PASS                   | Live accessibility tree contained one `main`, one H1, coherent H2/H3 order, and one named navigation region.                                           |
| Accessible control names        | PASS                   | Live tree contained no unnamed button, link, textbox, checkbox, or combobox.                                                                           |
| Keyboard dialog navigation      | PASS                   | Tab moved from cancel to the approval action; focus remained inside the dialog.                                                                        |
| Escape and focus restoration    | PASS                   | Escape closed the alert dialog and returned focus to “Review the exact approval.”                                                                      |
| Short/zoomed dialog containment | CODE PASS              | Walkthrough and approval dialogs use bounded viewport height, internal scrolling, wrapping actions, and responsive width.                              |
| 360 CSS px Local Guard popup    | CODE PASS              | Popup is fixed at 360 CSS px, wraps technical values, has named labels/status regions, 40 px controls, and visible focus outlines.                     |
| Reduced motion                  | PASS LIVE              | Version 10 lacked a reduced-motion rule. The version 11 live stylesheet disables smooth scroll, animation, and transitions when requested.           |
| Real screen reader              | PENDING HUMAN          | No NVDA, JAWS, VoiceOver, or TalkBack operator completed the journey.                                                                                  |
| Real 200% zoom                  | PENDING HUMAN          | Responsive code is present; a human usability pass at 200% remains required.                                                                           |
| Real 360 px popup               | PENDING HUMAN          | Static contract and earlier Chrome visual evidence exist; a first-time human completion remains required.                                              |

## Ten-minute first-time-human script

Use a fresh browser profile and a person who has not seen this lab or its
protocol terminology. The moderator may say only:

> This page teaches how a website can offer an action to an AI. Please use the
> page to complete the first safe practice lesson. Say what you think happened
> and stop if anything is unclear.

Do not explain Site Tools, Local Guard, registration, permissions, receipts, or
the correct path. Record only task time, errors, requests for help, the words
the participant uses, and the final four comprehension answers. Do not record
credentials, browsing history, page content from other sites, or production
data.

The participant should:

1. identify the detected viable path;
2. complete the tour or deliberately skip it;
3. explain the difference between “offered” and “approved”;
4. inspect Lesson 1 and describe the exact one-use action;
5. cancel once and explain whether anything ran;
6. approve a fresh synthetic action;
7. ask the same connected agent to run it once with no retry;
8. read PASS/FAIL, before/after state, side effects, closed authority, and the
   receipt ID; and
9. preview a safety report and explain what stays local and what could become a
   human-reviewed feed record.

## Human acceptance threshold

A participant passes only if they finish without moderator coaching or copied
protocol identifiers and can accurately state:

- a site offer is not approval or proof of safety;
- approval names one exact action, target, lifetime, and use count;
- ambiguous completion must not be retried automatically; and
- a receipt proves one observed run, while a report remains private until a
  separate human-reviewed publication decision.

Before preview language can be removed, repeat the journey keyboard-only, at
200% zoom, and with a screen reader. Any blocked control, clipped decision,
lost focus, unnamed state, or confusion between approval and execution is a
release failure, not a training error.
