# Contest submission copy

> **FROZEN DRAFT — DO NOT SUBMIT.** The public v1 remains available as a
> baseline, but recording and submission are paused pending the dated
> [prior-art audit](../PRIOR_ART.md), independent review, and the acceptance
> gates in [GO_NO_GO.md](GO_NO_GO.md). This document is not evidence of
> originality or priority.

## Project title

Left Out Security WebMCP Security Lab

## Tagline

Trust the effect, not the label.

## Links

- **Live app:** <https://left-out-webmcp-security-lab.taitfor.chatgpt.site>
- **Open-source repository:** <https://github.com/savage-content/webmcp-security-lab>
- **Demo video:** add the public YouTube URL after recording

## One-sentence summary

A controlled WebMCP test range where a human and an agent use the same page while append-only evidence proves whether the visible interface, declared agent capability, and actual behavior match.

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
- a downloadable, append-only JSON receipt persisted in D1.

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
- A Cloudflare Worker-compatible Sites deployment.

## Safety

No credentials, real accounts, production APIs, email, purchases, exfiltration, or uncontrolled external effects are used. Every identity and object is visibly synthetic, every fixture is resettable, and every client limitation is reported rather than guessed.

## What was added during the contest period

The recoverable repository history timestamps the application architecture, visual system, scenario engine, five fixtures, WebMCP registration, evidence schema and D1 adapter, tests, migrations, safety materials, deployment configuration, social preview, and demo script within the contest window. Repository history has two joined roots and one retained older-checkout commit, as documented in the prior-art audit. This chronology is not a claim of independent invention; several constituent security controls have earlier public prior art.

## Current limitations

WebMCP is experimental and client support varies. The lab treats this as evidence, not an inconvenience: unsupported and undiscovered states are first-class outputs. A human must still record and publish the final YouTube walkthrough.
