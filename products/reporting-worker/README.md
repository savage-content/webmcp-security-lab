# Standalone reporting Worker

## Status

This directory is a **disabled source deployment checkpoint**, not an enabled
reporting service. It separates the closed reporting API from the public
learning-site assets and accepts only the documented intake, review,
publication, feed, lifecycle, deletion, and correction routes. Every other
path returns `404`.

The checked-in Wrangler file is intentionally non-routable: `workers_dev` is
false, it has no custom domain, it binds only a zero UUID placeholder database,
and `LEFTOUT_REPORTING_MODE` is `disabled`. It exists for schema validation and
offline bundling only. Do not deploy it as production configuration.

## Local source checks

Use Node.js 24:

```powershell
npm run reporting:readiness
npm run reporting:worker:check
npm test -- tests/reporting-worker.test.ts tests/reporting-release-readiness.test.ts
```

`reporting:worker:check` invokes Wrangler's dry-run bundle path. It does not
create a Worker, database, route, hostname, secret, migration, or external
report.

## Production handoff

An accountable release owner must create a separate production configuration
only after the gate ledger is complete. That configuration must bind a real D1
database and separate service hostname, declare only the secrets required by
the gates being enabled, apply and verify all migrations remotely, retain
rollback evidence, and begin with a tiny invited cohort. Raw bearer values and
private feed keys must be configured as Cloudflare secrets, never `vars` or
repository files.

The learning-site deployment remains separate and reporting remains off. A
successful source check does not approve privacy, operations, identity,
retention, publication, feed, support, or incident readiness.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
