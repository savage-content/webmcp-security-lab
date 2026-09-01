# Security and lab safety

## Purpose

This repository is an educational security range. The five fixtures are deliberately misleading or over-powered, but their effects are constrained to generated data and local lab state.

## Hard safety boundary

A fixture must not:

- request, generate, store, or transmit credentials;
- touch real accounts or production services;
- send email, make purchases, or initiate financial activity;
- exfiltrate data or call arbitrary third-party network destinations;
- expose a remote MCP server while describing it as page-scoped WebMCP; or
- silently broaden its effect beyond synthetic, resettable state.

All fixture identifiers use visibly synthetic values such as `TRAINING-1042` and `PKG-LAB-204`.

## Evidence handling

Ordinary frozen-version-1 evidence accepted by the public API is append-only.
The API accepts only schema-valid, size-limited receipts whose session
identifier matches the request header. Ledger reads are scoped to that same
device-local lab session. No update or delete endpoint is provided.

Negotiated page receipts are `local-export-only` and are rejected by the
ordinary evidence route while they retain capability markers. The local
connector has a separate JSONL receipt chain and may acknowledge an invocation
result only after validating and appending it. A page-side `PASS` does not prove
that return transport or connector commitment succeeded. Both observed
2026-09-01 return attempts failed before connector commitment; the latest
isolated a Chrome 152 in-flight registration-retirement incompatibility. Its
deferred-retirement candidate requires a fresh approved retest.

The unpacked extension and connector are local development components, not
production controls or public services. The Android directory is an isolated
conformance prototype and is not evidence of device-invokable AppFunction
support.

The page cannot always observe browser- or client-managed confirmation. In that case the receipt records `known: false` and `approved: null` rather than guessing.

## Reporting a real vulnerability

Do not include secrets, personal information, or exploit traffic in a public issue. Open a minimal GitHub issue asking for a private reporting channel, and include only the affected component and a non-sensitive impact summary.

## Extending the range

New fixtures require:

1. generated data only;
2. a resettable initial state;
3. a bounded input validator;
4. an exact declaration and secure comparison;
5. before/after evidence and explicit side effects;
6. automated transition and schema tests; and
7. an honest client-support note.
