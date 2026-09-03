import { describe, expect, it } from 'vitest';

import { WINDOWS_NATIVE_HOST_REGISTRY_KEY } from '../products/native-host/install-plan';
import {
  createWindowsNativeHostLifecyclePlan,
  type InstalledNativeHostState,
  type NativeHostCandidate,
  type NativeHostReleaseDescriptor,
} from '../products/native-host/lifecycle-plan';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const INSTALL_ROOT = 'C:\\Program Files\\LeftOut Local Guard';
const RECEIPTS_ROOT = 'C:\\ProgramData\\LeftOut Local Guard Receipts';

function release(
  version: string,
  executable = 'a',
  certificate = 'b',
): NativeHostReleaseDescriptor {
  return {
    version,
    executableSha256: executable.repeat(64),
    signingCertificateSha256: certificate.repeat(64),
  };
}

function candidate(version: string): NativeHostCandidate {
  return {
    ...release(version, 'c', 'd'),
    sourceExecutablePath: `C:\\Users\\Tester\\Downloads\\local-guard-${version}.exe`,
  };
}

function installed(
  current = release('0.3.0'),
  previous?: NativeHostReleaseDescriptor,
): InstalledNativeHostState {
  return { extensionId: EXTENSION_ID, current, previous };
}

describe('Windows native host lifecycle plan', () => {
  it('verifies identity and signature before staging or registering an install', () => {
    const plan = createWindowsNativeHostLifecyclePlan({
      action: 'install',
      extensionId: EXTENSION_ID,
      installRoot: INSTALL_ROOT,
      receiptsRoot: RECEIPTS_ROOT,
      candidate: candidate('0.3.0'),
    });

    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      'verify-hkcu-registration',
      'verify-file-sha256',
      'verify-authenticode-certificate',
      'stage-executable',
      'write-host-manifest',
      'set-hkcu-registration',
      'probe-native-host',
      'write-lifecycle-state',
    ]);
    expect(plan.operations[5]).toEqual({
      kind: 'set-hkcu-registration',
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      manifestPath:
        'C:\\Program Files\\LeftOut Local Guard\\manifests\\0.3.0\\com.leftout.security.local_guard.json',
    });
    expect(plan.stateAfter?.current.manifest.allowed_origins).toEqual([
      `chrome-extension://${EXTENSION_ID}/`,
    ]);
    expect(plan.failurePolicy).toEqual({
      mode: 'remove-new-binding',
      authorityOnFailure: 'closed',
      automaticRetry: false,
    });
    expect(plan.claims).toEqual({
      planMutatesSystem: false,
      executionMutatesSystem: true,
      actionTimeAuthorizationRequired: true,
      exactStoreExtensionIdRequired: true,
      verifiedAuthenticodeCandidateRequired: true,
      retainedReceiptsPreserved: true,
      executorImplemented: false,
    });
  });

  it('updates only to a newer release and retains the current release for rollback', () => {
    const current = release('0.3.0');
    const older = release('0.2.0', 'e', 'f');
    const plan = createWindowsNativeHostLifecyclePlan({
      action: 'update',
      installRoot: INSTALL_ROOT,
      receiptsRoot: RECEIPTS_ROOT,
      installed: installed(current, older),
      candidate: candidate('0.4.0'),
    });

    expect(plan.stateAfter?.current.version).toBe('0.4.0');
    expect(plan.stateAfter?.previous?.version).toBe('0.3.0');
    const committedAt = plan.operations.findIndex(
      (operation) => operation.kind === 'write-lifecycle-state',
    );
    const retiredAt = plan.operations.findIndex(
      (operation) =>
        operation.kind === 'remove-file' && operation.path.includes('0.2.0'),
    );
    expect(retiredAt).toBeGreaterThan(committedAt);
    expect(plan.recoveryOperations[0]).toEqual({
      kind: 'set-hkcu-registration',
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      manifestPath:
        'C:\\Program Files\\LeftOut Local Guard\\manifests\\0.3.0\\com.leftout.security.local_guard.json',
    });

    expect(() =>
      createWindowsNativeHostLifecyclePlan({
        action: 'update',
        installRoot: INSTALL_ROOT,
        receiptsRoot: RECEIPTS_ROOT,
        installed: installed(current),
        candidate: candidate('0.3.0'),
      }),
    ).toThrow('newer');
  });

  it('rolls back only to the exact retained previous release', () => {
    const plan = createWindowsNativeHostLifecyclePlan({
      action: 'rollback',
      installRoot: INSTALL_ROOT,
      receiptsRoot: RECEIPTS_ROOT,
      installed: installed(release('0.4.0'), release('0.3.0', 'e', 'f')),
    });

    expect(plan.stateAfter?.current.version).toBe('0.3.0');
    expect(plan.stateAfter?.previous?.version).toBe('0.4.0');
    expect(plan.operations.map((operation) => operation.kind)).not.toContain(
      'stage-executable',
    );
    expect(plan.operations[1]).toMatchObject({
      kind: 'verify-file-sha256',
      path: expect.stringContaining('0.3.0'),
    });

    expect(() =>
      createWindowsNativeHostLifecyclePlan({
        action: 'rollback',
        installRoot: INSTALL_ROOT,
        receiptsRoot: RECEIPTS_ROOT,
        installed: installed(),
      }),
    ).toThrow('exact retained previous release');
  });

  it('closes authority before removal and never removes retained receipts', () => {
    const plan = createWindowsNativeHostLifecyclePlan({
      action: 'remove',
      installRoot: INSTALL_ROOT,
      receiptsRoot: RECEIPTS_ROOT,
      installed: installed(release('0.4.0'), release('0.3.0')),
    });
    expect(
      plan.operations.slice(0, 4).map((operation) => operation.kind),
    ).toEqual([
      'verify-hkcu-registration',
      'remove-hkcu-registration',
      'revoke-all-sessions',
      'stop-native-host',
    ]);
    expect(plan.stateAfter).toBeNull();
    expect(plan.failurePolicy.mode).toBe('resume-removal');
    for (const operation of plan.operations) {
      if (operation.kind === 'remove-file') {
        expect(operation.path.startsWith(RECEIPTS_ROOT)).toBe(false);
      }
    }
  });

  it('rejects path overlap, in-place candidates, malformed identity, and ambiguous state', () => {
    expect(() =>
      createWindowsNativeHostLifecyclePlan({
        action: 'install',
        extensionId: EXTENSION_ID,
        installRoot: INSTALL_ROOT,
        receiptsRoot: `${INSTALL_ROOT}\\receipts`,
        candidate: candidate('0.3.0'),
      }),
    ).toThrow('separate directory trees');
    expect(() =>
      createWindowsNativeHostLifecyclePlan({
        action: 'install',
        extensionId: EXTENSION_ID,
        installRoot: INSTALL_ROOT,
        receiptsRoot: RECEIPTS_ROOT,
        candidate: {
          ...candidate('0.3.0'),
          sourceExecutablePath: `${INSTALL_ROOT}\\candidate.exe`,
        },
      }),
    ).toThrow('outside install');
    expect(() =>
      createWindowsNativeHostLifecyclePlan({
        action: 'install',
        extensionId: '*'.repeat(32),
        installRoot: INSTALL_ROOT,
        receiptsRoot: RECEIPTS_ROOT,
        candidate: candidate('0.3.0'),
      }),
    ).toThrow();
    expect(() =>
      createWindowsNativeHostLifecyclePlan({
        action: 'remove',
        installRoot: INSTALL_ROOT,
        receiptsRoot: RECEIPTS_ROOT,
        installed: installed(release('0.3.0'), release('0.3.0')),
      }),
    ).toThrow('must differ');
  });
});
