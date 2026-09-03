import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assessLocalGuardRelease } from '../scripts/assess-local-guard-release.mts';

describe('Local Guard ordinary-user release gate', () => {
  it('binds complete source disclosures while refusing current release claims', async () => {
    const { report } = await assessLocalGuardRelease({ outputPath: null });

    expect(report.sourceDisclosureReady).toBe(true);
    expect(report.storeAssetsReady).toBe(false);
    expect(report.ordinaryUserReleaseReady).toBe(false);
    expect(report.releaseChannel).toBe('developer_preview');
    expect(report.blockers).toEqual([
      'store_graphic_assets',
      'publisher_identity',
      'chrome_web_store_review_and_signing',
      'native_messaging_identity_channel',
      'secure_local_transport',
      'install_update_rollback_removal',
      'signed_candidate_novice_accessibility',
      'public_privacy_and_support_deployment',
      'external_reporting_operations',
      'supported_platform_matrix',
      'release_incident_response',
    ]);
    expect(report.claims).toEqual({
      chromeWebStoreSigned: false,
      nativeMessagingIdentityBound: false,
      secureLocalTransport: false,
      ordinaryUserDistributionApproved: false,
    });
    expect(report.sourceDigests.map((item) => item.file)).toContain(
      'app/local-guard/privacy/page.tsx',
    );
  });

  it('rejects permission disclosure drift from the shipped manifest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-store-drift-'));
    const path = join(directory, 'store-submission.json');
    const store = JSON.parse(
      await readFile(
        'products/extension/release/store-submission.json',
        'utf8',
      ),
    ) as { permissions: Array<{ name: string }> };
    store.permissions[0].name = 'tabs';
    await writeFile(path, `${JSON.stringify(store)}\n`, 'utf8');

    await expect(
      assessLocalGuardRelease({ storeSubmissionPath: path, outputPath: null }),
    ).rejects.toThrow('permission disclosures do not match');
  });

  it('rejects a verified secure-transport claim while loopback HTTP remains', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-gate-drift-'));
    const path = join(directory, 'release-evidence.json');
    const evidence = JSON.parse(
      await readFile(
        'products/extension/release/release-evidence.json',
        'utf8',
      ),
    ) as {
      gates: Array<{
        id: string;
        status: string;
        evidence: string[];
      }>;
    };
    const gate = evidence.gates.find(
      (item) => item.id === 'secure_local_transport',
    );
    if (!gate) throw new Error('Secure transport gate fixture is missing.');
    gate.status = 'verified';
    gate.evidence = ['docs/LOCAL_GUARD_PRIVACY_REVIEW.md'];
    await writeFile(path, `${JSON.stringify(evidence)}\n`, 'utf8');

    await expect(
      assessLocalGuardRelease({ releaseEvidencePath: path, outputPath: null }),
    ).rejects.toThrow('HTTP remains active');
  });

  it('requires prominent consent before selected-tab initialization', async () => {
    const [html, script] = await Promise.all([
      readFile('products/extension/popup.html', 'utf8'),
      readFile('products/extension/popup.js', 'utf8'),
    ]);

    expect(html).toContain('id="data-consent"');
    expect(html).toContain('not to Left Out Security');
    expect(html).toContain('/local-guard/privacy');
    expect(script).toContain(
      "const CONSENT_VERSION = 'leftout.local-guard-data-handling/1'",
    );
    expect(script).toContain('void initializeConsent()');
    expect(script).not.toContain('void initialize();\nsetInterval');
  });

  it('publishes specific privacy, support, and release limitations', async () => {
    const [overview, privacy, support] = await Promise.all([
      readFile('app/local-guard/page.tsx', 'utf8'),
      readFile('app/local-guard/privacy/page.tsx', 'utf8'),
      readFile('app/local-guard/support/page.tsx', 'utf8'),
    ]);

    expect(overview).toContain('No public release');
    expect(overview).toContain('not a public setup choice');
    expect(privacy).toContain('Future-work privacy boundary');
    expect(privacy).toContain('no telemetry or advertising');
    expect(support).toContain('no public Local Guard setup path');
    expect(support).toContain('Public intake and security-feed');
  });
});
