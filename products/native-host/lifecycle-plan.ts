import { win32 } from 'node:path';

import {
  createWindowsNativeHostInstallPlan,
  WINDOWS_NATIVE_HOST_REGISTRY_KEY,
} from './install-plan';
import { expectedExtensionOrigin, parseExtensionId } from './native-messaging';

const VERSION_PATTERN =
  /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EXECUTABLE_NAME = 'leftout-local-guard-native-host.exe';
const STATE_FILE_NAME = 'install-state.json';

export interface NativeHostReleaseDescriptor {
  version: string;
  executableSha256: string;
  signingCertificateSha256: string;
}

export interface NativeHostCandidate extends NativeHostReleaseDescriptor {
  sourceExecutablePath: string;
}

export interface InstalledNativeHostState {
  extensionId: string;
  current: NativeHostReleaseDescriptor;
  previous?: NativeHostReleaseDescriptor;
}

interface LifecycleBase {
  installRoot: string;
  receiptsRoot: string;
}

export type WindowsNativeHostLifecycleInput =
  | (LifecycleBase & {
      action: 'install';
      extensionId: string;
      candidate: NativeHostCandidate;
      installed?: never;
    })
  | (LifecycleBase & {
      action: 'update';
      candidate: NativeHostCandidate;
      installed: InstalledNativeHostState;
      extensionId?: never;
    })
  | (LifecycleBase & {
      action: 'rollback';
      installed: InstalledNativeHostState;
      extensionId?: never;
      candidate?: never;
    })
  | (LifecycleBase & {
      action: 'remove';
      installed: InstalledNativeHostState;
      extensionId?: never;
      candidate?: never;
    });

export type WindowsLifecycleOperation =
  | Readonly<{
      kind: 'verify-hkcu-registration';
      key: string;
      expectedManifestPath: string | null;
    }>
  | Readonly<{ kind: 'verify-file-sha256'; path: string; sha256: string }>
  | Readonly<{
      kind: 'verify-authenticode-certificate';
      path: string;
      certificateSha256: string;
    }>
  | Readonly<{
      kind: 'stage-executable';
      sourcePath: string;
      destinationPath: string;
    }>
  | Readonly<{
      kind: 'write-host-manifest';
      path: string;
      manifest: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      kind: 'set-hkcu-registration';
      key: string;
      manifestPath: string;
    }>
  | Readonly<{ kind: 'remove-hkcu-registration'; key: string }>
  | Readonly<{
      kind: 'probe-native-host';
      extensionOrigin: string;
      timeoutMs: 5_000;
    }>
  | Readonly<{
      kind: 'write-lifecycle-state';
      path: string;
      state: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{ kind: 'revoke-all-sessions' }>
  | Readonly<{ kind: 'stop-native-host' }>
  | Readonly<{ kind: 'remove-file'; path: string }>;

function absoluteDirectory(value: string, label: string) {
  if (!win32.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be an absolute Windows directory.`);
  }
  const normalized = win32.normalize(value).replace(/[\\/]+$/u, '');
  if (
    !normalized ||
    normalized.toLowerCase() ===
      win32
        .parse(normalized)
        .root.toLowerCase()
        .replace(/[\\/]+$/u, '')
  ) {
    throw new Error(`${label} cannot be a drive root.`);
  }
  return normalized;
}

function absoluteExecutable(value: string) {
  if (
    !win32.isAbsolute(value) ||
    value.includes('\0') ||
    win32.extname(value).toLowerCase() !== '.exe'
  ) {
    throw new Error('Candidate source must be an absolute Windows .exe path.');
  }
  return win32.normalize(value);
}

function sameOrInside(root: string, candidate: string) {
  const relative = win32.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${win32.sep}`) &&
      relative !== '..' &&
      !win32.isAbsolute(relative))
  );
}

function verifySeparateRoots(installRoot: string, receiptsRoot: string) {
  if (
    sameOrInside(installRoot, receiptsRoot) ||
    sameOrInside(receiptsRoot, installRoot)
  ) {
    throw new Error(
      'Install and retained-receipt roots must be separate directory trees.',
    );
  }
}

function normalizedVersion(value: string) {
  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error('Native host version must be a bounded semantic version.');
  }
  return value;
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizedVersion(left).split('.').map(Number);
  const rightParts = normalizedVersion(right).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

function normalizedSha256(value: string, label: string) {
  const normalized = value.toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${label} must be one SHA-256 digest.`);
  }
  return normalized;
}

function releaseRecord(
  descriptor: NativeHostReleaseDescriptor,
  extensionId: string,
  installRoot: string,
) {
  const version = normalizedVersion(descriptor.version);
  const executableSha256 = normalizedSha256(
    descriptor.executableSha256,
    'Executable digest',
  );
  const signingCertificateSha256 = normalizedSha256(
    descriptor.signingCertificateSha256,
    'Signing certificate fingerprint',
  );
  const executablePath = win32.join(
    installRoot,
    'releases',
    version,
    EXECUTABLE_NAME,
  );
  const manifestPath = win32.join(
    installRoot,
    'manifests',
    version,
    'com.leftout.security.local_guard.json',
  );
  const installPlan = createWindowsNativeHostInstallPlan({
    extensionId,
    executablePath,
    manifestPath,
  });
  return Object.freeze({
    version,
    executableSha256,
    signingCertificateSha256,
    executablePath,
    manifestPath,
    manifest: installPlan.manifest,
  });
}

function lifecycleState(
  extensionId: string,
  current: ReturnType<typeof releaseRecord>,
  previous: ReturnType<typeof releaseRecord> | null,
  receiptsRoot: string,
) {
  return Object.freeze({
    schemaVersion: 'leftout.local-guard-installed-state/1',
    extensionId,
    current,
    previous,
    receiptsRoot,
  });
}

function activateOperations(
  target: ReturnType<typeof releaseRecord>,
  extensionId: string,
  sourcePath: string,
  statePath: string,
  stateAfter: ReturnType<typeof lifecycleState>,
  stage: boolean,
  expectedCurrentManifestPath: string | null,
) {
  const operations: WindowsLifecycleOperation[] = [
    Object.freeze({
      kind: 'verify-hkcu-registration',
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      expectedManifestPath: expectedCurrentManifestPath,
    }),
    Object.freeze({
      kind: 'verify-file-sha256',
      path: sourcePath,
      sha256: target.executableSha256,
    }),
    Object.freeze({
      kind: 'verify-authenticode-certificate',
      path: sourcePath,
      certificateSha256: target.signingCertificateSha256,
    }),
  ];
  if (stage) {
    operations.push(
      Object.freeze({
        kind: 'stage-executable',
        sourcePath,
        destinationPath: target.executablePath,
      }),
    );
  }
  operations.push(
    Object.freeze({
      kind: 'write-host-manifest',
      path: target.manifestPath,
      manifest: target.manifest,
    }),
    Object.freeze({
      kind: 'set-hkcu-registration',
      key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      manifestPath: target.manifestPath,
    }),
    Object.freeze({
      kind: 'probe-native-host',
      extensionOrigin: expectedExtensionOrigin(extensionId),
      timeoutMs: 5_000,
    }),
    Object.freeze({
      kind: 'write-lifecycle-state',
      path: statePath,
      state: stateAfter,
    }),
  );
  return operations;
}

function uniqueReleaseFiles(
  releases: readonly ReturnType<typeof releaseRecord>[],
) {
  return [
    ...new Set(
      releases.flatMap((release) => [
        release.manifestPath,
        release.executablePath,
      ]),
    ),
  ];
}

export function createWindowsNativeHostLifecyclePlan(
  input: WindowsNativeHostLifecycleInput,
) {
  const installRoot = absoluteDirectory(input.installRoot, 'Install root');
  const receiptsRoot = absoluteDirectory(
    input.receiptsRoot,
    'Retained-receipt root',
  );
  verifySeparateRoots(installRoot, receiptsRoot);
  const statePath = win32.join(installRoot, 'state', STATE_FILE_NAME);

  const installed =
    input.action === 'install'
      ? undefined
      : (() => {
          const extensionId = parseExtensionId(input.installed.extensionId);
          const current = releaseRecord(
            input.installed.current,
            extensionId,
            installRoot,
          );
          const previous = input.installed.previous
            ? releaseRecord(input.installed.previous, extensionId, installRoot)
            : null;
          if (previous && previous.version === current.version) {
            throw new Error('Current and previous releases must differ.');
          }
          return Object.freeze({ extensionId, current, previous });
        })();

  let extensionId: string;
  let operations: WindowsLifecycleOperation[];
  let recoveryOperations: WindowsLifecycleOperation[];
  let stateAfter: ReturnType<typeof lifecycleState> | null;
  let failureMode:
    | 'remove-new-binding'
    | 'restore-previous-binding'
    | 'resume-removal';

  if (input.action === 'install') {
    extensionId = parseExtensionId(input.extensionId);
    const target = releaseRecord(input.candidate, extensionId, installRoot);
    const sourcePath = absoluteExecutable(input.candidate.sourceExecutablePath);
    if (
      sameOrInside(installRoot, sourcePath) ||
      sameOrInside(receiptsRoot, sourcePath)
    ) {
      throw new Error(
        'Candidate source must be outside install and retained-receipt roots.',
      );
    }
    stateAfter = lifecycleState(extensionId, target, null, receiptsRoot);
    operations = activateOperations(
      target,
      extensionId,
      sourcePath,
      statePath,
      stateAfter,
      true,
      null,
    );
    recoveryOperations = [
      Object.freeze({
        kind: 'remove-hkcu-registration',
        key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      }),
      ...uniqueReleaseFiles([target]).map((path) =>
        Object.freeze({ kind: 'remove-file' as const, path }),
      ),
      Object.freeze({ kind: 'remove-file', path: statePath }),
    ];
    failureMode = 'remove-new-binding';
  } else if (input.action === 'update') {
    if (!installed) throw new Error('Installed state is required.');
    extensionId = installed.extensionId;
    const target = releaseRecord(input.candidate, extensionId, installRoot);
    if (compareVersions(target.version, installed.current.version) <= 0) {
      throw new Error(
        'Update candidate must be newer than the installed release.',
      );
    }
    const sourcePath = absoluteExecutable(input.candidate.sourceExecutablePath);
    if (
      sameOrInside(installRoot, sourcePath) ||
      sameOrInside(receiptsRoot, sourcePath)
    ) {
      throw new Error(
        'Candidate source must be outside install and retained-receipt roots.',
      );
    }
    stateAfter = lifecycleState(
      extensionId,
      target,
      installed.current,
      receiptsRoot,
    );
    operations = activateOperations(
      target,
      extensionId,
      sourcePath,
      statePath,
      stateAfter,
      true,
      installed.current.manifestPath,
    );
    if (installed.previous) {
      operations.push(
        ...uniqueReleaseFiles([installed.previous]).map((path) =>
          Object.freeze({ kind: 'remove-file' as const, path }),
        ),
      );
    }
    const restoreState = lifecycleState(
      extensionId,
      installed.current,
      installed.previous,
      receiptsRoot,
    );
    recoveryOperations = [
      Object.freeze({
        kind: 'set-hkcu-registration',
        key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
        manifestPath: installed.current.manifestPath,
      }),
      Object.freeze({
        kind: 'write-lifecycle-state',
        path: statePath,
        state: restoreState,
      }),
      ...uniqueReleaseFiles([target]).map((path) =>
        Object.freeze({ kind: 'remove-file' as const, path }),
      ),
    ];
    failureMode = 'restore-previous-binding';
  } else if (input.action === 'rollback') {
    if (!installed?.previous) {
      throw new Error('Rollback requires one exact retained previous release.');
    }
    extensionId = installed.extensionId;
    const target = installed.previous;
    stateAfter = lifecycleState(
      extensionId,
      target,
      installed.current,
      receiptsRoot,
    );
    operations = activateOperations(
      target,
      extensionId,
      target.executablePath,
      statePath,
      stateAfter,
      false,
      installed.current.manifestPath,
    );
    const restoreState = lifecycleState(
      extensionId,
      installed.current,
      installed.previous,
      receiptsRoot,
    );
    recoveryOperations = [
      Object.freeze({
        kind: 'set-hkcu-registration',
        key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
        manifestPath: installed.current.manifestPath,
      }),
      Object.freeze({
        kind: 'write-lifecycle-state',
        path: statePath,
        state: restoreState,
      }),
    ];
    failureMode = 'restore-previous-binding';
  } else {
    if (!installed) throw new Error('Installed state is required.');
    extensionId = installed.extensionId;
    const releases = [
      installed.current,
      ...(installed.previous ? [installed.previous] : []),
    ];
    operations = [
      Object.freeze({
        kind: 'verify-hkcu-registration',
        key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
        expectedManifestPath: installed.current.manifestPath,
      }),
      Object.freeze({
        kind: 'remove-hkcu-registration',
        key: WINDOWS_NATIVE_HOST_REGISTRY_KEY,
      }),
      Object.freeze({ kind: 'revoke-all-sessions' }),
      Object.freeze({ kind: 'stop-native-host' }),
      ...uniqueReleaseFiles(releases).map((path) =>
        Object.freeze({ kind: 'remove-file' as const, path }),
      ),
      Object.freeze({ kind: 'remove-file', path: statePath }),
    ];
    stateAfter = null;
    recoveryOperations = [];
    failureMode = 'resume-removal';
  }

  return Object.freeze({
    schemaVersion: 'leftout.local-guard-windows-lifecycle-plan/1' as const,
    action: input.action,
    extensionId,
    installRoot,
    receiptsRoot,
    statePath,
    operations: Object.freeze(operations),
    recoveryOperations: Object.freeze(recoveryOperations),
    stateAfter,
    failurePolicy: Object.freeze({
      mode: failureMode,
      authorityOnFailure: 'closed' as const,
      automaticRetry: false as const,
    }),
    claims: Object.freeze({
      planMutatesSystem: false as const,
      executionMutatesSystem: true as const,
      actionTimeAuthorizationRequired: true as const,
      exactStoreExtensionIdRequired: true as const,
      verifiedAuthenticodeCandidateRequired: true as const,
      retainedReceiptsPreserved: true as const,
      executorImplemented: false as const,
    }),
  });
}
