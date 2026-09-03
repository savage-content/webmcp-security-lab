# Recorded demo: exact clicks, shots, and narration

**Target runtime:** 1:45–2:15
**Status:** recording candidate; no final video has been recorded

The recording has one human approval and one agent request. Do not give the
agent a setup preamble, ask it to navigate, type “proceed,” use a fallback
harness, or send a second run command.

## Before recording

1. Use a fresh compatible ChatGPT or Codex built-in-browser session.
2. Open the live lab and select the detected **Built-in Site Tools** path.
3. Open Lesson 1. Stop before **Review one eligibility check**.
4. Confirm that no receipt exists and no action has run.

If the approval expires or the client cannot discover the action, stop the
take and start fresh. Do not retry during the take.

## 0:00–0:12 — Show the product working

**Shot:** Lesson 1 and the fake `TRAINING-1042` task.

**Say:**

> This website gives my AI a structured WebMCP action. I can see exactly what
> it may do before either of us uses it.

## 0:12–0:35 — Review the task

**Click:** **Review one eligibility check**.

**Shot:** The fixed target, one-call limit, no account changes, and no retry.

**Say:**

> The original website action is reduced to one eligibility check for one fake
> account. My agent cannot change the target, add inputs, or call it twice.

## 0:35–0:55 — Approve, but do not run

**Click:** **Review and approve one check**, then **Approve one check — does not
run**.

**Shot:** **Now ask your agent to run the check once.**

**Say:**

> I approved one call. Approval did not run anything. The page registered the
> limited Site Tool; the agent still has to discover and call it.

## 0:55–1:20 — One agent request

**Switch to the chat that owns the built-in browser. Paste exactly once:**

> Run my approved TRAINING-1042 eligibility check once. Do not retry or use
> another Site Tool.

**Shot:** The agent's real Site Tool call and result. Do not show or claim a
browser-automation call.

## 1:20–1:45 — Verify the evidence

**Return to the page. Shot:** PASS or FAIL, answer, **Account data changed?**,
**Other observed effects?**, **Permission remaining?**, and the receipt ID.

**Say:**

> The page checks the returned answer, compares before and after state, and
> confirms whether anything else changed. The one-call permission is now gone.
> This receipt is evidence for this synthetic action only.

Only report success when the page displays a receipt that matches the agent's
actual call. If no matching receipt appears, say the demo stopped safely; do
not invent an outcome or receipt ID.

## 1:45–2:05 — Show the broader product

**Shot:** The five lesson cards, then the Local Guard and private reporting
sections without running another action.

**Say:**

> Four more lessons teach over-broad inputs, untrusted result text, misleading
> confirmations, and support overclaims. The optional Local Guard explores
> browser warnings and one-use enforcement. Reports remain private drafts
> unless a person explicitly exports them.

## Close

> Review the task. Approve one call. Ask the agent once. Check what changed.

This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.
