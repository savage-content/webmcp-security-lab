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
  'products/extension/background.js',
  'products/extension/popup.html',
  'products/extension/popup.css',
  'products/connector/server.ts',
  'products/connector/issue-draft.ts',
  'products/connector/issue-review.ts',
  'products/connector/issue-publication.ts',
  'products/connector/issue-moderation.ts',
  'scripts/package-local-guard.mts',
  'docs/PRODUCT.md',
  'docs/THREAT_MODEL.md',
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
          .update(readFileSync(resolve(path)))
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
