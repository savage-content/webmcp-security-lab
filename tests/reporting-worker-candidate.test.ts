import { describe, expect, it } from 'vitest';

import { createRoutableDisabledReportingCandidate } from '../products/reporting-worker/candidate';

const DIGEST = 'a'.repeat(64);

function input(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'leftout.reporting-routable-candidate-input/1',
    candidateDate: '2026-09-03',
    workerName: 'leftout-reporting',
    serviceHostname: 'reports.security.example.com',
    learningSiteHostname: 'learn.security.example.com',
    databaseName: 'leftout-reporting',
    databaseId: '4bd375d5-50df-46a0-9f6b-bd37542819d7',
    ...overrides,
  };
}

function sourceEvidence() {
  return {
    releaseEvidenceSha256: DIGEST,
    workerSourceSha256: DIGEST,
    migrationSetSha256: DIGEST,
  };
}

describe('routable disabled reporting candidate', () => {
  it('creates a separate custom-domain configuration that remains inert', () => {
    const candidate = createRoutableDisabledReportingCandidate(
      input(),
      sourceEvidence(),
    );
    expect(candidate.configuration).toMatchObject({
      main: '../../../../products/reporting-worker/worker.ts',
      workers_dev: false,
      preview_urls: false,
      routes: [
        { pattern: 'reports.security.example.com', custom_domain: true },
      ],
      vars: { LEFTOUT_REPORTING_MODE: 'disabled' },
      d1_databases: [
        {
          binding: 'DB',
          database_id: '4bd375d5-50df-46a0-9f6b-bd37542819d7',
          migrations_dir: '../../../../drizzle',
        },
      ],
    });
    expect(candidate.configurationBytes).not.toContain('token');
    expect(candidate.manifest.claims).toEqual({
      mutatesCloudflare: false,
      deploysService: false,
      reportingMode: 'disabled',
      externalIntakeEnabled: false,
      containsSecrets: false,
      privacyApproved: false,
      operationalReleaseReady: false,
    });
  });

  it('rejects the learning-site hostname, reserved names, IPs, and placeholders', () => {
    expect(() =>
      createRoutableDisabledReportingCandidate(
        input({ serviceHostname: 'learn.security.example.com' }),
        sourceEvidence(),
      ),
    ).toThrow('separate');
    for (const serviceHostname of [
      'localhost',
      '127.0.0.1',
      'reports.example',
      'HTTPS://reports.security.example.com',
    ]) {
      expect(() =>
        createRoutableDisabledReportingCandidate(
          input({ serviceHostname }),
          sourceEvidence(),
        ),
      ).toThrow();
    }
    expect(() =>
      createRoutableDisabledReportingCandidate(
        input({ databaseId: '00000000-0000-4000-8000-000000000000' }),
        sourceEvidence(),
      ),
    ).toThrow('non-placeholder');
  });

  it('rejects unknown authority and malformed source evidence', () => {
    expect(() =>
      createRoutableDisabledReportingCandidate(
        input({ enableIntake: true }),
        sourceEvidence(),
      ),
    ).toThrow();
    expect(() =>
      createRoutableDisabledReportingCandidate(input(), {
        ...sourceEvidence(),
        releaseEvidenceSha256: 'not-a-digest',
      }),
    ).toThrow();
  });
});
