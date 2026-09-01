# Contest submission copy

> **FROZEN VERSION 1 DRAFT — DO NOT SUBMIT AS THE CURRENT MVP.** The existing
> public URL remains available only as the frozen version 1 baseline. The
> completed [prior-art audit](../PRIOR_ART.md) is a NO-GO for novelty,
> patentability, or freedom-to-operate clearance claims. The current local MVP
> completed one later bounded connector receipt-return run after two earlier
> failures, but it has not been publicly deployed and does not establish
> universal compatibility. Recording this frozen script as the current MVP and
> public submission remain blocked by [GO_NO_GO.md](GO_NO_GO.md). This document
> is not evidence of originality, priority, legal clearance, or current-MVP
> deployment.

## Project title

Left Out Security WebMCP Security Lab

## Tagline

Trust the effect, not the label.

## Links

- **Frozen version 1 app:** <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>
- **Open-source repository:** <https://github.com/savage-content/webmcp-security-lab>
- **Demo video:** add the public YouTube URL after recording

## One-sentence summary

A controlled WebMCP test range where a human and an agent use the same page
while append-only evidence records whether the visible interface, declared
agent capability, and actual behavior match.

## The problem

Agent-ready pages introduce a new security surface. A button can say “preview,” a tool description can say “read-only,” and an annotation can repeat that claim—while the handler still performs a write. Likewise, a tool result can contain instruction-shaped untrusted text, and a page can confuse registration with discovery by a particular client.

Security review cannot stop at names, schemas, confirmation copy, or returned success text. We need to observe the Effective Surface.

## The solution

The WebMCP Security Lab provides five deliberately vulnerable, harmless fixtures. The selected fixture is registered as a real page-scoped tool through `document.modelContext.registerTool()`. A supported client can discover and invoke it, while any browser can run the same handler through a clearly labeled educational fallback.

Every run captures:

- the Presented Surface;
- the exact Declared Agent Surface;
- the Effective Surface, including raw result and before/after state;
- a pass/fail verdict, debrief, and remediation; and
- a downloadable JSON receipt, with ordinary frozen-version-1 receipts
  eligible for append-only D1 persistence.

## Why human + agent collaboration matters

The human contributes intent, context, and approval. The agent contributes structured capability discovery and repeatable invocation. The lab puts both views side by side, then grounds the conversation in shared evidence. That makes subtle security mismatches legible to developers, reviewers, and non-specialist judges.

## Five fixtures

1. A read-only eligibility lookup that marks a synthetic account reviewed.
2. A short-notice tool whose schema quietly exposes target and instruction fields.
3. A delivery-status result with controlled prompt-injection text.
4. A preview confirmation that changes a synthetic subscription.
5. A universal-support claim that collapses registration, policy, and client discovery.

Each includes a secure-design comparison with a narrow schema, truthful description and confirmation, and verifiable result.

## How it was built

- React 19 and Vinext for the web experience.
- The imperative WebMCP API on `document.modelContext` with feature detection and abort-driven registration lifecycle.
- Pure TypeScript scenario engine shared by WebMCP and the fallback harness.
- Zod validation for inputs and complete evidence receipts.
- Cloudflare D1 plus Drizzle migrations for append-only evidence.
- Vitest coverage for state transitions, schema boundaries, prompt-injection output, and receipt generation.
- A Cloudflare Worker-compatible Sites deployment for the frozen version 1
  baseline. The current MVP has not been publicly deployed.

## Safety

No credentials, real accounts, production APIs, email, purchases, exfiltration, or uncontrolled external effects are used. Every identity and object is visibly synthetic, every fixture is resettable, and every client limitation is reported rather than guessed.

## What was added during the contest period

The recoverable repository history timestamps the application architecture, visual system, scenario engine, five fixtures, WebMCP registration, evidence schema and D1 adapter, tests, migrations, safety materials, deployment configuration, social preview, and demo script within the contest window. Repository history has two joined roots and one retained older-checkout commit, as documented in the prior-art audit. This chronology is not a claim of independent invention; several constituent security controls have earlier public prior art.

## Current limitations

WebMCP is experimental and client support varies. The lab treats this as
evidence, not an inconvenience: unsupported and undiscovered states are
first-class outputs. Two connector receipt-return attempts failed; a later
fresh run completed the local extension-to-connector path, but the successful
session did not retain a fresh exact browser-version readout and does not prove
the replay-during-delay or broader compatibility matrix. The extension remains
unpacked, the Android work is conformance-only, and public deployment or
submission remains blocked by the dated public-release NO-GO.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
