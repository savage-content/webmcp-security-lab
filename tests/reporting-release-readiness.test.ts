import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assessReportingRelease } from '../scripts/assess-reporting-release.mts';

describe('reporting release readiness', () => {
  it('validates a disabled source package without claiming operations', async () => {
    const result = await assessReportingRelease({ outputPath: null });
    expect(result.report).toMatchObject({
      releaseChannel: 'disabled_source_preview',
      sourceReady: true,
      operationalReleaseReady: false,
      claims: {
        standaloneWorkerSource: true,
        browserAssetsServed: false,
        reportingMode: 'disabled',
        productionDatabaseBound: false,
        publicHostnameConfigured: false,
        externalIntakeEnabled: false,
      },
    });
    expect(result.report.blockers).toContain('privacy_approval');
    expect(result.report.blockers).toContain('separate_service_hostname');
    expect(result.report.blockers).toContain('invited_cohort_enablement');
  });

  it('rejects a template that silently enables a public worker route', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-reporting-gate-'));
    const sourcePath =
      'products/reporting-worker/wrangler.disabled.example.json';
    const config = JSON.parse(await readFile(sourcePath, 'utf8')) as Record<
      string,
      unknown
    >;
    config.workers_dev = true;
    const configPath = join(directory, 'wrangler.json');
    await writeFile(configPath, JSON.stringify(config), 'utf8');
    await expect(
      assessReportingRelease({ configPath, outputPath: null }),
    ).rejects.toThrow();
  });

  it('rejects completion evidence on a gate still marked missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-reporting-gate-'));
    const sourcePath = 'products/reporting-worker/release-evidence.json';
    const evidence = JSON.parse(await readFile(sourcePath, 'utf8')) as {
      gates: Array<{
        id: string;
        status: string;
        evidence: string[];
      }>;
    };
    const privacy = evidence.gates.find(
      (gate) => gate.id === 'privacy_approval',
    );
    if (!privacy) throw new Error('Privacy gate fixture is missing.');
    privacy.evidence = ['docs/REPORTING_PRIVACY_REVIEW.md'];
    const evidencePath = join(directory, 'release-evidence.json');
    await writeFile(evidencePath, JSON.stringify(evidence), 'utf8');
    await expect(
      assessReportingRelease({ evidencePath, outputPath: null }),
    ).rejects.toThrow('may not cite completion evidence');
  });
});
