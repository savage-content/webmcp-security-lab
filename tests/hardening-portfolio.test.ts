import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const portfolioPath = resolve(
  'docs/hardening/local-guard-reporting-2026-09-02/hardening.json',
);
const portfolio = JSON.parse(readFileSync(portfolioPath, 'utf8')) as {
  sourceEvidence: { artifactCount: number; collectionSha256: string };
  opportunities: Array<{
    proposalPath: string;
    options: Array<{
      optionId: string;
      diagramPaths: { before: string; after: string };
      tradeoffs: Array<{ dimension: string }>;
    }>;
  }>;
};
const root = dirname(portfolioPath);
const evidencePaths = [
  'products/extension/manifest.json',
  'products/extension/manifest.native-candidate.json',
  'products/extension/background.js',
  'products/extension/validation.js',
  'products/extension/native-transport.js',
  'products/native-host/native-messaging.ts',
  'products/native-host/runtime.ts',
  'products/native-host/ipc-protocol.ts',
  'products/native-host/ipc-client.ts',
  'products/native-host/install-plan.ts',
  'products/native-host/lifecycle-plan.ts',
  'products/native-host/manifest.template.json',
  'products/native-host/README.md',
  'tests/native-messaging.test.ts',
  'tests/native-transport.test.ts',
  'tests/native-ipc-protocol.test.ts',
  'tests/native-ipc-transport.test.ts',
  'tests/native-adapter.test.ts',
  'tests/connector-native-ipc.test.ts',
  'tests/native-host-install-plan.test.ts',
  'tests/native-host-lifecycle-plan.test.ts',
  'tests/extension-background.test.ts',
  'tests/extension-validation.test.ts',
  'tests/extension-manifest.test.ts',
  'tests/local-guard-package.test.ts',
  'products/extension/popup.html',
  'products/extension/popup.css',
  'products/extension/popup.js',
  'products/extension/release/store-submission.json',
  'products/extension/release/release-evidence.json',
  'products/extension/release/platform-matrix.json',
  'products/extension/release/incident-response.json',
  'products/extension/release/assets-src/local-guard-icon.svg',
  'products/extension/release/assets-src/small-promo-440x280.svg',
  'products/extension/release/assets/store-screenshot.provenance.json',
  'scripts/render-local-guard-store-assets.mts',
  'scripts/serve-local-guard-store-capture.mts',
  'tests/local-guard-store-assets.test.ts',
  'tests/local-guard-operations.test.ts',
  'app/local-guard/page.tsx',
  'app/local-guard/privacy/page.tsx',
  'app/local-guard/support/page.tsx',
  'products/connector/server.ts',
  'products/connector/ipc-server.ts',
  'products/connector/native-adapter.ts',
  'products/connector/setup.ts',
  'products/connector/README.md',
  'products/connector/issue-draft.ts',
  'products/connector/issue-review.ts',
  'products/connector/issue-publication.ts',
  'products/connector/issue-moderation.ts',
  'products/connector/external-report-action.ts',
  'products/connector/reporting-relay.ts',
  'products/connector/reporting-workbench.ts',
  'tests/external-report-action.test.ts',
  'tests/reporting-relay-client.test.ts',
  'tests/reporting-workbench.test.ts',
  'tests/connector-external-report.test.ts',
  'products/reporting-operator/reviewer-access.ts',
  'products/reporting-operator/reviewer-client.ts',
  'products/reporting-operator/reviewer-server.ts',
  'products/reporting-operator/reviewer-workbench.ts',
  'products/reporting-operator/README.md',
  'tests/reporting-reviewer-access.test.ts',
  'tests/reporting-reviewer-client.test.ts',
  'tests/reporting-reviewer-server.test.ts',
  'tests/reporting-reviewer-workbench.test.ts',
  'products/reporting-worker/worker.ts',
  'products/reporting-worker/wrangler.disabled.example.json',
  'products/reporting-worker/release-evidence.json',
  'products/reporting-worker/README.md',
  'scripts/assess-reporting-release.mts',
  'scripts/check-reporting-worker.mts',
  'tests/reporting-worker.test.ts',
  'tests/reporting-release-readiness.test.ts',
  'products/reporting-service/config.ts',
  'products/reporting-service/auth.ts',
  'products/reporting-service/ledger.ts',
  'products/reporting-service/store.ts',
  'products/reporting-service/deletion-core.ts',
  'products/reporting-service/delete.ts',
  'products/reporting-service/correction-core.ts',
  'products/reporting-service/correct.ts',
  'products/reporting-service/intake.ts',
  'app/api/reports/intake/route.ts',
  'products/reporting-service/review.ts',
  'app/api/reports/review/route.ts',
  'app/api/reports/review/[reportId]/route.ts',
  'products/reporting-service/publish.ts',
  'app/api/reports/publish/[reportId]/route.ts',
  'products/reporting-service/feed-signing.ts',
  'products/reporting-service/feed.ts',
  'app/api/reports/feed/route.ts',
  'products/reporting-service/retention-core.ts',
  'products/reporting-service/lifecycle.ts',
  'app/api/reports/lifecycle/[reportId]/route.ts',
  'app/api/reports/lifecycle/[reportId]/delete/route.ts',
  'app/api/reports/corrections/[publicId]/route.ts',
  'scripts/package-local-guard.mts',
  'scripts/attest-local-guard-release.mts',
  'scripts/assess-local-guard-release.mts',
  'db/schema.ts',
  'drizzle/0002_furry_miss_america.sql',
  'drizzle/0003_mixed_nightmare.sql',
  'drizzle/0004_colossal_tenebrous.sql',
  'drizzle/0005_fine_toad.sql',
  'drizzle/0006_silly_talkback.sql',
  'drizzle/0007_swift_hitman.sql',
  'docs/PRODUCT.md',
  'docs/ARCHITECTURE.md',
  'docs/THREAT_MODEL.md',
  'docs/LOCAL_GUARD_RELEASE.md',
  'docs/LOCAL_GUARD_INSTALL_LIFECYCLE.md',
  'docs/LOCAL_GUARD_OPERATIONS.md',
  'docs/LOCAL_GUARD_PRIVACY_REVIEW.md',
  'docs/REPORTING_SERVICE.md',
  'docs/REPORTING_PRIVACY_REVIEW.md',
];

describe('Local Guard and reporting hardening portfolio', () => {
  it('links every proposal and comparable diagram', () => {
    expect(portfolio.opportunities).toHaveLength(2);
    for (const opportunity of portfolio.opportunities) {
      expect(existsSync(resolve(root, opportunity.proposalPath))).toBe(true);
      for (const option of opportunity.options) {
        expect(existsSync(resolve(root, option.diagramPaths.before))).toBe(
          true,
        );
        expect(existsSync(resolve(root, option.diagramPaths.after))).toBe(true);
      }
    }
  });

  it('covers every required engineering tradeoff for every option', () => {
    const required = [
      'security',
      'performance',
      'memory',
      'reliability',
      'operability',
      'migration',
    ];
    for (const opportunity of portfolio.opportunities) {
      for (const option of opportunity.options) {
        expect(option.tradeoffs.map((item) => item.dimension).sort()).toEqual(
          [...required].sort(),
        );
      }
    }
  });

  it('binds the portfolio to the inventoried source collection', () => {
    const canonical = `${evidencePaths
      .map((path) => {
        const digest = createHash('sha256')
          .update(
            readFileSync(resolve(path), 'utf8').replaceAll('\r\n', '\n'),
            'utf8',
          )
          .digest('hex');
        return `${path}\t${digest}`;
      })
      .join('\n')}\n`;
    expect(portfolio.sourceEvidence.artifactCount).toBe(evidencePaths.length);
    expect(portfolio.sourceEvidence.collectionSha256).toBe(
      createHash('sha256').update(canonical, 'utf8').digest('hex'),
    );
  });
});
