# Devpost form handoff

**Status:** ready to paste after the entrant completes challenge registration.
Do not submit until the video URL, final public-source SHA, verified public URL,
and personal attestations at the end of this file are complete. The official
submission requirements do not create a separate exact-candidate native-
invocation attestation; do not mislabel historical invocation evidence, and
make the public app function exactly as the final video and testing instructions
describe.

## Identity and links

- **Project name:** Left Out Security WebMCP Security Lab
- **Tagline:** Trust the effect, not the label.
- **Live application:** <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>
- **Public source:** <https://github.com/savage-content/webmcp-security-lab>
- **Public YouTube demo:** **BLOCKING — add the final sub-three-minute URL**
- **Final public source SHA:** add after the tested cleanup candidate is public
- **Current live release:** verify after deploying that exact candidate

## Paste-ready project story

### Inspiration

WebMCP lets a website offer structured actions directly to an AI agent in the
same browsing session. That is powerful, but a friendly tool name, read-only
annotation, narrow-looking form, confirmation message, or successful result is
not proof of what the handler can actually do. People and builders need a safe
way to experience those trust boundaries before relying on a new agent-facing
web action.

### What it does

The WebMCP Security Lab is a beginner-first, synthetic learning range for a
person and their agent. It checks the actual Site Tools API, offers a six-step
first-time walkthrough, and teaches five security lessons:

1. trust the observed effect, not a read-only label;
2. expose only the fields the task needs;
3. treat instruction-shaped result text as untrusted data;
4. make approval name the real change; and
5. keep API support, registration, policy, discovery, and invocation separate.

In the primary lesson, the human approves one read of synthetic account
`TRAINING-1042`. The lab replaces a broad practice tool with a uniquely named,
zero-input, expiring, one-use capability. Approval registers it but does not run
it. The same agent may invoke it once with no retry. The page then compares
before and after state, checks side effects, confirms that authority closed,
and records a receipt.

### Why WebMCP is essential

This interaction cannot be demonstrated honestly with ordinary browser
automation alone. The lesson depends on a page registering a real Site Tool,
the agent inspecting and selecting that tool, the human approving less
authority, and both returning to the same live page to verify the callback's
effect. The product deliberately distinguishes what the page can prove from
client discovery UI, policy, confirmation, and cross-client compatibility.

### How it creates a better experience

The novice sees one plain question and one decision at a time instead of ports,
tokens, schemas, or connector setup. A compatible built-in browser needs no
extension. An always-available no-invocation path teaches the same boundaries
when Site Tools are unavailable. Advanced learners can inspect declarations,
hashes, source drift, and client variance without confusing those experiments
with OpenAI's built-in surface.

### How it was built

The application uses React 19, TypeScript, Vinext, Zod, Cloudflare D1, and
top-level imperative `document.modelContext.registerTool()` registration. Pure
fixtures model the five risks. Generated capabilities bind the exact origin,
source fingerprint, handler version, target, allowed and prohibited effects,
expiry, and use count. Verification creates a private, exportable page-session
receipt. A disabled, privacy-minimized reporting pipeline is documented as a
separate unfinished product track and is not required for the contest's native
Site Tools path or represented as production ready.

### Challenges and lessons

The hardest part was preserving the difference between presentation and
authority. Registration is not discovery, approval is not invocation, and a
result is not proof. Client re-registration limits, expiring approvals,
cross-realm values, confirmation layout, ambiguous retries, and receipt
provenance all needed explicit fail-closed behavior. The resulting design makes
uncertainty visible instead of converting missing evidence into a green badge.

### What is next

After the contest freeze, Local Guard remains future research and the reporting
track remains a developer preview until publisher identity, privacy approval,
operator ownership, accessibility acceptance, and incident rehearsals are
independently evidenced. Android remains an
isolated JVM/API conformance prototype, not a device-supported product.

## Testing instructions

1. Open the live URL in ChatGPT's in-app browser. No credentials are required.
2. Confirm the detected built-in Site Tools path and complete or skip the
   first-time tour.
3. In Lesson 1, inspect the exact action for synthetic `TRAINING-1042`.
4. Approve one read-only, zero-input, one-use capability. Approval must not run
   it.
5. Ask the same agent: “Run the one approved practice action once. Do not retry
   or invoke another Site Tool.”
6. Confirm the page reports the eligibility result, identical before/after
   state, zero side effects, closed authority, and a receipt ID.

If Site Tools are unavailable in that exact client, use the visible
no-invocation learning path and record the environment limitation. Do not
substitute ordinary browser automation and describe it as WebMCP.

## Suggested technology tags

WebMCP, Site Tools, TypeScript, React, Vinext, Zod, Cloudflare, D1, Chrome,
Vitest, AI security, human-in-the-loop, accessibility.

## Media checklist

- One public YouTube video under three minutes.
- Audio explains what was built and how WebMCP is used.
- Show the live offer, detected path, exact approval, one agent invocation,
  before/after verification, closed authority, and receipt ID.
- Use no unlicensed music, third-party marks, private tabs, credentials, or
  personal notifications.
- Verify anonymous playback and duration before pasting the URL.

## Entrant-only attestations

The entrant must personally confirm before submission:

- age, residence or organizational domicile, and eligible jurisdiction;
- no prohibited employment, judging, household, affiliate, funding, or other
  conflict;
- authority to represent the entrant, team, or organization;
- ownership and permission for every source, asset, trademark, voice, and video
  element;
- compliance with all open-source and third-party terms; and
- acceptance of the Official Rules, publicity terms, Devpost terms, and privacy
  processing.

Do not infer any attestation from repository ownership or account state. Stop at
Devpost's final submission action for explicit human approval.

This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.
