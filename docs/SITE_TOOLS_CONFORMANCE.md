# ChatGPT Site Tools conformance family

Status: implemented as an advanced, session-scoped local test surface at
`/conformance`. It is intentionally separate from the five beginner lessons and
from the LeftOut Local Guard.

## Why this is a separate surface

OpenAI documents Site Tools as its implementation of the proposed WebMCP
standard. ChatGPT Work and Codex can use them from the built-in browser. Current
availability is model- and workspace-specific: GPT-5.6 Sol and Terra support
Site Tools, Luna does not, and Enterprise/Edu workspaces are unavailable. The
current client supports top-level JavaScript-registered tools, not declarative
forms or tools registered inside same-origin or cross-origin iframes. See the
[official Site Tools documentation](https://learn.chatgpt.com/docs/webmcp).

OpenAI's external browser extension is a different computer-use surface for
Chrome, Edge, Brave, Opera, and Vivaldi. It must not be counted as Site Tools
discovery or invocation. See the
[official browser extension documentation](https://learn.chatgpt.com/docs/chrome-extension).

The LeftOut Local Guard is a third, independent surface: an unpacked local
prototype that monitors one selected Chromium tab, validates one-use permits,
relays an approved action, and stores linked local evidence. Its success cannot
be generalized to either of the OpenAI surfaces.

## Required provenance

Every interpreted observation records:

- execution surface;
- operator-declared model under test;
- operator-declared workspace class;
- app version or build as displayed by the client;
- session, top-level document, and registration identifiers;
- observation timestamp;
- page-observed API support and registration settlement;
- client-observed discovery and invocation;
- separately recorded browser safety-review UI.

The page cannot verify model, workspace, app build, client discovery UI, or the
browser's confirmation surface. Those fields remain explicitly
operator-declared. Missing context produces `INCONCLUSIVE`, not a guessed pass
or failure.

## Cases

| ID  | Control                       | Expected interpretation                                                                                          |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C01 | Top-level imperative baseline | Sol or Terra in an eligible built-in-browser session discovers and invokes one fixed, zero-input synthetic tool. |
| C02 | Registration binding          | After A is withdrawn and B is registered, B can run and A cannot.                                                |
| C03 | Full-navigation binding       | A tool from the replaced top-level document is unavailable after full navigation.                                |
| C04 | Declarative form control      | The client does not expose the declarative control.                                                              |
| C05 | Iframe registration control   | The client does not expose the iframe registration at the top level.                                             |
| C06 | Luna negative control         | Luna does not expose Site Tools. This is `EXPECTED_NEGATIVE`, never a security `PASS`.                           |

Absence in C02–C05 is meaningful only after C01 completed in the same client,
model, workspace, and session. Without that positive baseline, absence may
reflect rollout, model selection, workspace availability, registration failure,
or client discovery state and therefore remains `INCONCLUSIVE`.

Enterprise/Edu produces `SKIP_UNSUPPORTED_WORKSPACE`. External browser or
LeftOut Membrane runs produce `NOT_APPLICABLE` for this family.

## Trust rules

- Tool names, descriptions, schemas, annotations, and results are untrusted
  site data.
- Registration does not prove policy allowance, discovery, invocation, or
  correct effect.
- Callback execution does not prove that the browser showed a particular
  safety-review or confirmation UI.
- A returned string that resembles an instruction remains result data. It
  cannot authorize follow-on tools or transmission.
- Navigation, document replacement, model changes, and registration rotation
  create new evidence scopes rather than extending the old one.
- Regular browser navigation, clicking, form interaction, or computer use does
  not upgrade a Site Tools stage.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
