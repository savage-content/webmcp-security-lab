import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { assessLocalGuardRelease } from '../scripts/assess-local-guard-release.mts';

const releaseRoot = new URL('../products/extension/release/', import.meta.url);

describe('Local Guard platform and incident operations', () => {
  it('records one scoped preview observation and zero production-supported combinations', async () => {
    const matrix = JSON.parse(
      await readFile(new URL('platform-matrix.json', releaseRoot), 'utf8'),
    );
    expect(matrix).toMatchObject({
      schemaVersion: 'leftout.local-guard-platform-matrix/1',
      ordinaryUserSupportApproved: false,
      productionApprovedCombinationCount: 0,
    });
    expect(
      new Set(matrix.entries.map((entry: { id: string }) => entry.id)).size,
    ).toBe(matrix.entries.length);
    const observed = matrix.entries.filter(
      (entry: { evidenceLevel: string }) =>
        entry.evidenceLevel === 'observed_controlled_preview',
    );
    expect(observed).toEqual([
      expect.objectContaining({
        operatingSystem: 'Windows 11',
        architecture: 'x64',
        client: 'Google Chrome',
        clientVersion: '152',
        distribution: 'unpacked_developer_preview',
        transport: 'loopback_http',
        productStatus: 'developer_preview_only',
      }),
    ]);
    expect(
      matrix.entries.some(
        (entry: { productStatus: string }) =>
          entry.productStatus === 'production_supported',
      ),
    ).toBe(false);
    expect(matrix.claimBoundary).toContain('no universal');
  });

  it('keeps Android at JVM conformance without a device-support claim', async () => {
    const matrix = JSON.parse(
      await readFile(new URL('platform-matrix.json', releaseRoot), 'utf8'),
    );
    const android = matrix.entries.find(
      (entry: { operatingSystem: string }) =>
        entry.operatingSystem === 'Android',
    );
    expect(android).toMatchObject({
      evidenceLevel: 'jvm_conformance_only',
      distribution: 'not_built',
      transport: 'not_implemented',
      productStatus: 'unsupported',
    });
    expect(android.limitations.join(' ')).toContain('No Android application');
  });

  it('keeps response authority disabled, unowned, and unrehearsed', async () => {
    const response = JSON.parse(
      await readFile(new URL('incident-response.json', releaseRoot), 'utf8'),
    );
    expect(response).toMatchObject({
      schemaVersion: 'leftout.local-guard-incident-response/1',
      status: 'draft_unowned',
      productionActivated: false,
      rehearsalCompleted: false,
      defaultContainment: {
        reportingMode: 'disabled_when_unconfigured',
        nativeHostRegistration: 'absent',
        chromeWebStoreItem: 'not_created',
        automaticRetry: false,
        automaticPublicDisclosure: false,
      },
      claims: {
        sourceRunbookReady: true,
        namedOwnersAssigned: false,
        operatorRehearsalVerified: false,
        responseTimeCommitmentPublished: false,
        ordinaryUserReleaseReady: false,
      },
    });
    expect(
      Object.values(response.requiredOwners).every((value) => value === null),
    ).toBe(true);
    expect(
      response.incidentClasses.map((entry: { id: string }) => entry.id),
    ).toEqual(
      expect.arrayContaining([
        'extension_integrity_or_authority_drift',
        'native_host_identity_or_channel_compromise',
        'signing_key_or_publisher_account_compromise',
        'private_reporting_data_or_operator_credential_exposure',
        'erroneous_or_tampered_public_feed_record',
      ]),
    );
  });

  it('records operations gates as source-ready without removing release blockers', async () => {
    const evidence = JSON.parse(
      await readFile(new URL('release-evidence.json', releaseRoot), 'utf8'),
    );
    for (const id of [
      'external_reporting_operations',
      'supported_platform_matrix',
      'release_incident_response',
    ]) {
      expect(
        evidence.gates.find((gate: { id: string }) => gate.id === id),
      ).toMatchObject({
        status: 'source_ready',
      });
    }
    expect(
      evidence.gates.find(
        (gate: { id: string }) => gate.id === 'external_reporting_operations',
      ).evidence,
    ).toEqual(
      expect.arrayContaining([
        'products/reporting-operator/reviewer-server.ts',
        'tests/reporting-reviewer-server.test.ts',
      ]),
    );
    const { report } = await assessLocalGuardRelease({ outputPath: null });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        'external_reporting_operations',
        'supported_platform_matrix',
        'release_incident_response',
      ]),
    );
    expect(report.ordinaryUserReleaseReady).toBe(false);
  });
});
