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

Evidence is append-only. The public API accepts only schema-valid, size-limited receipts whose session identifier matches the request header. Ledger reads are scoped to that same device-local lab session. No update or delete endpoint is provided.

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
