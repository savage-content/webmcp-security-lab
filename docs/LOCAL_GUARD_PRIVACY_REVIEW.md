# Local Guard privacy and store review

## Decision

Local Guard `0.3.0` remains a controlled developer preview. Its source now
contains a pre-inspection consent gate, public privacy and support routes, and
review-ready store disclosure copy. Those improvements do not make the package
an ordinary-user release.

## Data boundary

The extension handles the selected tab origin and path, WebMCP declarations,
short-lived local bridge credentials, one-use capability state, and a bounded
synthetic result and receipt. It does not read general page text, form data,
passwords, cookies, or unselected-tab history. It sends this data only to a
user-controlled loopback connector and has no developer collection,
advertising, analytics, or telemetry endpoint.

The Chrome Web Store treats local processing as data handling. The submitted
privacy fields therefore need to disclose web history, website content, and
the local connector credentials conservatively. The store copy and runtime
behavior are bound in
`products/extension/release/store-submission.json`.

## Consent and withdrawal

The popup does not query the active tab until the person accepts the prominent
local data notice. Consent is versioned as
`leftout.local-guard-data-handling/1`; a future change in handling must use a
new version and collect a new choice. The popup includes a stop control that
revokes the pairing, removes any unconsumed permit, and clears the choice. A
consumed permit digest can remain only until expiry to prevent replay.

## Production blockers

Plain HTTP loopback is retained only for the developer preview. A production
release requires an extension-ID-bound native-messaging channel or an
equivalent reviewed secure local transport. The fixed extension identity is
not available until a production publisher/store identity exists, so native
host registration cannot be truthfully finalized yet.

Chrome documents that ordinary-user installation requires Chrome Web Store
hosting and signing, while self-hosting on Windows and macOS is restricted to
managed policy. The store also requires an accurate single purpose,
permission justifications, remote-code declaration, data-use disclosure,
privacy-policy URL, and listing assets. These source artifacts are necessary
but do not establish Web Store approval.

Official references reviewed on 2026-09-02:

- <https://developer.chrome.com/docs/extensions/how-to/distribute>
- <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- <https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements>
- <https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements>
- <https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>
- <https://developer.chrome.com/docs/webstore/images>

## Required release evidence

`products/extension/release/release-evidence.json` is the explicit external
gate ledger. Only independently inspectable evidence may move a gate to
`verified`. Source-ready privacy pages are not a deployed privacy URL; an
attested ZIP is not Web Store signing; an unpacked browser run is not acceptance
of the exact signed candidate.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
