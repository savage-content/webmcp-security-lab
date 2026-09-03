import { win32 } from 'node:path';

import {
  expectedExtensionOrigin,
  NATIVE_HOST_NAME,
  parseExtensionId,
} from './native-messaging';

export const WINDOWS_NATIVE_HOST_REGISTRY_KEY = `Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;

export interface WindowsNativeHostInstallInput {
  extensionId: string;
  executablePath: string;
  manifestPath: string;
}

function absoluteWindowsFile(
  value: string,
  extension: '.exe' | '.json',
  label: string,
) {
  if (
    !win32.isAbsolute(value) ||
    win32.extname(value).toLowerCase() !== extension ||
    value.includes('\0')
  ) {
    throw new Error(`${label} must be an absolute Windows ${extension} path.`);
  }
  return win32.normalize(value);
}

export function createWindowsNativeHostInstallPlan(
  input: WindowsNativeHostInstallInput,
) {
  const extensionId = parseExtensionId(input.extensionId);
  const executablePath = absoluteWindowsFile(
    input.executablePath,
    '.exe',
    'Native host executable',
  );
  const manifestPath = absoluteWindowsFile(
    input.manifestPath,
    '.json',
    'Native host manifest',
  );
  const manifest = Object.freeze({
    name: NATIVE_HOST_NAME,
    description: 'LeftOut Local Guard identity-bound native messaging host',
    path: executablePath,
    type: 'stdio' as const,
    allowed_origins: Object.freeze([expectedExtensionOrigin(extensionId)]),
  });
  return Object.freeze({
    schemaVersion: 'leftout.local-guard-windows-install-plan/1' as const,
    extensionId,
    manifestPath,
    manifest,
    registration: Object.freeze({
      hive: 'HKCU' as const,
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      valueName: '' as const,
      value: manifestPath,
    }),
    uninstall: Object.freeze({
      hive: 'HKCU' as const,
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      removeManifestPath: manifestPath,
      removeExecutablePath: executablePath,
    }),
    claims: Object.freeze({
      mutatesSystem: false as const,
      requiresSignedExecutableBeforeInstall: true as const,
      requiresExactStoreExtensionId: true as const,
    }),
  });
}
