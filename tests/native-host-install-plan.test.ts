import { describe, expect, it } from 'vitest';

import {
  createWindowsNativeHostInstallPlan,
  WINDOWS_NATIVE_HOST_REGISTRY_KEY,
} from '../products/native-host/install-plan';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('Windows native host installation plan', () => {
  it('binds an exact store extension ID to an exact executable and HKCU manifest', () => {
    const plan = createWindowsNativeHostInstallPlan({
      extensionId: EXTENSION_ID,
      executablePath:
        'C:\\Program Files\\LeftOut Local Guard\\leftout-local-guard-native-host.exe',
      manifestPath:
        'C:\\ProgramData\\LeftOut Local Guard\\com.leftout.security.local_guard.json',
    });
    expect(plan.manifest).toEqual({
      name: 'com.leftout.security.local_guard',
      description: 'Left Out Local Guard identity-bound native messaging host',
      path: 'C:\\Program Files\\LeftOut Local Guard\\leftout-local-guard-native-host.exe',
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    });
    expect(plan.registration).toEqual({
      hive: 'HKCU',
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      valueName: '',
      value:
        'C:\\ProgramData\\LeftOut Local Guard\\com.leftout.security.local_guard.json',
    });
    expect(plan.claims).toEqual({
      mutatesSystem: false,
      requiresSignedExecutableBeforeInstall: true,
      requiresExactStoreExtensionId: true,
    });
  });

  it('rejects wildcard identities and ambiguous executable or manifest paths', () => {
    expect(() =>
      createWindowsNativeHostInstallPlan({
        extensionId: '*'.repeat(32),
        executablePath: 'C:\\host.exe',
        manifestPath: 'C:\\host.json',
      }),
    ).toThrow();
    expect(() =>
      createWindowsNativeHostInstallPlan({
        extensionId: EXTENSION_ID,
        executablePath: '.\\host.exe',
        manifestPath: 'C:\\host.json',
      }),
    ).toThrow('absolute Windows');
    expect(() =>
      createWindowsNativeHostInstallPlan({
        extensionId: EXTENSION_ID,
        executablePath: 'C:\\host.cmd',
        manifestPath: 'C:\\host.json',
      }),
    ).toThrow('Windows .exe');
  });
});
