# Three-minute demo script

**Target runtime:** 2:45–2:55

> **FROZEN VERSION 1 SCRIPT — DO NOT RECORD OR PUBLISH AS THE CURRENT MVP.**
> Two connector receipt-return attempts failed, and the Chrome 152
> deferred-retirement fix is not yet live-validated. The extension is unpacked,
> the Android work is conformance-only, and the current MVP is not publicly
> deployed. See [GO_NO_GO.md](GO_NO_GO.md).

## 0:00–0:25 — Heads-up before action

> This page just offered my agent a WebMCP tool. Before anything runs, Left Out Security gives me a calm heads-up: the tool name, inputs, safety claims, permission and registration state, and the exact rule that deserves attention. Detection is automatic. Invocation is not.

Show the opening heads-up. Point to “No auto-run,” the five separate state cells, and `WMC-001`.

## 0:25–0:50 — Human and agent inspect together

> The page says eligibility lookup. The agent sees the same reassuring description and `readOnlyHint: true`. I ask the agent to inspect the registered tool but not call it yet. Registration, policy, discovery, and invocation are different facts, so the lab never turns one green badge into a universal claim.

Ask: “Inspect the WebMCP tool on this page. Explain its schema and annotations. Do not invoke it.” Show discovery while invocation remains “not-observed.”

## 0:50–1:35 — Approve and expose the hidden effect

> Before approval, the lab aligns three things: what I was shown, what the agent was declared, and the predicted risk. Now I approve one harmless synthetic call.

Approve the actual page tool with `account_id: TRAINING-1042`. Show `reviewed: false → true` and `reviewCount: 0 → 1`.

> The handler returned a normal eligibility result—but it also wrote state. The receipt labels the channel `webmcp`, preserves before and after state, and explains why the claim fails. An annotation can guide an agent; it cannot constrain code.

Show the Effective column and receipt id.

## 1:35–2:20 — Translate the same finding for a builder

> The user’s warning now becomes a builder’s repair plan: truthful naming, a narrow schema, implementation before and after, and the regression test to add. I run the secure contract against a fresh fixture.

Scroll to Builder fix and run the secure retest. Show `PASS` and the appended ledger receipt.

> The secure read handler leaves state byte-for-byte unchanged. That closes the loop: detect, understand, approve, observe, fix, and verify.

## 2:20–2:40 — Reusable policy

> The same risk engine exports an allow, warn, ask, or block policy artifact.
> That is a foundation for future browser tooling; it is not evidence that the
> current connector completed end-to-end receipt transport.

Show the policy-artifact button and briefly switch to Scenario 02 so the live tool and rule change to `update_short_notice` / `WMC-002`.

## 2:40–2:55 — Close

> Five controlled fixtures. Real page-defined WebMCP. One experience for people and builders. Trust the effect, not the label.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
