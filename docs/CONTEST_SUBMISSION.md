# Contest submission copy

> **CURRENT CANDIDATE — NOT YET SUBMITTED.** The public application is live,
> but submission remains blocked until the public GitHub branch, final video,
> and contest-form rules pass [CONTEST_READINESS.md](CONTEST_READINESS.md).
> This copy makes no novelty, patentability, universal-compatibility, or
> production-security claim.

## Project title

Left Out Security WebMCP Security Lab

## Tagline

Trust the effect, not the label.

## Links

- **Live application:** <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>
- **Open-source repository:** <https://github.com/savage-content/webmcp-security-lab>
- **Demo video:** not yet recorded; this is a submission blocker

## One-sentence summary

An interactive WebMCP security range where a first-time learner and their agent
inspect what a page offers, reduce it to one exact action, run it once, and
compare the promise with the observed effect and receipt.

## The problem

WebMCP lets a page offer actions directly to an AI agent in the same live
browser session. Names, descriptions, schemas, annotations, confirmation copy,
and returned success text can all differ from what a handler actually does.
Registration also does not prove client discovery, safety review, invocation,
or universal browser support.

People need a practical way to see those distinctions before trusting a new
agent-facing web action. Builders need a repeatable way to inspect, constrain,
verify, and explain them.

## The solution

The lab starts with a required client/setup check and a six-step first-time
walkthrough. Five harmless synthetic lessons then teach:

1. trust the effect, not a read-only label;
2. give an agent only the fields its task needs;
3. treat instruction-shaped tool output as untrusted data;
4. require confirmation text to name the real change; and
5. keep API support, registration, policy, discovery, and invocation separate.

Each lesson compares the human-visible task, declared Site Tool, and effective
result. The learner can reduce a broad practice action to a uniquely named,
zero-input, one-use capability. Approval registers that narrower capability but
does not invoke it. A compatible agent may invoke it once, without retry, and
the page records before/after state, side effects, authority closure, and a
receipt.

The public experience also explains the optional LeftOut Local Guard: a
separate, local development preview for Chromium monitoring, change alerts,
one-use enforcement, and local receipt review. It is not required for the
built-in Site Tools path and is not represented as a hosted service or signed
store release.

## Why the human and agent work together

The human supplies intent and decides whether one exact action is acceptable.
The agent inspects the declared capability and, only after approval, invokes
the protected action. Both return to the same page to compare what was shown,
what was declared, and what was observed.

The walkthrough deliberately separates:

- offered;
- discovered;
- approved;
- invoked; and
- verified.

That shared evidence makes new protocol behavior understandable without
pretending that a green badge or a reassuring annotation is enforcement.

## Technical implementation

- React 19 and Vinext for the public learning experience.
- Top-level imperative `document.modelContext.registerTool()` registration
  with browser feature detection and registration-lifecycle cleanup.
- Pure TypeScript fixtures and capability contracts.
- Exact, zero-input, one-use generated capabilities for the controlled path.
- Zod validation, before/after comparison, and append-only evidence receipts.
- Cloudflare D1 persistence for public lab receipts.
- A deterministic, allowlisted Manifest V3 Local Guard preview package and a
  release-attestation verifier that explicitly does not claim Chrome signing.
- A disabled-by-default, privacy-minimized reporting core with a strict invited
  intake handler, atomic quotas, hash-chained D1 events, idempotency, and
  optimistic concurrency; authenticated reviewer reads/transitions and a
  distinct publisher action can atomically create an immutable minimized
  publication record. A separately authenticated JSON/NDJSON feed signs exact,
  bounded snapshot pages with an externally supplied Ed25519 key and requires
  an independently pinned public-key fingerprint. None is configured or
  enabled on the public site.

## Verification

The current working tree passed 407 automated tests across 47 files on Node.js
24, typecheck, lint, production build, deterministic Local Guard packaging, and a
live non-invoking walkthrough/accessibility regression. Earlier bounded browser
runs produced passing receipts for all five synthetic lessons through the
local extension/connector path.

The automated checks do not replace a first-time human study, screen-reader
operator, contest-rules audit, or final recorded demo. Those gates remain
explicit in [CONTEST_READINESS.md](CONTEST_READINESS.md).

## Safety and claim boundary

All accounts, deliveries, notices, subscriptions, and observations are
synthetic. The public lab needs no credentials, production integrations,
purchases, messages, email, or uncontrolled external effect. Instruction-shaped
fixture text remains data and causes no follow-on action.

The project does not claim that WebMCP is universally available, that Site Tool
metadata is trustworthy, that the optional Local Guard is a production control,
or that this work is novel, patented, independently validated, or cleared for
freedom to operate.

## Current limitations

- Site Tools availability depends on the exact client, model, workspace,
  rollout, registration, and session.
- The built-in client currently supports only a subset of the broader WebMCP
  proposal, so the lab records unsupported surfaces rather than converting
  their absence into a security pass.
- The Local Guard remains an unsigned developer preview with a loopback
  companion.
- Reporting remains locally implemented and publicly disabled. Invited HTTP
  intake, atomic quotas, reviewer routes, and a separately authorized publisher
  route and signed feed route exist, but production identity/key custody,
  independently published trust metadata, retention/deletion, operator
  recovery, correction, and privacy approval do not.
- Android is a conformance prototype, not a device-validated product.
- Real first-time-human, screen-reader, and 200% zoom acceptance remain pending.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
