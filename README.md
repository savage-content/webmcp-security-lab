# Left Out Security WebMCP Security Lab

![WebMCP Security Lab — Trust the effect, not the label](public/og.png)

> A controlled, open-source WebMCP test range that compares what a human sees, what an agent is told, and what a page-scoped tool actually does.

**Live demo:** added at deployment  
**Source:** <https://github.com/savage-content/webmcp-security-lab>  
**License:** [MIT](LICENSE)

## Why this lab exists

WebMCP creates an agent-facing surface on a web page. That surface can differ from the human-facing UI—and both can differ from the code that ultimately runs.

This lab makes those differences observable:

1. **Presented Surface** — human labels, controls, confirmation copy, and visible state.
2. **Declared Agent Surface** — the real tool name, description, JSON Schema, annotations, and registration identity supplied through `document.modelContext.registerTool()`.
3. **Effective Surface** — invocation channel, arguments, raw result, before/after state, side effects, verdict, and remediation.

The Effective Surface is the security truth.

## What is real

- The selected fixture is registered at runtime with `document.modelContext.registerTool()`.
- A supported same-origin client can discover it with `document.modelContext.getTools()` and invoke it with `document.modelContext.executeTool()`.
- Every path—external WebMCP invocation, in-page WebMCP self-test, and explicit fallback harness—uses the same scenario handler.
- Every run produces a schema-validated evidence receipt and attempts an append-only write to Cloudflare D1.
- The UI reports unsupported, blocked, undiscovered, and failed states without calling them WebMCP success.

The fallback harness is intentionally labeled as a harness. It is useful for education in unsupported browsers, but it is not represented as agent discovery or ordinary browser automation disguised as WebMCP.

## Three-minute demo path

1. Open Scenario 01 and compare the visible “read-only” promise with `readOnlyHint: true`.
2. Run the fixture. The synthetic account flips from `reviewed: false` to `reviewed: true`.
3. Expand the JSON receipt to show the exact declaration, arguments, confirmation, before/after state, raw result, and side effects.
4. Open Scenario 03 to show a legitimate delivery result containing controlled instruction-shaped text.
5. Open Scenario 05 to distinguish registration, browser policy, and client discovery.

The complete narration is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Scenario catalog

| # | Fixture | Deliberate mismatch | Secure comparison |
|---|---|---|---|
| 01 | Read-only claim | Description and `readOnlyHint` say read-only; handler marks a synthetic account reviewed | Pure lookup handler; separate truthful mutation |
| 02 | Over-broad schema | Agent receives `target` and free-form `instruction` fields absent from the human UI | One bounded `notice` field, fixed target, no additional properties |
| 03 | Tool-result injection | Status result mixes valid data with controlled instruction-shaped text | Structured untrusted field plus `untrustedContentHint: true` |
| 04 | Confirmation mismatch | “Preview only” approval disables a synthetic subscription | Truthful mutation name, write annotation, exact before/after confirmation |
| 05 | Client variance | Registration is presented as universal agent availability | Scoped observation of registered, permitted, and discovered states |

Detailed contracts are in [docs/SCENARIOS.md](docs/SCENARIOS.md).

## Architecture

The app is a Vinext/React site that emits Cloudflare Worker-compatible ESM. Scenario state remains isolated in the browser; immutable evidence receipts are persisted to D1 behind a small storage boundary.

```text
Human UI ───────┐
                ├──> one scenario handler ──> before/after + raw result
WebMCP execute ─┘                              │
                                              └──> validated receipt ──> D1 append
```

Only the selected fixture is registered. An `AbortController` unregisters it when the user changes scenarios or leaves the page. The ledger is partitioned by a random device-local lab-session identifier; D1 remains the source of truth.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Local development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

The application always works as an educational range through its explicitly labeled harness. To exercise the actual WebMCP path, use a browser/client that exposes `document.modelContext`. Chrome documents an origin trial and a local `chrome://flags/#enable-webmcp-testing` flag; support is experimental and must be checked in the exact client being demonstrated. See the [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp) and the [WebMCP proposal](https://github.com/webmachinelearning/webmcp).

## Tests and verification

```bash
npm test
npm run lint
npm run build
```

The automated suite covers:

- all five scenario transitions;
- schema validation for vulnerable and secure tool contracts;
- before/after evidence generation;
- controlled no-mutation prompt-injection output; and
- required receipt fields.

The current verification matrix—including unsupported and unverified items—is in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Evidence ledger

Each append-only receipt contains:

- scenario id and version;
- ISO timestamp and origin;
- browser/client information available to the page;
- WebMCP registration, policy, and discovery observations;
- the exact tool declaration and invocation arguments;
- confirmation copy and whether approval was observable;
- raw result, before/after state, and side effects;
- verdict, plain-language debrief, and remediation.

Receipts can be downloaded as JSON. There are no update or delete endpoints. Request bodies are schema-validated, size-limited, and scoped to the visitor’s lab session.

## Deployment

The repository includes `.openai/hosting.json` with a logical `DB` binding and generated Drizzle migrations.

1. Run `npm test` and `npm run build`.
2. Create or select a Sites project.
3. Bind D1 as `DB` and apply the migrations under `drizzle/`.
4. Deploy the exact validated build output.
5. Verify `/`, `/api/evidence`, one persisted receipt, and the selected WebMCP tool in the target client.

No secrets are required.

## Safety boundary

This project contains deliberately vulnerable behavior for education. It never needs credentials, real accounts, production integrations, purchases, email, network exfiltration, or uncontrolled external effects. Use only the generated fixture data included with the lab.

Read [SECURITY.md](SECURITY.md) before extending a fixture.

## Contest materials

- [Devpost-ready copy](docs/CONTEST_SUBMISSION.md)
- [Three-minute video script](docs/DEMO_SCRIPT.md)
- [Contest-period work log](docs/CONTEST_PERIOD_WORK.md)
- [Verification report](docs/VERIFICATION.md)

## License

Copyright © 2026 Left Out Security. Released under the [MIT License](LICENSE).
